import type { AnimGroup, Asset, StylePatch } from './types'
import type { LayoutSpec } from './lib/layout/types'
import { parseSvgDocument } from './lib/svg-doc'
import { solveLayout } from './lib/layout/engine'
import { assetCardHeight } from './lib/asset-card'
import { createProject, elementIndexOf, normalizeProject } from './lib/project'
import { bitmapFileToSvg, cleanName, dataUrlToSvg, isBitmapFile, isSvgFile, looksLikeSvg } from './lib/import'
import type { StudioSelection } from './lib/studio'
import {
  applyAssetChanges, assetChanges, emptyHistory, HISTORY_LIMIT, packHistoryState,
  sameAsset, sameValue, unpackHistoryState, type AssetVersion, type StoredHistoryState,
} from './lib/history'

const DB_NAME = 'mg-svg-studio'
const DB_STORE = 'assets'
const DB_META_STORE = 'meta'
const DB_VERSION_STORE = 'versions'
const DB_VERSION = 3
const ACTIVE_PROJECT_KEY = 'active-project'
const ACTIVE_WORKSPACE_KEY = 'active-workspace'
const WORKSPACE_LINKS_KEY = 'workspace-links'
const workspaceKey = (id: string) => `workspace:${id}`
const workspaceStampKey = (id: string) => `workspace-stamp:${id}`

type StoredProjectLink = {
  fileName: string | null
  projectName: string
  handle: FileSystemFileHandle | null
  url: string | null
  fileSnapshot: string | null
  projectDirty: boolean
  fileKey?: string
}

type StoredWorkspace = StoredProjectLink & StoredHistoryState & { stamp?: string }
type WorkspaceSession = { id: string; stamp: string | null }
type WorkspaceLink = Pick<StoredProjectLink, 'handle' | 'url' | 'fileKey'>

export interface AssetVersionRecord {
  id: string
  assetId: string
  index: number
  createdAt: number
  label?: string
  svg: string
  width: number
  height: number
}

/** 某个素材的全部历史版本，按 index 从新到旧 */
async function dbListVersions(assetId: string): Promise<AssetVersionRecord[]> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_VERSION_STORE, 'readonly')
      const req = tx.objectStore(DB_VERSION_STORE).index('assetId').getAll(IDBKeyRange.only(assetId))
      req.onsuccess = () => resolve((req.result as AssetVersionRecord[]).sort((a, b) => b.index - a.index))
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

async function dbPutVersion(record: AssetVersionRecord): Promise<void> {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_VERSION_STORE, 'readwrite')
    tx.objectStore(DB_VERSION_STORE).put(record)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

async function dbDeleteVersions(assetId: string): Promise<void> {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_VERSION_STORE, 'readwrite')
      const req = tx.objectStore(DB_VERSION_STORE).index('assetId').openCursor(IDBKeyRange.only(assetId))
      req.onsuccess = () => {
        const cursor = req.result
        if (!cursor) return
        cursor.delete()
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch {
    /* 版本清理失败不阻断删除 */
  }
}

function uid(prefix = 'a') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

let database: Promise<IDBDatabase> | undefined

function openDB() {
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(DB_META_STORE)) db.createObjectStore(DB_META_STORE)
      if (!db.objectStoreNames.contains(DB_VERSION_STORE)) {
        const store = db.createObjectStore(DB_VERSION_STORE, { keyPath: 'id' })
        store.createIndex('assetId', 'assetId')
      }
    }
    req.onsuccess = () => {
      const db = req.result
      const reset = () => { database = undefined }
      db.onversionchange = () => {
        db.close()
        reset()
      }
      db.onclose = reset
      resolve(db)
    }
    req.onerror = () => reject(req.error)
  }).catch((error) => {
    database = undefined
    throw error
  })
  return database
}

async function dbGetMeta<T>(key: string): Promise<T | null> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_META_STORE, 'readonly')
      const req = tx.objectStore(DB_META_STORE).get(key)
      req.onsuccess = () => resolve((req.result || null) as T | null)
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('读取项目关联失败', err)
    return null
  }
}

async function fingerprint(fileName: string | undefined, text: string) {
  if (!fileName || !globalThis.crypto?.subtle) return undefined
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  return `${fileName}:${hash}`
}

async function dbFindWorkspace({ handle, url, fileKey }: Partial<WorkspaceLink>) {
  if (!handle && !url && !fileKey) return null
  const links = await dbGetMeta<Record<string, WorkspaceLink>>(WORKSPACE_LINKS_KEY)
  for (const [id, link] of Object.entries(links ?? {}).reverse()) {
    if ((url && url === link.url) || (fileKey && fileKey === link.fileKey)) return id
    if (handle && link.handle && await handle.isSameEntry(link.handle).catch(() => false)) return id
  }
  return null
}

async function dbPutWorkspace(id: string, workspace: StoredWorkspace, previousStamp: string | null) {
  const db = await openDB()
  return await new Promise<'saved' | 'conflict'>((resolve, reject) => {
    const tx = db.transaction(DB_META_STORE, 'readwrite')
    const meta = tx.objectStore(DB_META_STORE)
    const stampKey = workspaceStampKey(id)
    const current = meta.get(stampKey)
    let result: 'saved' | 'conflict' = 'conflict'
    let failure: unknown
    const writeIfUnchanged = (stamp: string | null) => {
      if (stamp !== previousStamp) return
      const links = meta.get(WORKSPACE_LINKS_KEY)
      links.onsuccess = () => {
        try {
          const index = (links.result ?? {}) as Record<string, WorkspaceLink>
          const { handle, url, fileKey } = workspace
          // 最新写入的同源草稿优先匹配，较早的草稿仍保留。
          delete index[id]
          if (handle || url || fileKey) index[id] = { handle, url, fileKey }
          meta.put(index, WORKSPACE_LINKS_KEY)
          meta.put(workspace, workspaceKey(id))
          meta.put(workspace.stamp, stampKey)
          meta.put(id, ACTIVE_WORKSPACE_KEY)
          result = 'saved'
        } catch (error) {
          failure = error
          tx.abort()
        }
      }
    }
    current.onsuccess = () => {
      if (current.result != null) {
        writeIfUnchanged(current.result)
      } else {
        // 早期记录只在项目快照中保存版本号。
        const legacy = meta.get(workspaceKey(id))
        legacy.onsuccess = () => writeIfUnchanged(legacy.result?.stamp ?? null)
      }
    }
    tx.oncomplete = () => resolve(result)
    tx.onabort = () => reject(failure ?? tx.error)
  })
}

function workspaceErrorMessage(error: unknown) {
  if ((error as DOMException)?.name === 'QuotaExceededError') {
    return '本机存储空间不足。请先导出项目副本。'
  }
  return '本机存储写入失败。请重试保存，或导出项目副本。'
}

async function ensureFilePermission(handle: FileSystemFileHandle, mode: 'read' | 'readwrite', request = true) {
  const permissionHandle = handle as FileSystemFileHandle & {
    queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>
    requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>
  }
  if (!permissionHandle.queryPermission || !permissionHandle.requestPermission) return
  if (await permissionHandle.queryPermission({ mode }) === 'granted') return
  if (!request) throw new Error('本地文件写入权限已失效，请按 Ctrl+S 重新授权')
  if (await permissionHandle.requestPermission({ mode }) !== 'granted') {
    throw new Error('浏览器尚未授予本地文件权限，请在保存时允许访问该文件')
  }
}

async function dbAll(): Promise<Asset[]> {
  try {
    const db = await openDB()
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly')
      const req = tx.objectStore(DB_STORE).getAll()
      req.onsuccess = () => resolve((req.result || []) as Asset[])
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('读本地库失败', err)
    return []
  }
}

const SAMPLE_META = [
  { file: 'cyber-pikachu.svg', name: '赛博搬砖 · 开场动效', desc: '逐字落位 / 画出 / 呼吸' },
  { file: 'grid-bg.svg', name: '深色网格 · 视频背景', desc: '静态 16:9 背景' },
  { file: 'two-paths.svg', name: '两条追责路径 · 信息图', desc: '静态长图排版' },
]

export const BOARD_MAX_W = 560
export const BOARD_MAX_H = 380
export const LABEL_H = 26
export const GAP = 90

export type ArrangeSettings = {
  order: 'nearby' | 'top-left' | 'created'
  mode: 'grid' | 'row' | 'column'
  cols: number
  gap: number
}

export const DEFAULT_ARRANGE_SETTINGS: ArrangeSettings = {
  order: 'nearby', mode: 'grid', cols: 1, gap: GAP,
}

function readArrangeSettings(): ArrangeSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('mg-arrange-settings') || 'null')
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_ARRANGE_SETTINGS }
    return {
      order: ['nearby', 'top-left', 'created'].includes(saved.order) ? saved.order : DEFAULT_ARRANGE_SETTINGS.order,
      mode: ['grid', 'row', 'column'].includes(saved.mode) ? saved.mode : DEFAULT_ARRANGE_SETTINGS.mode,
      cols: Math.max(1, Math.min(12, Math.round(Number(saved.cols) || DEFAULT_ARRANGE_SETTINGS.cols))),
      gap: Math.max(0, Math.min(500, Number.isFinite(Number(saved.gap)) ? Number(saved.gap) : DEFAULT_ARRANGE_SETTINGS.gap)),
    }
  } catch {
    return { ...DEFAULT_ARRANGE_SETTINGS }
  }
}

export function cellSize(asset: Pick<Asset, 'width' | 'height' | 'videoCopy'>) {
  const fit = Math.min(BOARD_MAX_W / Math.max(1, asset.width), BOARD_MAX_H / Math.max(1, asset.height), 1)
  return { w: Math.max(80, asset.width * fit), h: assetCardHeight(Math.max(60, asset.height * fit), asset.videoCopy) }
}

/**
 * 画布上的素材排布同样交给布局内核：
 * 变体先组成水平素材组，布局内核再排列各组；默认一列便于纵向浏览素材。
 */
function orderedAssets(assets: Asset[], order: ArrangeSettings['order']): Asset[] {
  if (order === 'created') return [...assets].sort((a, b) => a.createdAt - b.createdAt)
  const center = (asset: Asset) => {
    const size = cellSize(asset)
    return { x: asset.x + size.w / 2, y: asset.y + size.h / 2 }
  }
  const stable = (a: Asset, b: Asset) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  if (order === 'top-left') {
    return [...assets].sort((a, b) => a.y - b.y || a.x - b.x || stable(a, b))
  }
  // Greedy nearest-neighbour walk preserves clusters from the current board.
  const remaining = [...assets]
  remaining.sort((a, b) => a.y - b.y || a.x - b.x || stable(a, b))
  const result = [remaining.shift()!]
  while (remaining.length) {
    const from = center(result[result.length - 1])
    let nearest = 0
    let nearestDistance = Infinity
    for (let i = 0; i < remaining.length; i++) {
      const point = center(remaining[i])
      const dx = point.x - from.x
      const dy = point.y - from.y
      const distance = dx * dx + dy * dy
      if (distance < nearestDistance || (distance === nearestDistance && stable(remaining[i], remaining[nearest]) < 0)) {
        nearest = i
        nearestDistance = distance
      }
    }
    result.push(remaining.splice(nearest, 1)[0])
  }
  return result
}

export function autoLayout(assets: Asset[], settings: ArrangeSettings = DEFAULT_ARRANGE_SETTINGS): Asset[] {
  if (!assets.length) return assets
  const ordered = orderedAssets(assets, settings.order)
  const items = ordered.map((asset) => {
    const size = cellSize(asset)
    return { id: asset.id, width: size.w, height: size.h }
  })
  const { boxes } = solveLayout(items, {
    mode: settings.mode,
    cols: settings.cols,
    gap: settings.gap,
    rowGap: settings.gap + LABEL_H,
    wrap: settings.mode === 'row',
    alignX: 'start',
    alignY: 'start',
  })
  const byId = new Map(boxes.map((box) => [box.id, box]))
  return assets.map((asset) => {
    const box = byId.get(asset.id)
    return box ? { ...asset, x: box.x, y: box.y } : asset
  })
}

export class Store {
  assets: Asset[] = []
  selection: StudioSelection = {}
  selectedGroupId: string | null = null
  multiSelect: string[] = []
  zoom = 1
  grid = true
  arrangeSettings: ArrangeSettings = readArrangeSettings()
  projectName = '未命名素材库'
  projectFileName: string | null = null
  projectHandle: FileSystemFileHandle | null = null
  projectUrl: string | null = null
  projectDirty = false
  projectVersion = 0
  inspectorFocusVersion = 0
  private projectRevision = 0
  private fileSnapshot: string | null = null
  private fileKey: string | undefined
  private fileTaskInProgress = false
  private workspaceTimer: ReturnType<typeof setTimeout> | null = null
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  private workspace: WorkspaceSession = { id: uid('p'), stamp: null }
  private workspaceWrite: Promise<void> = Promise.resolve()
  private persistent = true
  private savedAssets: Asset[] | null = null
  private history = emptyHistory()
  private historyEditKey: string | undefined
  private historyEditTime = 0
  historyScope: string | null = null
  workspaceSaveError: string | null = null
  fileSaveError: string | null = null
  lastAddedId: string | null = null
  leftOpen = typeof window === 'undefined' || window.innerWidth > 600
  rightOpen = false
  /** 评审标注是否叠在画布上 */
  reviewOverlay = typeof localStorage !== 'undefined' && localStorage.getItem('mg-review-overlay') === '1'
  /** 当前聚焦的评审规则（卡片 + 画布标注同步高亮） */
  reviewFocus: string | null = null
  /** 外部请求打开评审（URL 参数、CLI 触发）；值变化即一次请求 */
  reviewRequest: string | null = null
  /** 栅格校验是否叠在画布上 */
  reviewRaster = typeof localStorage !== 'undefined' && localStorage.getItem('mg-review-raster') === '1'
  theme: 'dark' | 'light' = (typeof localStorage !== 'undefined' && localStorage.getItem('mg-theme') === 'light' ? 'light' : 'dark')
  ready = false
  time = 0
  duration = 0
  loop = true
  private listeners = new Set<() => void>()
  version = 0
  private initStarted = false

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  getSnapshot = () => this.version

  emit() {
    this.version++
    this.listeners.forEach((l) => l())
  }

  async init({ persistent = true } = {}) {
    if (this.initStarted) return
    this.initStarted = true
    this.persistent = persistent
    if (!persistent) {
      this.ready = true
      this.emit()
      return
    }
    const activeId = await dbGetMeta<string>(ACTIVE_WORKSPACE_KEY)
    const workspace = activeId && await dbGetMeta<StoredWorkspace>(workspaceKey(activeId))
    const [stored, link] = workspace
      ? [null, workspace] as const
      : await Promise.all([dbAll(), dbGetMeta<StoredProjectLink>(ACTIVE_PROJECT_KEY)])
    const state = workspace && unpackHistoryState(workspace)
    const assets = state?.assets ?? (stored?.length ? stored.sort((a, b) => a.createdAt - b.createdAt) : await this.seedSamples())
    // ?project= 载入比 init 快时，别再用本地缓存 / 示例把项目盖掉。
    if (!this.projectVersion && !this.projectRevision) {
      if (link) {
        this.projectFileName = link.fileName
        this.projectName = link.projectName || this.projectName
        this.projectHandle = link.handle
        this.projectUrl = link.url
        this.fileSnapshot = link.fileSnapshot
        this.fileKey = link.fileKey
        this.projectDirty = link.projectDirty
      }
      this.assets = assets
      this.history = state?.history ?? emptyHistory()
      if (workspace && activeId) {
        this.workspace = { id: activeId, stamp: workspace.stamp ?? null }
      }
      this.savedAssets = state ? state.savedAssets : this.projectDirty ? null : assets
      if (assets.length) this.selection = { assetId: assets[0].id }
      if (!workspace) this.scheduleWorkspaceSave()
    }
    this.ready = true
    this.emit()
  }

  private async seedSamples(): Promise<Asset[]> {
    const assets: Asset[] = []
    for (const meta of SAMPLE_META) {
      try {
        const res = await fetch(`${import.meta.env.BASE_URL}samples/${meta.file}`)
        if (!res.ok) continue
        const svg = await res.text()
        const asset = this.buildAsset(svg, meta.name, 'sample')
        assets.push(asset)
      } catch (err) {
        console.warn('载入示例失败', meta.file, err)
      }
    }
    return autoLayout(assets)
  }

  buildAsset(svg: string, name: string, source: Asset['source'] = 'import'): Asset {
    const doc = parseSvgDocument(svg)
    const id = uid()
    const groups = doc.groups.map((g, i) => ({ ...g, id: `${id}_g${i}` }))
    return {
      id,
      name,
      svg,
      width: doc.width || 1920,
      height: doc.height || 1080,
      kind: groups.length ? 'animated' : 'static',
      groups,
      elements: elementIndexOf(doc),
      videoCopy: '',
      overrides: {},
      layouts: {},
      warnings: doc.warnings,
      source,
      x: 0,
      y: 0,
      createdAt: Date.now(),
      version: 1,
    }
  }

  /** 导入文件：SVG 原样解析，位图（PNG/JPEG/…）包成 SVG 后走同一条管线 */
  async importFiles(files: FileList | File[]) {
    const projectVersion = this.projectVersion
    const list = Array.from(files)
    const created: Asset[] = []
    for (const file of list) {
      try {
        if (isSvgFile(file)) {
          const text = await file.text()
          created.push(this.buildAsset(text, cleanName(file.name), 'import'))
        } else if (isBitmapFile(file)) {
          const svg = await bitmapFileToSvg(file)
          created.push(this.buildAsset(svg, cleanName(file.name), 'import'))
        }
      } catch (err) {
        console.error('导入失败', file.name, err)
        alert(`导入失败：${file.name}\n${(err as Error).message}`)
      }
    }
    if (!created.length) return
    if (this.projectVersion !== projectVersion) return
    const base = autoLayout([...this.assets, ...created], this.arrangeSettings).slice(this.assets.length)
    const last = base[base.length - 1]
    this.selection = { assetId: last.id }
    this.multiSelect = []
    this.selectedGroupId = null
    this.lastAddedId = last.id
    this.commitAssets(base.length === 1 ? '导入素材' : '批量导入素材', [...this.assets, ...base])
  }

  /** 从剪贴板粘贴：图片文件 / image/svg+xml / SVG 源码文本 / data:image URL */
  async pasteFromClipboard(data: DataTransfer | null): Promise<number> {
    if (!data) return 0
    const files: File[] = Array.from(data.files || [])
    if (!files.length && data.items) {
      for (const item of Array.from(data.items)) {
        if (item.kind !== 'file') continue
        const file = item.getAsFile()
        if (file) files.push(file)
      }
    }
    if (files.length) {
      await this.importFiles(files)
      return files.length
    }
    const text = (data.getData('text/plain') || '').trim()
    if (text && looksLikeSvg(text)) {
      await this.addSvgText(text, '粘贴的 SVG')
      return 1
    }
    if (text && /^data:image\//i.test(text)) {
      const projectVersion = this.projectVersion
      const svg = await dataUrlToSvg(text)
      if (projectVersion !== this.projectVersion) return 0
      await this.addSvgText(svg, '粘贴的图片')
      return 1
    }
    return 0
  }

  async addSvgText(text: string, name: string) {
    const asset = this.buildAsset(text, name, 'import')
    // 只给新素材找位置，不动已有素材：排在现有内容最右侧，顶对齐。
    // 想要整板重排时，走「整理画布」显式触发。
    if (this.assets.length) {
      const right = Math.max(...this.assets.map((a) => a.x + cellSize(a).w))
      const top = Math.min(...this.assets.map((a) => a.y))
      asset.x = right + this.arrangeSettings.gap
      asset.y = top
    }
    this.selection = { assetId: asset.id }
    this.multiSelect = []
    this.selectedGroupId = null
    this.lastAddedId = asset.id
    this.commitAssets('粘贴素材', [...this.assets, asset])
  }

  async removeAsset(id: string) {
    const pending = this.pendingVersions.get(id)
    if (pending) {
      clearTimeout(pending)
      this.pendingVersions.delete(id)
    }
    this.commitAssets('删除素材', this.assets.filter((asset) => asset.id !== id))
    await dbDeleteVersions(id)
  }

  async duplicateAsset(id: string) {
    const src = this.assets.find((asset) => asset.id === id)
    if (!src) return
    const copy: Asset = {
      ...src,
      id: uid(),
      name: `${src.name} 副本`,
      createdAt: Date.now(),
      x: src.x + 40,
      y: src.y + 40,
    }
    this.selection = { assetId: copy.id }
    this.multiSelect = []
    this.selectedGroupId = null
    this.commitAssets('复制素材', [...this.assets, copy])
  }

  /** 把当前素材记为一个版本；历史只追加，不覆盖旧版本 */
  async commitVersion(assetId: string, label?: string): Promise<AssetVersionRecord | null> {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return null
    const existing = await dbListVersions(assetId)
    const index = (existing[0]?.index ?? 0) + 1
    const record: AssetVersionRecord = {
      id: `${assetId}:${index}`,
      assetId,
      index,
      createdAt: Date.now(),
      label,
      svg: asset.svg,
      width: asset.width,
      height: asset.height,
    }
    await dbPutVersion(record)
    this.editAsset(assetId, '记录版本', () => ({ revision: { index, createdAt: record.createdAt, label } }))
    return record
  }

  listVersions(assetId: string) {
    return dbListVersions(assetId)
  }

  /** 删掉指定的历史版本（清理重复用），并把 revision 指向剩下的最新一版 */
  async deleteVersions(assetId: string, versionIds: string[]) {
    if (!versionIds.length) return 0
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_VERSION_STORE, 'readwrite')
      const store = tx.objectStore(DB_VERSION_STORE)
      for (const id of versionIds) store.delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    const left = await dbListVersions(assetId)
    this.editAsset(assetId, '清理版本', () => ({
      revision: left[0] ? { index: left[0].index, createdAt: left[0].createdAt } : undefined,
    }))
    return versionIds.length
  }

  /** 把若干独立素材并进目标素材的版本历史，然后删掉这些素材 */
  async mergeAsVersions(targetId: string, sourceIds: string[]) {
    const target = this.assets.find((a) => a.id === targetId)
    if (!target) throw new Error('目标素材不存在')
    const sources = sourceIds
      .map((id) => this.assets.find((a) => a.id === id))
      .filter((a): a is Asset => Boolean(a))
      .sort((a, b) => a.createdAt - b.createdAt)
    if (!sources.length) throw new Error('没有可合并的素材')
    const existing = await dbListVersions(targetId)
    let index = existing[0]?.index ?? 0
    for (const source of sources) {
      index += 1
      await dbPutVersion({
        id: `${targetId}:${index}`,
        assetId: targetId,
        index,
        createdAt: source.createdAt,
        label: source.name,
        svg: source.svg,
        width: source.width,
        height: source.height,
      })
    }
    const ids = new Set(sourceIds)
    this.commitAssets('合并为版本', this.assets.filter((a) => !ids.has(a.id)))
    for (const id of sourceIds) await dbDeleteVersions(id)
    this.editAsset(targetId, '更新版本序号', () => ({ revision: { index, createdAt: Date.now() } }))
    return { index, merged: sources.length }
  }

  /** 从历史版本恢复：以旧版为底追加一个新版本，历史不回退 */
  async restoreVersion(assetId: string, versionId: string) {
    const record = (await dbListVersions(assetId)).find((v) => v.id === versionId)
    if (!record) throw new Error('找不到这个版本')
    const asset = this.assets.find((a) => a.id === assetId)
    // 重新解析 SVG：元素索引、分组、警告都要跟着换，否则样式覆盖会对不上旧 id
    const doc = parseSvgDocument(record.svg)
    const groups = doc.groups.map((g, i) => ({ ...g, id: `${assetId}_g${i}` }))
    this.restoring = true
    try {
      this.editAsset(assetId, `恢复自版本 ${record.index}`, () => ({
        svg: record.svg,
        width: doc.width || record.width || asset?.width || 1920,
        height: doc.height || record.height || asset?.height || 1080,
        kind: groups.length ? 'animated' : 'static',
        groups,
        elements: elementIndexOf(doc),
        warnings: doc.warnings,
        overrides: {},
        layouts: {},
        review: undefined,
        agentReview: undefined,
        revision: { index: record.index, createdAt: record.createdAt, label: record.label },
      }))
    } finally {
      this.restoring = false
    }
  }

  async renameAsset(id: string, name: string) {
    this.editAsset(id, '重命名素材', () => ({ name }), `${id}:name`)
  }

  setVideoCopy(id: string, videoCopy: string) {
    const current = this.assets.find((asset) => asset.id === id)
    if (!current) return
    const becameVisible = !current.videoCopy?.trim() && !!videoCopy.trim()
    let assets = this.assets.map((asset) => asset.id === id ? { ...asset, videoCopy } : asset)
    if (becameVisible) assets = this.pushDownVideoCopyOverlaps(assets, id)
    this.commitAssets('编辑视频文案', assets, `${id}:video-copy`)
  }

  setVoiceoverAudio(id: string, voiceoverAudio?: string) {
    this.editAsset(id, voiceoverAudio ? '保存视频录音' : '删除视频录音', () => ({ voiceoverAudio }), `${id}:voiceover`)
  }

  private pushDownVideoCopyOverlaps(assets: Asset[], expandedId: string) {
    const next = new Map(assets.map((asset) => [asset.id, asset]))
    const queue = [expandedId]
    const checked = new Map<string, number>()
    const labelHeight = LABEL_H
    const labelGap = 8

    while (queue.length) {
      const blockerId = queue.shift()!
      const blocker = next.get(blockerId)
      if (!blocker) continue
      if (checked.get(blockerId) === blocker.y) continue
      checked.set(blockerId, blocker.y)
      const blockerSize = cellSize(blocker)
      for (const candidate of next.values()) {
        if (candidate.id === blockerId || candidate.y < blocker.y) continue
        const size = cellSize(candidate)
        const overlapsX = candidate.x < blocker.x + blockerSize.w && candidate.x + size.w > blocker.x
        const labelTop = candidate.y - labelHeight
        const labelBottom = candidate.y + size.h
        const blockerTop = blocker.y - labelHeight
        const blockerBottom = blocker.y + blockerSize.h
        const overlapsY = labelTop < blockerBottom + labelGap && labelBottom > blockerTop
        if (!overlapsX || !overlapsY) continue
        const y = blockerBottom + labelGap + labelHeight
        if (y > candidate.y) {
          next.set(candidate.id, { ...candidate, y })
          queue.push(candidate.id)
        }
      }
    }

    return assets.map((asset) => next.get(asset.id)!)
  }

  private editAsset(id: string, label: string, update: (asset: Asset) => Partial<Asset>, editKey?: string) {
    const asset = this.assets.find((item) => item.id === id)
    if (!asset) return
    this.commitAssets(label, this.assets.map((item) => item === asset ? { ...asset, ...update(asset) } : item), editKey)
  }

  private commitAssets(label: string, assets: Asset[], editKey?: string) {
    if (this.recordHistory(label, assets, editKey)) {
      this.scheduleVersions(assets)
      this.applyAssets(assets)
    }
  }

  private pendingVersions = new Map<string, ReturnType<typeof setTimeout>>()

  /** 只有内容变了才记版本：拖位置、改名、排布都不算；同一素材 1.5 秒内合并成一次 */
  private restoring = false

  private scheduleVersions(next: Asset[]) {
    if (this.restoring) return
    for (const asset of next) {
      const previous = this.assets.find((item) => item.id === asset.id)
      if (!previous) continue
      const contentChanged =
        previous.svg !== asset.svg ||
        previous.width !== asset.width ||
        previous.height !== asset.height ||
        !sameValue(previous.overrides, asset.overrides) ||
        !sameValue(previous.layouts, asset.layouts)
      if (!contentChanged) continue
      const pending = this.pendingVersions.get(asset.id)
      if (pending) clearTimeout(pending)
      this.pendingVersions.set(asset.id, setTimeout(() => {
        this.pendingVersions.delete(asset.id)
        void this.commitVersion(asset.id)
      }, 1500))
    }
  }

  private recordHistory(label: string, assets: Asset[], editKey?: string) {
    const changes = assetChanges(this.assets, assets)
    if (!changes.length) return false
    const { entries, undo, redo } = this.history
    const previous = entries[entries.length - 1]
    const time = Date.now()
    const merge = editKey && editKey === this.historyEditKey && time - this.historyEditTime < 800 &&
      previous?.id === undo[undo.length - 1] && !redo.length && changes.length === 1 &&
      previous.changes.length === 1 && previous.changes[0].id === changes[0].id

    if (merge) {
      const [change] = changes
      const before = previous.changes[0].before
      if (before && change.after && sameAsset(before.asset, change.after.asset)) {
        this.history = { entries: entries.slice(0, -1), undo: undo.slice(0, -1), redo: [] }
      } else {
        this.history = {
          entries: [...entries.slice(0, -1), { ...previous, time, changes: [{ ...change, before }] }],
          undo,
          redo: [],
        }
      }
    } else {
      const id = uid('h')
      const next = [...entries, { id, label, time, changes }]
      const evicted = next.length > HISTORY_LIMIT ? next.shift() : undefined
      this.history = { entries: next, undo: [...undo.filter((item) => item !== evicted?.id), id], redo: [] }
    }
    this.historyEditKey = editKey
    this.historyEditTime = time
    return true
  }

  private applyAssets(assets: Asset[]) {
    this.assets = assets
    const selected = this.selectedAsset
    if (!selected) {
      this.selection = {}
      this.multiSelect = []
    } else if (selected.elements?.length) {
      const ids = new Set(selected.elements.map((element) => element.id))
      if (this.selection.elementId && !ids.has(this.selection.elementId)) this.selection = { assetId: selected.id }
      this.multiSelect = this.multiSelect.filter((id) => ids.has(id))
    }
    if (this.selectedGroupId && !selected?.groups.some((group) => group.id === this.selectedGroupId)) this.selectedGroupId = null
    if (this.lastAddedId && !assets.some((asset) => asset.id === this.lastAddedId)) this.lastAddedId = null
    this.markProjectDirty()
    this.emit()
  }

  private isDirty(assets = this.savedAssets) {
    return !assets || assets.length !== this.assets.length ||
      this.assets.some((asset, i) => !sameAsset(asset, assets[i], true))
  }

  private markProjectDirty() {
    this.projectDirty = this.isDirty()
    this.projectRevision++
    this.scheduleWorkspaceSave()
  }

  get historyEntries() { return this.history.entries }
  get undoEntries() { return this.history.undo }
  get redoEntries() { return this.history.redo }
  get canUndo() { return this.history.undo.length > 0 }
  get canRedo() { return this.history.redo.length > 0 }

  showHistory(assetId = '') {
    this.endHistoryEdit()
    this.historyScope = assetId
    this.emit()
  }

  closeHistory() {
    this.historyScope = null
    this.emit()
  }

  endHistoryEdit() {
    this.historyEditKey = undefined
  }

  undo() { this.stepHistory('undo') }
  redo() { this.stepHistory('redo') }

  private stepHistory(direction: 'undo' | 'redo') {
    const source = this.history[direction]
    const id = source[source.length - 1]
    const entry = this.history.entries.find((item) => item.id === id)
    if (!entry) return
    const other = direction === 'undo' ? 'redo' : 'undo'
    this.history = { ...this.history, [direction]: source.slice(0, -1), [other]: [...this.history[other], id] }
    this.endHistoryEdit()
    this.applyAssets(applyAssetChanges(this.assets, entry.changes, direction === 'undo' ? 'before' : 'after'))
  }

  restoreAssetVersion(version: AssetVersion) {
    const { asset, index } = version
    const current = this.assets.find((item) => item.id === asset.id)
    const assets = current
      ? this.assets.map((item) => item === current ? { ...asset, review: current.review } : item)
      : [...this.assets.slice(0, index), asset, ...this.assets.slice(index)]
    this.commitAssets('恢复素材版本', assets)
  }

  restoreElementVersion(assetId: string, elementId: string, version: Asset) {
    this.editAsset(assetId, '恢复元素样式和布局', (asset) => {
      if (asset.id !== version.id || asset.svg !== version.svg) return {}
      const overrides = { ...asset.overrides }
      const layouts = { ...asset.layouts }
      const style = version.overrides[elementId]
      const layout = version.layouts?.[elementId]
      if (style) overrides[elementId] = style
      else delete overrides[elementId]
      if (layout) layouts[elementId] = layout
      else delete layouts[elementId]
      return { overrides, layouts }
    })
  }

  updateSelection(sel: StudioSelection, focusInspector = false) {
    if (sel.elementId || (focusInspector && sel.assetId)) {
      this.rightOpen = true
      this.inspectorFocusVersion++
    }
    if (sel.assetId !== this.selection.assetId) {
      this.selectedGroupId = null
      this.multiSelect = []
    }
    this.selection = sel
    this.emit()
  }

  selectAsset(id: string) {
    this.selection = { assetId: id }
    this.selectedGroupId = null
    this.emit()
  }

  selectElement(assetId: string, elementId?: string) {
    this.selection = { assetId, elementId }
    if (elementId) {
      this.rightOpen = true
      this.inspectorFocusVersion++
    }
    this.emit()
  }

  toggleMultiSelect(id: string) {
    let base = this.multiSelect
    if (!base.length && this.selection.elementId && this.selection.elementId !== id) {
      base = [this.selection.elementId]
    }
    this.multiSelect = base.includes(id) ? base.filter((x) => x !== id) : [...base, id]
    this.emit()
  }

  clearMultiSelect() {
    if (!this.multiSelect.length) return
    this.multiSelect = []
    this.emit()
  }

  setMultiSelect(ids: string[]) {
    this.multiSelect = ids
    this.emit()
  }

  selectGroup(id: string | null) {
    this.selectedGroupId = id
    this.emit()
  }

  moveBoard(id: string, x: number, y: number) {
    this.editAsset(id, '移动画板', () => ({ x, y }))
  }

  setZoom(z: number) {
    this.zoom = z
    this.emit()
  }

  setLoop(v: boolean) {
    this.loop = v
    this.emit()
  }

  setGrid(v: boolean) {
    this.grid = v
    this.emit()
  }

  setLeftOpen(v: boolean) {
    this.leftOpen = v
    this.emit()
  }

  setRightOpen(v: boolean) {
    this.rightOpen = v
    this.emit()
  }

  setReviewOverlay(v: boolean) {
    this.reviewOverlay = v
    try {
      localStorage.setItem('mg-review-overlay', v ? '1' : '0')
    } catch {}
    this.emit()
  }

  setReviewRaster(v: boolean) {
    this.reviewRaster = v
    try {
      localStorage.setItem('mg-review-raster', v ? '1' : '0')
    } catch {}
    this.emit()
  }

  requestReview(target: string | null) {
    this.reviewRequest = target ? `${target}@${Date.now()}` : null
    this.emit()
  }

  focusReviewRule(ruleId: string | null) {
    this.reviewFocus = this.reviewFocus === ruleId ? null : ruleId
    this.emit()
  }

  setReviewFocus(ruleId: string | null) {
    if (this.reviewFocus === ruleId) return
    this.reviewFocus = ruleId
    this.emit()
  }

  setTheme(theme: 'dark' | 'light') {
    this.theme = theme
    try {
      localStorage.setItem('mg-theme', theme)
    } catch {}
    this.emit()
  }

  setTransport(time: number, duration: number) {
    this.time = time
    this.duration = duration
    this.emit()
  }

  /** 评审跑完把快照挂到素材上：随项目保存，CLI 与 Agent 直接读 */
  setAssetReview(assetId: string, snapshot: import('./lib/review/types').ReviewSnapshot) {
    const asset = this.assets.find((item) => item.id === assetId)
    if (!asset || sameValue(asset.review, snapshot)) return
    this.applyAssets(this.assets.map((item) => item === asset ? { ...asset, review: snapshot } : item))
  }

  setAssetAgentReview(assetId: string, snapshot?: import('./lib/review/types').AgentReviewSnapshot) {
    const asset = this.assets.find((item) => item.id === assetId)
    if (!asset || sameValue(asset.agentReview, snapshot)) return
    this.applyAssets(this.assets.map((item) => item === asset ? { ...asset, agentReview: snapshot } : item))
  }

  async updateElementStyle(assetId: string, elementId: string, patch: StylePatch) {
    if (!Object.keys(patch).length) return
    this.editAsset(assetId, '修改元素样式', (asset) => ({
      overrides: { ...asset.overrides, [elementId]: { ...asset.overrides[elementId], ...patch } },
    }), `${assetId}:${elementId}:style:${Object.keys(patch).sort().join(',')}`)
  }

  async resetElementStyle(assetId: string, elementId: string) {
    this.editAsset(assetId, '重置元素样式', (asset) => {
      const overrides = { ...asset.overrides }
      delete overrides[elementId]
      return { overrides }
    })
  }

  /* ------------------------------ 项目文件 ------------------------------ */

  projectJson(): string {
    return JSON.stringify(createProject(this.assets, this.projectName), null, 2) + '\n'
  }

  private projectLinkRecord(): StoredProjectLink {
    return {
      fileName: this.projectFileName,
      projectName: this.projectName,
      handle: this.projectHandle,
      url: this.projectUrl,
      fileSnapshot: this.fileSnapshot,
      projectDirty: this.projectDirty,
      fileKey: this.fileKey,
    }
  }

  private scheduleWorkspaceSave() {
    if (!this.persistent) return
    if (this.workspaceTimer) clearTimeout(this.workspaceTimer)
    this.workspaceTimer = setTimeout(() => void this.flushWorkspace(), 180)
    this.scheduleFileSave()
  }

  private scheduleFileSave() {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer)
    this.autoSaveTimer = null
    if (!this.persistent || !this.projectHandle || !this.projectDirty) return
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null
      if (!this.projectHandle || !this.projectDirty) return
      void this.saveProject({ linkedOnly: true, automatic: true }).catch((error) => {
        const message = (error as Error).message || String(error)
        if (message === '项目文件正在读写，请稍后重试') {
          this.scheduleFileSave()
          return
        }
        this.fileSaveError = message
        this.emit()
      })
    }, 700)
  }

  get workspaceSaveFailed() { return this.workspaceSaveError !== null }

  async flushWorkspace({ retry = false } = {}) {
    if (this.workspaceTimer || retry) {
      if (this.workspaceTimer) clearTimeout(this.workspaceTimer)
      this.workspaceTimer = null
      await this.persistWorkspace()
    } else {
      await this.workspaceWrite
    }
  }

  private async persistWorkspace() {
    if (!this.persistent) return
    const session = this.workspace
    const link = this.projectLinkRecord()
    const { assets, savedAssets, history } = this
    const write = this.workspaceWrite.then(async () => {
      let error: string | null = null
      try {
        const workspace = {
          ...link,
          ...packHistoryState(assets, savedAssets, history),
          stamp: uid('v'),
        }
        const result = await dbPutWorkspace(session.id, workspace, session.stamp)
        if (result === 'conflict') {
          // 会话期间其他页面写入了同一项目，另存当前草稿，保留双方修改。
          const forkId = uid('p')
          if (await dbPutWorkspace(forkId, workspace, null) !== 'saved') {
            throw new Error('无法另存当前本机草稿')
          }
          session.id = forkId
        }
        session.stamp = workspace.stamp
      } catch (cause) {
        console.warn('保存本地项目历史失败', cause)
        error = workspaceErrorMessage(cause)
      }
      if (this.workspace === session && this.workspaceSaveError !== error) {
        this.workspaceSaveError = error
        this.emit()
      }
    })
    this.workspaceWrite = write
    await write
  }

  async loadProjectJson(
    text: string,
    meta: { fileName?: string; handle?: FileSystemFileHandle | null; url?: string | null; reload?: boolean } = {},
  ) {
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer)
    this.autoSaveTimer = null
    const project = normalizeProject(JSON.parse(text))
    const fileKey = this.persistent && !meta.handle && !meta.url ? await fingerprint(meta.fileName, text) : undefined
    const linkedId = !meta.reload && this.persistent ? await dbFindWorkspace({ ...meta, fileKey }) : null
    const sameWorkspace = meta.reload || linkedId === this.workspace.id ||
      (!!meta.url && meta.url === this.projectUrl) ||
      (!!meta.handle && !!this.projectHandle && await meta.handle.isSameEntry(this.projectHandle).catch(() => false))
    const linkedWorkspace = !sameWorkspace && linkedId
      ? await dbGetMeta<StoredWorkspace>(workspaceKey(linkedId))
      : null
    this.endHistoryEdit()
    if (!sameWorkspace) {
      void this.flushWorkspace()
      const previous = linkedWorkspace && unpackHistoryState(linkedWorkspace)
      this.workspace = {
        id: previous ? linkedId : uid('p'),
        stamp: linkedWorkspace?.stamp ?? null,
      }
      this.workspaceSaveError = null
      this.history = previous?.history ?? emptyHistory()
      this.historyScope = null
      this.assets = previous?.assets ?? project.assets
    }
    this.recordHistory('从文件重新载入', project.assets)
    this.savedAssets = project.assets
    this.assets = project.assets
    this.projectName = project.name
    this.projectFileName = meta.fileName ?? null
    this.projectHandle = meta.handle ?? null
    this.projectUrl = meta.url ?? null
    this.fileSnapshot = this.projectHandle ? text : null
    this.fileKey = fileKey
    this.selection = {}
    this.selectedGroupId = null
    this.multiSelect = []
    this.lastAddedId = null
    this.projectDirty = false
    this.fileSaveError = null
    this.projectVersion++
    this.emit()
    await this.persistWorkspace()
    return project
  }

  private async runFileTask<T>(task: () => Promise<T>): Promise<T> {
    if (this.fileTaskInProgress) throw new Error('项目文件正在读写，请稍后重试')
    this.fileTaskInProgress = true
    try {
      return await task()
    } finally {
      this.fileTaskInProgress = false
    }
  }

  async saveProject({ linkedOnly = false, automatic = false, force = false } = {}) {
    return this.runFileTask(async () => {
      const picker = window as any
      const version = this.projectVersion
      let handle = this.projectHandle
      let baseline = this.fileSnapshot
      if (!handle) {
        if (linkedOnly) throw new Error('请先在 Studio 中打开或保存一份可写的本地 .mgsvg 文件')
        if (!picker.showSaveFilePicker) {
          const name = this.projectFileName || `${this.projectName}.mgsvg`
          const savedAssets = this.assets
          const json = this.projectJson()
          downloadText(name, json)
          this.endHistoryEdit()
          const fileKey = await fingerprint(name, json)
          if (version !== this.projectVersion) throw new Error('当前项目已切换，请重新保存')
          this.fileKey = fileKey
          this.savedAssets = savedAssets
          this.projectDirty = this.isDirty()
          this.emit()
          await this.persistWorkspace()
          return { file: name, dirty: this.projectDirty }
        }
        handle = await picker.showSaveFilePicker({
          suggestedName: this.projectFileName || `${this.projectName}.mgsvg`,
          types: [{ description: 'MG SVG Studio 项目', accept: { 'application/json': ['.mgsvg', '.json'] } }],
        }) as FileSystemFileHandle
        baseline = await (await handle.getFile()).text()
      }
      try {
        await ensureFilePermission(handle, 'readwrite', !automatic)
      } catch (error) {
        if (linkedOnly) throw new Error('请在 Studio 的项目菜单中手动保存一次，并允许访问本地文件')
        throw error
      }
      const assertUnchanged = async () => {
        if (version !== this.projectVersion) throw new Error('当前项目已切换，请重新保存')
        if (!force && baseline !== null && await (await handle.getFile()).text() !== baseline) {
          throw new Error('磁盘上的项目文件已更改。可先导出当前改动的副本，再从文件重新载入')
        }
      }
      const write = async () => {
        await assertUnchanged()
        const savedAssets = this.assets
        this.endHistoryEdit()
        const json = this.projectJson()
        let writable: FileSystemWritableFileStream
        try {
          writable = await handle.createWritable()
          await writable.write(json)
          await assertUnchanged()
          await writable.close()
        } catch (error) {
          await writable?.abort().catch(() => {})
          if (linkedOnly && (error as DOMException).name === 'NotAllowedError') {
            throw new Error('请先在 Studio 中手动保存一次，授予此文件的写入权限')
          }
          throw error
        }
        this.projectHandle = handle
        this.projectFileName = handle.name
        this.projectUrl = null
        this.fileSnapshot = json
        this.fileKey = undefined
        this.savedAssets = savedAssets
        this.projectDirty = this.isDirty()
        this.fileSaveError = null
        this.emit()
        await this.persistWorkspace()
        return { file: handle.name, dirty: this.projectDirty }
      }
      return navigator.locks ? navigator.locks.request(`mgsvg-file:${handle.name}`, write) : write()
    })
  }

  async openProject() {
    return this.runFileTask(async () => {
      const picker = window as any
      let handle: FileSystemFileHandle | null = null
      let file: File | null
      if (picker.showOpenFilePicker) {
        [handle] = await picker.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'MG SVG Studio 项目', accept: { 'application/json': ['.mgsvg', '.json'] } }],
        })
        file = await handle.getFile()
      } else {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.mgsvg,.json,application/json'
        file = await new Promise<File | null>((resolve) => {
          input.onchange = () => resolve(input.files?.[0] || null)
          input.oncancel = () => resolve(null)
          input.click()
        })
      }
      if (!file) return false
      const text = await file.text()
      if (this.projectDirty && !window.confirm('当前项目还有未保存的改动。放弃这些改动并打开新项目？')) return false
      await this.loadProjectJson(text, { fileName: file.name, handle })
      return true
    })
  }

  async reloadProject() {
    if (!this.projectHandle && !this.projectUrl) return this.openProject()
    return this.runFileTask(async () => {
      const handle = this.projectHandle
      const url = this.projectUrl
      let text: string
      let fileName: string
      if (handle) {
        await ensureFilePermission(handle, 'read')
        const file = await handle.getFile()
        text = await file.text()
        fileName = file.name
      } else {
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(`读取 ${url} 失败：${res.status}`)
        text = await res.text()
        fileName = url.split('/').pop()
      }
      if (this.projectDirty && !window.confirm('当前项目还有未保存的改动。放弃这些改动并从文件重新载入？')) return false
      await this.loadProjectJson(text, { fileName, handle, url, reload: true })
      return true
    })
  }

  async setLayout(assetId: string, elementId: string, spec: LayoutSpec | null, field?: string) {
    this.editAsset(assetId, spec ? '修改容器布局' : '清除容器布局', (asset) => {
      const layouts = { ...asset.layouts }
      if (spec) layouts[elementId] = spec
      else delete layouts[elementId]
      return { layouts }
    }, field && `${assetId}:${elementId}:layout:${field}`)
  }

  async updateGroups(assetId: string, groups: AnimGroup[], editKey?: string) {
    this.editAsset(assetId, '修改动画轨道', () => ({
      groups,
      kind: groups.length ? 'animated' : 'static',
    }), editKey && `${assetId}:${editKey}`)
  }

  async setGroupEnabled(assetId: string, groupId: string, enabled: boolean) {
    this.editAsset(assetId, enabled ? '启用动画' : '停用动画', (asset) => ({
      groups: asset.groups.map((group) => group.id === groupId ? { ...group, enabled } : group),
    }))
  }

  /** 重新从 SVG 里抽取动画（保留手动添加的轨道） */
  async reextract(assetId: string) {
    try {
      this.editAsset(assetId, '重新提取动画', (asset) => {
        const doc = parseSvgDocument(asset.svg)
        const manual = asset.groups.filter((g) => g.origin === 'manual')
        const extracted = doc.groups.map((g, i) => ({ ...g, id: `${asset.id}_g${i}` }))
        const groups = [...extracted, ...manual]
        return { groups, kind: groups.length ? 'animated' : 'static', warnings: doc.warnings }
      })
    } catch (err) {
      alert('重新提取失败：' + (err as Error).message)
    }
  }

  async addGroup(assetId: string, group: AnimGroup) {
    this.editAsset(assetId, '添加动画', (asset) => ({ groups: [...asset.groups, group], kind: 'animated' }))
  }

  async removeGroup(assetId: string, groupId: string) {
    this.editAsset(assetId, '删除动画', (asset) => {
      const groups = asset.groups.filter((group) => group.id !== groupId)
      return { groups, kind: groups.length ? 'animated' : 'static' }
    })
  }

  setArrangeSettings(settings: ArrangeSettings) {
    this.arrangeSettings = { ...settings }
    try { localStorage.setItem('mg-arrange-settings', JSON.stringify(this.arrangeSettings)) } catch {}
    this.emit()
  }

  relayout(settings = this.arrangeSettings) {
    this.setArrangeSettings(settings)
    this.commitAssets('整理画布', autoLayout(this.assets, settings))
  }

  get selectedAsset(): Asset | undefined {
    return this.selection.assetId ? this.assets.find((a) => a.id === this.selection.assetId) : undefined
  }

  exportSpec(assetId: string) {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return null
    return {
      name: asset.name,
      width: asset.width,
      height: asset.height,
      groups: asset.groups,
      overrides: asset.overrides,
      engine: 'gsap',
    }
  }
}

function downloadText(name: string, text: string) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
}

export const store = new Store()
