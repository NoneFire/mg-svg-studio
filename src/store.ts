import type { AnimGroup, Asset, StylePatch } from './types'
import type { LayoutSpec } from './lib/layout/types'
import { parseSvgDocument } from './lib/svg-doc'
import { solveLayout } from './lib/layout/engine'
import { createProject, elementIndexOf, normalizeProject, type ProjectFile } from './lib/project'
import { bitmapFileToSvg, cleanName, dataUrlToSvg, isBitmapFile, isSvgFile, looksLikeSvg } from './lib/import'
import type { Studio, StudioSelection } from './lib/studio'

const DB_NAME = 'mg-svg-studio'
const DB_STORE = 'assets'
const DB_VERSION = 1

function uid(prefix = 'a') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-3)}`
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
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

async function dbPut(asset: Asset) {
  try {
    const db = await openDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite')
      tx.objectStore(DB_STORE).put(asset)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  } catch (err) {
    console.warn('写入本地库失败', err)
  }
}

async function dbDelete(id: string) {
  const db = await openDB()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite')
    tx.objectStore(DB_STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
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

export function cellSize(asset: Pick<Asset, 'width' | 'height'>) {
  const fit = Math.min(BOARD_MAX_W / Math.max(1, asset.width), BOARD_MAX_H / Math.max(1, asset.height), 1)
  return { w: Math.max(80, asset.width * fit), h: Math.max(60, asset.height * fit) }
}

/**
 * 画布上的素材排布同样交给布局内核：
 * 这里只描述「2 列网格 + 间距」，坐标由 solveLayout 算出来。
 */
export function autoLayout(assets: Asset[]): Asset[] {
  if (!assets.length) return assets
  const items = assets.map((asset) => {
    const { w, h } = cellSize(asset)
    return { id: asset.id, width: w, height: h }
  })
  const { boxes } = solveLayout(items, {
    mode: 'grid',
    cols: 2,
    gap: GAP,
    rowGap: GAP + LABEL_H,
    alignX: 'start',
    alignY: 'start',
  })
  const pos = new Map(boxes.map((b) => [b.id, b]))
  return assets.map((asset) => {
    const box = pos.get(asset.id)
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
  projectName = '未命名素材库'
  projectFileName: string | null = null
  projectHandle: FileSystemFileHandle | null = null
  projectUrl: string | null = null
  projectDirty = false
  projectVersion = 0
  private projectRevision = 0
  private fileSnapshot: string | null = null
  private fileTaskInProgress = false
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
  private saveTimers = new Map<string, any>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  getSnapshot = () => this.version

  emit() {
    this.version++
    this.listeners.forEach((l) => l())
  }

  async init() {
    if (this.initStarted) return
    this.initStarted = true
    const stored = await dbAll()
    // ?project= 载入比 init 快时，别再用本地缓存 / 示例把项目盖掉
    if (this.projectVersion > 0) {
      this.ready = true
      this.emit()
      return
    }
    if (stored.length) {
      this.assets = stored.sort((a, b) => a.createdAt - b.createdAt)
    } else {
      const seeded = await this.seedSamples()
      if (this.projectVersion > 0) {
        this.ready = true
        this.emit()
        return
      }
      this.assets = seeded
    }
    if (!this.assets.length) {
      this.ready = true
      this.emit()
      return
    }
    this.selection = { assetId: this.assets[0].id }
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
    const laid = autoLayout(assets)
    await Promise.all(laid.map((a) => dbPut(a)))
    return laid
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
    const base = this.assets.length ? autoLayout([...this.assets, ...created]).slice(this.assets.length) : autoLayout(created)
    const merged = [...this.assets, ...base]
    this.assets = merged
    this.markProjectDirty()
    this.selection = { assetId: base[base.length - 1].id }
    this.lastAddedId = base[base.length - 1].id
    this.emit()
    await Promise.all(base.map((asset) => dbPut(asset)))
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
      const svg = await dataUrlToSvg(text)
      await this.addSvgText(svg, '粘贴的图片')
      return 1
    }
    return 0
  }

  async addSvgText(text: string, name: string) {
    const asset = this.buildAsset(text, name, 'import')
    const laid = autoLayout([...this.assets, asset]).slice(this.assets.length)
    const next = laid[0]
    this.assets = [...this.assets, next]
    this.markProjectDirty()
    this.selection = { assetId: next.id }
    this.lastAddedId = next.id
    this.emit()
    await dbPut(next)
  }

  async removeAsset(id: string) {
    this.assets = this.assets.filter((a) => a.id !== id)
    if (this.selection.assetId === id) this.selection = {}
    clearTimeout(this.saveTimers.get(id))
    this.saveTimers.delete(id)
    this.markProjectDirty()
    this.emit()
    await dbDelete(id)
  }

  async duplicateAsset(id: string) {
    const src = this.assets.find((a) => a.id === id)
    if (!src) return
    const copy: Asset = {
      ...src,
      id: uid(),
      name: `${src.name} 副本`,
      createdAt: Date.now(),
      x: src.x + 40,
      y: src.y + 40,
    }
    this.assets = [...this.assets, copy]
    this.markProjectDirty()
    this.selection = { assetId: copy.id }
    this.emit()
    await dbPut(copy)
  }

  async renameAsset(id: string, name: string) {
    const asset = this.assets.find((a) => a.id === id)
    if (!asset) return
    asset.name = name
    this.scheduleSave(asset)
    this.emit()
  }

  private scheduleSave(asset: Asset) {
    this.markProjectDirty()
    const existing = this.saveTimers.get(asset.id)
    if (existing) clearTimeout(existing)
    this.saveTimers.set(
      asset.id,
      setTimeout(() => {
        this.saveTimers.delete(asset.id)
        dbPut({ ...asset, version: 1 })
      }, 220)
    )
  }

  private markProjectDirty() {
    this.projectDirty = true
    this.projectRevision++
  }

  updateSelection(sel: StudioSelection) {
    if (sel.elementId) this.rightOpen = true
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
    const asset = this.assets.find((a) => a.id === id)
    if (!asset) return
    asset.x = x
    asset.y = y
    this.scheduleSave(asset)
    this.emit()
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
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return
    asset.review = snapshot
    this.scheduleSave(asset)
    this.emit()
  }

  async updateElementStyle(assetId: string, elementId: string, patch: StylePatch) {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return
    asset.overrides = { ...asset.overrides, [elementId]: { ...(asset.overrides[elementId] || {}), ...patch } }
    this.scheduleSave(asset)
    this.emit()
  }

  async resetElementStyle(assetId: string, elementId: string) {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return
    const next = { ...asset.overrides }
    delete next[elementId]
    asset.overrides = next
    this.scheduleSave(asset)
    this.emit()
  }

  editElementStyle(studio: Studio | null, asset: Asset, elementId: string, patch: StylePatch | null) {
    if (patch) {
      this.updateElementStyle(asset.id, elementId, patch)
      studio?.applyStyle(asset.id, elementId, asset.overrides[elementId])
    } else {
      this.resetElementStyle(asset.id, elementId)
      studio?.refreshAsset(asset, { rebuildContent: true })
    }
  }

  /* ------------------------------ 项目文件 ------------------------------ */

  projectJson(): string {
    return JSON.stringify(createProject(this.assets, this.projectName), null, 2) + '\n'
  }

  async loadProjectJson(
    text: string,
    meta: { fileName?: string; handle?: FileSystemFileHandle | null; url?: string | null } = {},
  ) {
    const project = normalizeProject(JSON.parse(text))
    for (const timer of this.saveTimers.values()) clearTimeout(timer)
    this.saveTimers.clear()
    this.assets = project.assets
    this.projectName = project.name
    this.projectFileName = meta.fileName ?? null
    this.projectHandle = meta.handle ?? null
    this.projectUrl = meta.url ?? null
    this.fileSnapshot = this.projectHandle ? text : null
    this.selection = {}
    this.selectedGroupId = null
    this.multiSelect = []
    this.lastAddedId = null
    this.projectDirty = false
    this.projectVersion++
    this.emit()
    await Promise.all(this.assets.map((asset) => dbPut(asset)))
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

  async saveProject({ linkedOnly = false } = {}) {
    return this.runFileTask(async () => {
      const picker = window as any
      const version = this.projectVersion
      let handle = this.projectHandle
      let baseline = this.fileSnapshot
      if (!handle) {
        if (linkedOnly) throw new Error('请先在 Studio 中打开或保存一份可写的本地 .mgsvg 文件')
        if (!picker.showSaveFilePicker) {
          const name = this.projectFileName || `${this.projectName}.mgsvg`
          downloadText(name, this.projectJson())
          this.projectDirty = false
          this.emit()
          return { file: name, dirty: false }
        }
        handle = await picker.showSaveFilePicker({
          suggestedName: this.projectFileName || `${this.projectName}.mgsvg`,
          types: [{ description: 'MG SVG Studio 项目', accept: { 'application/json': ['.mgsvg', '.json'] } }],
        }) as FileSystemFileHandle
        baseline = await (await handle.getFile()).text()
      }
      const assertUnchanged = async () => {
        if (version !== this.projectVersion) throw new Error('当前项目已切换，请重新保存')
        if (baseline !== null && await (await handle.getFile()).text() !== baseline) {
          throw new Error('磁盘上的项目文件已更改。可先导出当前改动的副本，再从文件重新载入')
        }
      }
      const write = async () => {
        await assertUnchanged()
        const revision = this.projectRevision
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
        this.projectDirty = this.projectRevision !== revision
        this.emit()
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
      await this.loadProjectJson(text, { fileName, handle, url })
      return true
    })
  }

  async setLayout(assetId: string, elementId: string, spec: LayoutSpec | null) {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return
    const next = { ...(asset.layouts || {}) }
    if (spec) next[elementId] = spec
    else delete next[elementId]
    asset.layouts = next
    this.scheduleSave(asset)
    this.emit()
  }

  async updateGroups(assetId: string, groups: AnimGroup[]) {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return
    asset.groups = groups
    asset.kind = groups.length ? 'animated' : 'static'
    this.scheduleSave(asset)
    this.emit()
  }

  async setGroupEnabled(assetId: string, groupId: string, enabled: boolean) {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return
    asset.groups = asset.groups.map((g) => (g.id === groupId ? { ...g, enabled } : g))
    this.scheduleSave(asset)
    this.emit()
  }

  /** 重新从 SVG 里抽取动画（保留手动添加的轨道） */
  async reextract(assetId: string) {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return
    try {
      const doc = parseSvgDocument(asset.svg)
      const manual = asset.groups.filter((g) => g.origin === 'manual')
      const extracted = doc.groups.map((g, i) => ({ ...g, id: `${asset.id}_g${i}` }))
      asset.groups = [...extracted, ...manual]
      asset.kind = asset.groups.length ? 'animated' : 'static'
      asset.warnings = doc.warnings
      this.scheduleSave(asset)
      this.emit()
    } catch (err) {
      alert('重新提取失败：' + (err as Error).message)
    }
  }

  async addGroup(assetId: string, group: AnimGroup) {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return
    asset.groups = [...asset.groups, group]
    asset.kind = 'animated'
    this.scheduleSave(asset)
    this.emit()
  }

  async removeGroup(assetId: string, groupId: string) {
    const asset = this.assets.find((a) => a.id === assetId)
    if (!asset) return
    asset.groups = asset.groups.filter((g) => g.id !== groupId)
    if (!asset.groups.length) asset.kind = 'static'
    this.scheduleSave(asset)
    this.emit()
  }

  relayout() {
    this.assets = autoLayout(this.assets)
    this.assets.forEach((a) => this.scheduleSave(a))
    this.emit()
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
