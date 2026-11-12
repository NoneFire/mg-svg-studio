import type { AnimGroup, Asset, AssetVersion as ProjectVersion, StylePatch } from './types'
import type { LayoutSpec } from './lib/layout/types'
import { parseSvgDocument } from './lib/svg-doc'
import { solveLayout } from './lib/layout/engine'
import {
  BOARD_MAX_H, BOARD_MAX_W, GAP, LABEL_H,
  canvasGrid, cardSize, layoutByOrder, moveInOrder, visualOrder,
} from './lib/canvas-grid'
import {
  buildNativeAsset, createProject, elementIndexOf, normalizeAsset, normalizeProject, normalizeVersions,
  type ProjectFile,
} from './lib/project'
import { mergeAssets } from './lib/project-merge'
import { bitmapFileToSvg, cleanName, dataUrlToSvg, isBitmapFile, isJsonFile, isSvgFile, looksLikeSvg } from './lib/import'
import { looksLikeGsapSvg, looksLikeLottie } from './lib/native/detect'
import type { StudioSelection } from './lib/studio'
import {
  applyAssetChanges, assetChanges, emptyHistory, HISTORY_LIMIT, packHistoryState,
  sameAsset, sameValue, sameVersions, unpackHistoryState, type HistorySnapshot, type StoredHistoryState,
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

/** 界面 / CLI 用的版本记录：文件里只存 index 和快照，id 由 `${assetId}:${index}` 派生 */
export interface AssetVersionRecord extends ProjectVersion {
  id: string
  assetId: string
}

function versionRecord(assetId: string, version: ProjectVersion): AssetVersionRecord {
  return { ...version, assetId, id: `${assetId}:${version.index}` }
}

function versionIndexOf(versionId: string) {
  const index = Number(versionId.slice(versionId.lastIndexOf(':') + 1))
  return Number.isFinite(index) ? index : 0
}

/** 旧格式：历史版本曾单独存在 IndexedDB 里；现在只用于一次性迁移 */
async function dbLegacyVersions(assetId: string): Promise<AssetVersionRecord[]> {
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

async function dbDeleteLegacyVersions(assetId: string): Promise<void> {
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

export { BOARD_MAX_H, BOARD_MAX_W, GAP, LABEL_H }
export { cardSize as cellSize }

export type ArrangeSettings = {
  order: 'nearby' | 'top-left' | 'created'
  mode: 'grid' | 'row' | 'column'
  cols: number
  gap: number
  /** 画布按格子摆位：拖动素材在格子之间换位，松手自动落格 */
  snap: boolean
}

export const DEFAULT_ARRANGE_SETTINGS: ArrangeSettings = {
  order: 'nearby', mode: 'grid', cols: 3, gap: GAP, snap: true,
}

function readLiveSync() {
  try {
    return localStorage.getItem('mg-live-sync') !== '0'
  } catch {
    return true
  }
}

function readArrangeSettings(): ArrangeSettings {
  try {
    const saved = JSON.parse(localStorage.getItem('mg-arrange-settings') || 'null')
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_ARRANGE_SETTINGS }
    // 早期版本只有「整理一次」的列数/间距：没存过 snap 的，按新的格子默认值起算
    const legacy = saved.snap === undefined
    return {
      order: ['nearby', 'top-left', 'created'].includes(saved.order) ? saved.order : DEFAULT_ARRANGE_SETTINGS.order,
      mode: ['grid', 'row', 'column'].includes(saved.mode) ? saved.mode : DEFAULT_ARRANGE_SETTINGS.mode,
      cols: Math.max(1, Math.min(12, Math.round(Number(legacy ? DEFAULT_ARRANGE_SETTINGS.cols : saved.cols) || DEFAULT_ARRANGE_SETTINGS.cols))),
      gap: Math.max(0, Math.min(500, Number.isFinite(Number(saved.gap)) ? Number(saved.gap) : DEFAULT_ARRANGE_SETTINGS.gap)),
      snap: legacy ? DEFAULT_ARRANGE_SETTINGS.snap : saved.snap !== false,
    }
  } catch {
    return { ...DEFAULT_ARRANGE_SETTINGS }
  }
}

/**
 * 画布上的素材排布同样交给布局内核：
 * 变体先组成水平素材组，布局内核再排列各组；默认一列便于纵向浏览素材。
 */
function orderedAssets(assets: Asset[], order: ArrangeSettings['order']): Asset[] {
  if (order === 'created') return [...assets].sort((a, b) => a.createdAt - b.createdAt)
  const center = (asset: Asset) => {
    const size = cardSize(asset)
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
    const size = cardSize(asset)
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

/** 按格子顺序摆位：这是拖拽换位与「整理」共用的落位口径 */
export function snapLayout(assets: Asset[], order: string[], settings: ArrangeSettings): Asset[] {
  const grid = layoutByOrder(assets, order, settings)
  return assets.map((asset) => {
    const slot = grid.slots.get(asset.id)
    return slot && (slot.x !== asset.x || slot.y !== asset.y) ? { ...asset, x: slot.x, y: slot.y } : asset
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
  /** 关联文件后的实时同步：磁盘改动自动读、界面改动自动写 */
  liveSync = readLiveSync()
  /** 最近一次与文件同步 / 保存成功的时刻 */
  syncAt: number | null = null
  /** 最近一次合并里按文件版本处理的素材数 */
  syncConflicts = 0
  syncError: string | null = null
  /** 最近一次自动同步的提示（界面上弹一条短 toast）；时间戳用来触发 */
  syncNotice: string | null = null
  syncNoticeAt = 0
  private watchTimer: ReturnType<typeof setInterval> | null = null
  private watching = false
  private watchStamp = ''
  /** 最后一次从磁盘读到 / 写回文件的内容，用来识别是不是自己的回声 */
  private lastSeenFile: string | null = null
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
    const assets = this.normalizeGrid(
      state?.assets ?? (stored?.length ? stored.sort((a, b) => a.createdAt - b.createdAt) : await this.seedSamples()),
    )
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
      this.savedAssets = state ? this.normalizeGrid(state.savedAssets) : this.projectDirty ? null : assets
      if (assets.length) this.selection = { assetId: assets[0].id }
      if (!workspace) this.scheduleWorkspaceSave()
    }
    await this.migrateLegacyVersions()
    this.lastSeenFile = this.fileSnapshot
    this.ready = true
    this.emit()
    this.startFileWatch()
  }

  /**
   * 旧格式把历史版本单独存在 IndexedDB：第一次打开项目时搬进素材，之后随项目文件走。
   * 搬完就删掉旧记录，避免下次又从旧库盖回来。
   */
  private async migrateLegacyVersions() {
    if (!this.persistent) return
    const pending = this.assets.filter((asset) => !asset.versions?.length)
    if (!pending.length) return
    const found = new Map<string, ProjectVersion[]>()
    for (const asset of pending) {
      const records = await dbLegacyVersions(asset.id)
      if (!records.length) continue
      const versions = normalizeVersions(
        [...records]
          .sort((a, b) => a.index - b.index)
          .map(({ index, createdAt, label, svg, width, height }) => ({ index, createdAt, label, svg, width, height })),
      )
      if (versions.length) found.set(asset.id, versions)
    }
    if (!found.size) return
    this.assets = this.assets.map((asset) => {
      const versions = found.get(asset.id)
      if (!versions?.length) return asset
      const newest = versions[versions.length - 1]
      return {
        ...asset,
        versions,
        revision: asset.revision ?? { index: newest.index, createdAt: newest.createdAt, label: newest.label },
      }
    })
    this.markProjectDirty()
    this.emit()
    for (const id of found.keys()) void dbDeleteLegacyVersions(id)
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
          created.push(await this.buildAssetAuto(text, cleanName(file.name)))
        } else if (isJsonFile(file)) {
          // .json 只认 Bodymovin 导出；别的 JSON 交给下面的报错，不当素材
          const text = await file.text()
          if (!looksLikeLottie(text)) throw new Error('这个 JSON 不是 Lottie（缺 layers / w / h）')
          created.push(buildNativeAsset('lottie', text, cleanName(file.name)))
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
    const base = this.placeNewAssets(created)
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
    if (text && looksLikeLottie(text)) {
      await this.addLottieText(text, '粘贴的 Lottie')
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

  /** 三个入口：Lottie JSON 与内嵌 GSAP 的 SVG 走原生，其余走 Studio 自己的解析 */
  async buildAssetAuto(text: string, name: string) {
    if (looksLikeLottie(text)) return buildNativeAsset('lottie', text, name)
    if (looksLikeGsapSvg(text)) return buildNativeAsset('gsap', text, name)
    return this.buildAsset(text, name, 'import')
  }

  async addSvgText(text: string, name: string) {
    const asset = await this.buildAssetAuto(text, name)
    // 只给新素材找位置，不动已有素材：格子模式下接着最后一个格子放。
    // 想要整板重排时，走「整理画布」显式触发。
    const [placed] = this.placeNewAssets([asset])
    this.selection = { assetId: asset.id }
    this.multiSelect = []
    this.selectedGroupId = null
    this.lastAddedId = asset.id
    this.commitAssets('粘贴素材', [...this.assets, placed])
  }

  async addLottieText(text: string, name: string) {
    const asset = buildNativeAsset('lottie', text, name)
    const [placed] = this.placeNewAssets([asset])
    this.selection = { assetId: asset.id }
    this.multiSelect = []
    this.selectedGroupId = null
    this.lastAddedId = asset.id
    this.commitAssets('粘贴 Lottie', [...this.assets, placed])
  }

  /** 新素材落位：格子模式下接在最后一个格子后面，自由模式下交给原来的整理规则 */
  private placeNewAssets(incoming: Asset[]): Asset[] {
    if (!incoming.length) return incoming
    const settings = this.arrangeSettings
    if (!settings.snap) {
      if (!this.assets.length) return incoming
      return autoLayout([...this.assets, ...incoming], settings).slice(this.assets.length)
    }
    const order = [...canvasGrid(this.assets, settings).order, ...incoming.map((asset) => asset.id)]
    const grid = layoutByOrder([...this.assets, ...incoming], order, settings)
    return incoming.map((asset) => {
      const slot = grid.slots.get(asset.id)
      return slot ? { ...asset, x: slot.x, y: slot.y } : asset
    })
  }

  async removeAsset(id: string) {
    const pending = this.pendingVersions.get(id)
    if (pending) {
      clearTimeout(pending)
      this.pendingVersions.delete(id)
    }
    const left = this.assets.filter((asset) => asset.id !== id)
    // 格子模式下删掉一张，后面的素材补上空出来的格子
    this.commitAssets('删除素材', this.arrangeSettings.snap
      ? snapLayout(left, visualOrder(left).map((asset) => asset.id), this.arrangeSettings)
      : left)
    void dbDeleteLegacyVersions(id)
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
      // 版本历史属于原素材，副本从零开始记
      versions: [],
      revision: undefined,
    }
    const [placed] = this.placeNewAssets([copy])
    this.selection = { assetId: copy.id }
    this.multiSelect = []
    this.selectedGroupId = null
    this.commitAssets('复制素材', [...this.assets, placed])
  }

  /* ------------------------------ 历史版本 ------------------------------ */
  // 版本存在素材自己身上（assets[].versions），随项目文件走；
  // 浏览器 IndexedDB 里那份是旧格式，打开项目时搬一次就清掉。

  /** 把当前素材记为一个版本；历史只追加，不覆盖旧版本 */
  commitVersion(assetId: string, label?: string): AssetVersionRecord | null {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return null
    const versions = asset.versions ?? []
    const index = (versions[versions.length - 1]?.index ?? 0) + 1
    const createdAt = Date.now()
    const version: ProjectVersion = {
      index,
      createdAt,
      label,
      svg: asset.svg,
      width: asset.width,
      height: asset.height,
    }
    this.commitVersionChange(assetId, () => ({
      versions: [...versions, version],
      revision: { index, createdAt, label },
    }))
    return versionRecord(assetId, version)
  }

  /** 某个素材的历史版本，按 index 从新到旧 */
  listVersions(assetId: string) {
    const asset = this.assets.find((a) => a.id === assetId)
    return [...(asset?.versions ?? [])]
      .sort((a, b) => b.index - a.index)
      .map((version) => versionRecord(assetId, version))
  }

  /** 删掉指定的历史版本（清理重复用），并把 revision 指向剩下的最新一版 */
  async deleteVersions(assetId: string, versionIds: string[]) {
    if (!versionIds.length) return 0
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset?.versions?.length) return 0
    const drop = new Set(versionIds.map(versionIndexOf))
    const left = asset.versions.filter((version) => !drop.has(version.index))
    const newest = left[left.length - 1]
    this.commitVersionChange(assetId, () => ({
      versions: left,
      revision: newest ? { index: newest.index, createdAt: newest.createdAt, label: newest.label } : undefined,
    }))
    return asset.versions.length - left.length
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
    const versions = [...(target.versions ?? [])]
    let index = versions[versions.length - 1]?.index ?? 0
    for (const source of sources) {
      index += 1
      versions.push({
        index,
        createdAt: source.createdAt,
        label: source.name,
        svg: source.svg,
        width: source.width,
        height: source.height,
      })
    }
    const ids = new Set(sourceIds)
    const left = this.assets
      .filter((asset) => !ids.has(asset.id))
      .map((asset) => asset.id === targetId
        ? { ...asset, versions, revision: { index, createdAt: Date.now() } }
        : asset)
    this.commitAssets('合并为版本', this.arrangeSettings.snap
      ? snapLayout(left, visualOrder(left).map((asset) => asset.id), this.arrangeSettings)
      : left)
    return { index, merged: sources.length }
  }

  /** 从历史版本恢复：把内容换成那一版、指针指过去，版本列表本身不回退 */
  async restoreVersion(assetId: string, versionId: string) {
    const entry = this.assets.find((a) => a.id === assetId)
    const record = entry?.versions?.find((v) => v.index === versionIndexOf(versionId))
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

  /** 原地替换素材内容：重新解析 SVG，不新增素材；内容变了会自动记一版历史 */
  async replaceAssetSvg(assetId: string, svg: string) {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) throw new Error('素材不存在')
    const doc = parseSvgDocument(svg)
    const groups = doc.groups.map((g, i) => ({ ...g, id: `${assetId}_g${i}` }))
    this.editAsset(assetId, '替换素材内容', () => ({
      svg,
      width: doc.width || asset.width,
      height: doc.height || asset.height,
      kind: groups.length ? 'animated' : 'static',
      groups,
      elements: elementIndexOf(doc),
      warnings: doc.warnings,
      overrides: {},
      layouts: {},
      review: undefined,
      agentReview: undefined,
    }))
    return { asset: assetId, width: doc.width || asset.width, height: doc.height || asset.height }
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
      const blockerSize = cardSize(blocker)
      for (const candidate of next.values()) {
        if (candidate.id === blockerId || candidate.y < blocker.y) continue
        const size = cardSize(candidate)
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

  /**
   * 只改版本记录（追加 / 删除 / 改指针）：不算一次内容编辑，所以不进撤销栈，
   * 但要标脏并写盘——版本随项目文件走。
   */
  private commitVersionChange(assetId: string, update: (asset: Asset) => Partial<Asset>) {
    const asset = this.assets.find((item) => item.id === assetId)
    if (!asset) return
    this.assets = this.assets.map((item) => item === asset ? { ...asset, ...update(asset) } : item)
    this.markProjectDirty()
    this.emit()
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
        previous.payload !== asset.payload ||
        previous.format !== asset.format ||
        previous.width !== asset.width ||
        previous.height !== asset.height ||
        !sameValue(previous.overrides, asset.overrides) ||
        !sameValue(previous.layouts, asset.layouts)
      if (!contentChanged) continue
      const pending = this.pendingVersions.get(asset.id)
      if (pending) clearTimeout(pending)
      this.pendingVersions.set(asset.id, setTimeout(() => {
        this.pendingVersions.delete(asset.id)
        this.commitVersion(asset.id)
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
      this.assets.some((asset, i) =>
        !sameAsset(asset, assets[i], true) ||
        !sameVersions(asset.versions, assets[i].versions) ||
        !sameValue(asset.revision, assets[i].revision),
      )
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

  restoreAssetVersion(version: HistorySnapshot) {
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
        if (this.liveSync && message.includes('磁盘上的项目文件已更改')) {
          // 外部刚改过：交给实时同步去合并，合完会自己写回
          void this.tickFileWatch()
          return
        }
        this.fileSaveError = message
        this.emit()
      })
    }, 700)
  }

  /* ------------------------- 与项目文件的实时同步 ------------------------- */

  setLiveSync(on: boolean) {
    this.liveSync = !!on
    try { localStorage.setItem('mg-live-sync', on ? '1' : '0') } catch {}
    if (on) this.startFileWatch()
    else this.stopFileWatch()
    this.emit()
  }

  /** 关联了本地文件 / URL 时开始盯着它：没有变更事件，只能按时间轮询 */
  private startFileWatch() {
    if (!this.persistent || !this.liveSync) return
    if (!this.projectHandle && !this.projectUrl) return
    if (this.watchTimer) return
    this.watchTimer = setInterval(() => void this.tickFileWatch(), 1200)
    document.addEventListener('visibilitychange', this.onFileVisible)
    window.addEventListener('focus', this.onFileFocused)
  }

  private stopFileWatch() {
    if (this.watchTimer) clearInterval(this.watchTimer)
    this.watchTimer = null
    document.removeEventListener('visibilitychange', this.onFileVisible)
    window.removeEventListener('focus', this.onFileFocused)
  }

  private onFileVisible = () => {
    if (!document.hidden) void this.tickFileWatch()
  }

  private onFileFocused = () => void this.tickFileWatch()

  /** 浏览器重启后文件授权会退回「未授予」：等第一次用户交互时补一次，别人不用去按 ⌘S */
  async requestFilePermission() {
    if (!this.persistent || !this.liveSync || !this.projectHandle) return
    try {
      await ensureFilePermission(this.projectHandle, 'readwrite', true)
    } catch {
      return
    }
    void this.tickFileWatch()
  }

  private async tickFileWatch() {
    if (!this.liveSync || this.watching || this.fileTaskInProgress) return
    if (typeof document !== 'undefined' && document.hidden) return
    const handle = this.projectHandle
    const url = this.projectUrl
    if (!handle && !url) return
    this.watching = true
    try {
      let text: string
      if (handle) {
        const file = await handle.getFile()
        const stamp = `${file.lastModified}:${file.size}`
        if (stamp === this.watchStamp) return
        this.watchStamp = stamp
        text = await file.text()
      } else {
        const response = await fetch(url!, { cache: 'no-store' })
        if (!response.ok) return
        text = await response.text()
      }
      if (text === this.lastSeenFile) return
      const result = this.applyExternalProject(text)
      this.lastSeenFile = text
      if (this.projectHandle && result.shouldWrite) {
        try {
          await this.saveProject({ automatic: true })
        } catch (error) {
          const message = (error as Error).message || String(error)
          // 文件又被改了一次：下一轮同步会接着合，不用报警
          if (!message.includes('磁盘上的项目文件已更改')) {
            this.fileSaveError = message
            this.emit()
          }
        }
      }
    } catch {
      // 文件正被外部写入、或权限还没给：下一轮再试
    } finally {
      this.watching = false
    }
  }

  /** 磁盘上的项目变了：三路合并后应用，必要时再由调用方写回 */
  private applyExternalProject(text: string): { shouldWrite: boolean } {
    let disk: ProjectFile
    try {
      disk = normalizeProject(JSON.parse(text))
    } catch (error) {
      this.syncError = '文件内容暂时不是合法项目（可能正在写入）'
      this.emit()
      throw new Error(`文件内容不是合法的项目：${(error as Error).message}`)
    }
    const outcome = mergeAssets(this.savedAssets ?? [], this.assets, disk.assets)
    // 合并结果和界面上的不一样才需要动画布；和文件不一样才需要写回
    const applied = !sameValue(outcome.assets, this.assets.map((asset) => normalizeAsset(asset)))
    this.syncAt = Date.now()
    this.syncError = null
    this.fileSnapshot = this.projectHandle ? text : null
    if (!applied) {
      this.savedAssets = outcome.assets
      this.syncConflicts = 0
      this.emit()
      return { shouldWrite: outcome.changed }
    }
    this.endHistoryEdit()
    this.recordHistory('从文件同步', outcome.assets)
    this.savedAssets = outcome.assets
    this.applyAssets(outcome.assets)
    this.ensureCanvasGrid()
    this.syncConflicts = outcome.conflicts.length
    this.syncNotice = outcome.conflicts.length
      ? `文件已更新 · ${outcome.conflicts.length} 处按文件版本`
      : '文件已更新'
    this.syncNoticeAt = Date.now()
    this.emit()
    return { shouldWrite: this.projectDirty || outcome.changed }
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
    // 格子模式下位置由顺序算出：文件里存的旧坐标在这里先对齐一次
    project.assets = this.normalizeGrid(project.assets)
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
    this.lastSeenFile = text
    this.syncAt = Date.now()
    this.syncConflicts = 0
    this.syncError = null
    this.projectVersion++
    this.emit()
    await this.persistWorkspace()
    this.startFileWatch()
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
          this.lastSeenFile = json
          this.syncAt = Date.now()
          this.syncError = null
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
        this.lastSeenFile = json
        this.syncAt = Date.now()
        this.syncError = null
        this.emit()
        await this.persistWorkspace()
        this.startFileWatch()
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

  /**
   * 立即把文件里的版本合并进来（和实时同步同一套合并规则，不丢本地改动）。
   * 文件里有本地没有的东西时顺带写回，让两边收敛。
   */
  async reloadProject() {
    if (!this.projectHandle && !this.projectUrl) return this.openProject()
    const outcome = await this.runFileTask(async () => {
      const handle = this.projectHandle
      const url = this.projectUrl
      let text: string
      if (handle) {
        await ensureFilePermission(handle, 'read')
        text = await (await handle.getFile()).text()
      } else {
        const res = await fetch(url!, { cache: 'no-store' })
        if (!res.ok) throw new Error(`读取 ${url} 失败：${res.status}`)
        text = await res.text()
      }
      this.lastSeenFile = text
      return this.applyExternalProject(text)
    })
    if (outcome.shouldWrite && this.projectHandle) await this.saveProject({ automatic: true })
    return true
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
    if (settings.snap) {
      // 格子模式：先定顺序，再落格
      const order = orderedAssets(this.assets, settings.order).map((asset) => asset.id)
      this.commitAssets('整理画布', snapLayout(this.assets, order, settings))
      return
    }
    this.commitAssets('整理画布', autoLayout(this.assets, settings))
  }

  /** 拖拽换位：把素材挪到第 index 个格子，其余素材依次让位 */
  reorderBoards(assetId: string, targetIndex: number) {
    if (!this.arrangeSettings.snap) return
    const order = canvasGrid(this.assets, this.arrangeSettings).order
    if (!order.includes(assetId)) return
    const next = moveInOrder(order, assetId, targetIndex)
    if (next.every((id, index) => id === order[index])) return
    this.commitAssets('拖动素材换位', snapLayout(this.assets, next, this.arrangeSettings))
  }

  /** 格子模式下的位置是算出来的：载入项目 / 恢复草稿时先按可视顺序落一次格 */
  private normalizeGrid(assets: Asset[]): Asset[] {
    if (!this.arrangeSettings.snap || !assets.length) return assets
    return snapLayout(assets, visualOrder(assets).map((asset) => asset.id), this.arrangeSettings)
  }

  /** 补一次对齐：位置已经落好就什么都不做，也不记历史 */
  ensureCanvasGrid() {
    const placed = this.normalizeGrid(this.assets)
    if (placed.every((asset, index) => asset === this.assets[index])) return
    this.applyAssets(placed)
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
