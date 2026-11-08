import gsap from 'gsap'
import { Box, DragEvent, Group, Leafer, Rect, Text } from 'leafer-ui'
import type { Asset, StylePatch } from '../types'
import { convertSvg, applyPatch, type ConvertedAsset, type ConvertedElement } from './convert'
import { applyAssetLayouts } from './layout/apply'
import { parseSvgDocument } from './svg-doc'
import { AssetPlayer } from './runtime'
import { sameValue } from './history'
import {
  assetCardHeight, countCopy, hasVideoCopy, VIDEO_COPY_BAND_HEIGHT,
  COPY_BODY_TOP, COPY_HEADER_TOP, COPY_LINE_HEIGHT, COPY_LINES, COPY_SIDE, COPY_TEXT_LEFT,
} from './asset-card'
import { fitText } from './text-fit'

export interface StudioSelection {
  assetId?: string
  elementId?: string
  groupId?: string
}

/** 画布标注：把评审 finding 叠回它指的元素上（用户单位包围盒） */
export interface ReviewMarker {
  id: string
  ruleId: string
  level: 'FAIL' | 'WARN' | 'UNMEASURED' | 'PASS'
  label?: string
  bbox: [number, number, number, number]
}

export interface StudioEvents {
  onSelectionChange?: (sel: StudioSelection, focusInspector?: boolean) => void
  onBoardMove?: (assetId: string, x: number, y: number) => void
  onZoom?: (zoom: number) => void
  onTime?: (assetId: string, time: number, duration: number) => void
  onPlaybackChange?: () => void
  onBoardCount?: (n: number) => void
  /** 点了画布上的评审标注 */
  onReviewMarkerClick?: (ruleId: string) => void
}

interface Board {
  asset: Asset
  frame: Box
  label: Group
  svgViewport: Box
  contentHolder: Group
  copyBand: Rect
  copyRule: Rect
  copyAccent: Rect
  copyHeading: Text
  copyCount: Text
  copyText: Text
  content: ConvertedAsset
  player: AssetPlayer
  fit: number
  svgHeight: number
  cell: { x: number; y: number; w: number; h: number }
  ready: boolean
}

let measureCanvas: CanvasRenderingContext2D | null = null

/** 和卡片正文同一套字体，用来判断三行放不放得下 */
function measureVideoCopyText() {
  if (!measureCanvas) measureCanvas = document.createElement('canvas').getContext('2d')
  const context = measureCanvas
  if (!context) return (value: string) => value.length * 13
  context.font = '13px Inter, "PingFang SC", sans-serif'
  return (value: string) => context.measureText(value).width
}

const BOARD_MAX_W = 560
const BOARD_MAX_H = 380
const LABEL_H = 26

export type StudioTheme = 'dark' | 'light'

/** 一条轴上最多画多少条网格线：再多就是一块糊，不是网格 */
export const MAX_GRID_LINES = 160

const MARKER_COLOR: Record<string, string> = {
  FAIL: '#f87171',
  WARN: '#f59e0b',
  UNMEASURED: '#a78bfa',
  PASS: '#34d399',
}

const THEMES = {
  dark: {
    bg: '#16161a',
    board: '#1b1b21',
    copyBand: '#212129',
    copyBandBorder: '#34343f',
    copyAccent: '#3b82f6',
    copyHeading: '#98a1b0',
    copyCount: '#6f7889',
    copyText: '#e9ebf0',
    boardStroke: '#2a2a33',
    boardStrokeActive: '#3a3a46',
    label: '#8f96a3',
    gridMinor: 'rgba(255,255,255,0.035)',
    gridMajor: 'rgba(255,255,255,0.058)',
    gridDot: 'rgba(255,255,255,0.11)',
    warn: '#ff6b6b',
  },
  light: {
    bg: '#f0f1f4',
    board: '#ffffff',
    copyBand: '#f1f3f8',
    copyBandBorder: '#dde2ea',
    copyAccent: '#2563eb',
    copyHeading: '#556074',
    copyCount: '#7a8598',
    copyText: '#1f2937',
    boardStroke: '#e0e3e9',
    boardStrokeActive: '#c8cfda',
    label: '#5b6270',
    gridMinor: 'rgba(15,23,42,0.055)',
    gridMajor: 'rgba(15,23,42,0.09)',
    gridDot: 'rgba(15,23,42,0.16)',
    warn: '#dc2626',
  },
} as const

export class Studio {
  leafer: Leafer
  camera: Group
  boardsLayer: Group
  overlay: Group
  labelsLayer: Group
  private container: HTMLElement
  private gridCanvas: HTMLCanvasElement
  private gridCtx: CanvasRenderingContext2D
  boards = new Map<string, Board>()
  selection: StudioSelection = {}
  private selectionBox: Rect
  private elementBox: Rect
  private dragging: null | (
    { pointerId: number; mode: 'pan'; startX: number; startY: number; camX: number; camY: number } |
    { pointerId: number; mode: 'move'; board: Board }
  ) = null
  private spaceDown = false
  private moved = false
  private zoom = 1
  gridVisible = true
  events: StudioEvents = {}
  private tickerBound = false
  private ro?: ResizeObserver
  private lastTick = 0
  private lastOverlaySync = 0
  private lastSize = { w: 0, h: 0 }
  private loopEnabled = true
  private zoomGesture: null | { s: number; s0: number; x0: number; y0: number; s1: number; anchor: { x: number; y: number }; lastAt: number } = null
  private gestureActive = false
  private gestureBaseScale = 1
  private lastZoomEmit = 0
  private reviewLayer: Group
  private reviewRasterLayer: Group
  private reviewState: { assetId: string | null; markers: ReviewMarker[]; focus: string | null } = {
    assetId: null,
    markers: [],
    focus: null,
  }
  private reviewNodes: { rect: Rect; chip: Group; ruleId: string; level: string }[] = []
  private reviewHits: { ruleId: string; x: number; y: number; w: number; h: number }[] = []
  private hoverMarker = false
  private reviewRaster: { assetId: string | null; cols: number; gutter: number; margin: number } = {
    assetId: null,
    cols: 0,
    gutter: 0,
    margin: 0,
  }
  private rasterNodes: { band: Rect; edge: Rect }[] = []
  private readonly MIN_ZOOM = 0.02
  private readonly MAX_ZOOM = 16
  theme: StudioTheme = typeof localStorage !== 'undefined' && localStorage.getItem('mg-theme') === 'light' ? 'light' : 'dark'

  constructor(container: HTMLElement, events: StudioEvents) {
    this.container = container
    this.events = events
    this.gridCanvas = document.createElement('canvas')
    Object.assign(this.gridCanvas.style, {
      position: 'absolute',
      inset: '0',
      width: '100%',
      height: '100%',
      pointerEvents: 'none',
    } as CSSStyleDeclaration)
    container.appendChild(this.gridCanvas)
    this.gridCtx = this.gridCanvas.getContext('2d')!

    this.leafer = new Leafer({ view: container, width: container.clientWidth, height: container.clientHeight, fill: '#16161a' })
    this.camera = new Group({ name: 'camera' })
    this.boardsLayer = new Group({ name: 'boards' })
    this.overlay = new Group({ name: 'overlay' })
    this.camera.add(this.boardsLayer)
    this.labelsLayer = new Group({ name: 'labels' })
    this.leafer.add(this.camera)
    this.leafer.add(this.overlay)
    this.overlay.add(this.labelsLayer)
    this.reviewRasterLayer = new Group({ name: 'review-raster', visible: false })
    this.overlay.add(this.reviewRasterLayer)
    this.reviewLayer = new Group({ name: 'review', visible: false })
    this.overlay.add(this.reviewLayer)

    this.selectionBox = new Rect({
      stroke: '#2f81f7',
      strokeWidth: 1.5,
      dashPattern: [5, 4],
      fill: undefined,
      visible: false,
      hittable: false,
      cornerRadius: 4,
    } as any)
    this.elementBox = new Rect({
      stroke: '#2f81f7',
      strokeWidth: 1.25,
      fill: undefined,
      visible: false,
      hittable: false,
    } as any)
    this.overlay.add(this.selectionBox)
    this.overlay.add(this.elementBox)

    this.bindEvents()
    this.startTicker()
    this.observeResize()
    this.drawGrid()
  }

  /* ------------------------------ basics ------------------------------ */

  private observeResize() {
    this.ro = new ResizeObserver(() => {
      const w = this.container.clientWidth
      const h = this.container.clientHeight
      if (!w || !h) return
      const prev = this.lastSize
      this.lastSize = { w, h }
      this.leafer.resize({ width: w, height: h })
      // 只是横向尺寸变化（侧栏开合）时把相机中心一起挪，画面不跳；
      // 纵向变化（时间轴出现/隐藏）不动，避免启动时舞台还没定型就被推偏。
      if (prev.w && prev.w !== w) {
        this.camera.x += (w - prev.w) / 2
        this.afterCameraChange()
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      this.gridCanvas.width = w * dpr
      this.gridCanvas.height = h * dpr
      this.drawGrid()
    })
    this.ro.observe(this.container)
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.gridCanvas.width = Math.max(1, w * dpr)
    this.gridCanvas.height = Math.max(1, h * dpr)
  }

  private startTicker() {
    if (this.tickerBound) return
    this.tickerBound = true
    gsap.ticker.add(this.onTick)
  }

  private onTick = () => {
    const now = performance.now()
    const dt = this.lastTick ? Math.min(0.1, (now - this.lastTick) / 1000) : 0
    this.lastTick = now
    if (!dt) return
    const zoomed = this.stepZoom(dt)
    const viewport = this.viewportWorld()
    let advanced = false
    let ended = false
    this.boards.forEach((b) => {
      if (!b.ready || !b.player.playing) return
      const bounds = b.frame.getBounds('box', 'world')
      if (bounds.x + bounds.width < -200 || bounds.y + bounds.height < -200 || bounds.x > viewport.w + 200 || bounds.y > viewport.h + 200) return
      b.player.tick(dt)
      advanced = true
      if (!b.player.playing) ended = true
      if (this.events.onTime) this.events.onTime(b.asset.id, b.player.time, b.player.duration)
    })
    if (ended) this.events.onPlaybackChange?.()
    if (advanced || zoomed) {
      // Leafer 自带的 rAF 调度会把相邻两帧合并（实测 ~30fps），这里每帧同步渲染一次，跟满 60Hz
      this.leafer.forceRender(undefined, true)
      if (zoomed || ended || now - this.lastOverlaySync > 55) {
        this.lastOverlaySync = now
        this.syncSelectionOverlay()
      }
    }
  }

  /* --------------------------- 平滑缩放（触控板） --------------------------- */

  /** 指数逼近目标缩放，并始终锁定手势起点处的屏幕锚点 */
  private stepZoom(dt: number): boolean {
    const g = this.zoomGesture
    if (!g) return false
    const now = performance.now()
    if (now - g.lastAt > 140) {
      g.s = g.s1
    } else {
      const k = 1 - Math.exp(-dt * 22)
      g.s += (g.s1 - g.s) * k
      if (Math.abs(g.s1 - g.s) < 0.0004) g.s = g.s1
    }
    const scale = g.s
    const x = g.anchor.x - ((g.anchor.x - g.x0) * scale) / g.s0
    const y = g.anchor.y - ((g.anchor.y - g.y0) * scale) / g.s0
    this.camera.setTransform({ a: scale, b: 0, c: 0, d: scale, e: x, f: y } as any, false)
    this.zoom = scale
    this.drawGrid()
    this.syncLabels()
    if (now - this.lastZoomEmit > 80) {
      this.lastZoomEmit = now
      this.events.onZoom?.(scale)
    }
    if (g.s === g.s1 && now - g.lastAt > 140) {
      this.zoomGesture = null
      this.events.onZoom?.(scale)
    }
    return true
  }

  private clampZoom(v: number) {
    return Math.min(this.MAX_ZOOM, Math.max(this.MIN_ZOOM, v))
  }

  private startZoom(anchor: { x: number; y: number }) {
    const s = this.camera.scaleX || 1
    this.zoomGesture = { s, s0: s, x0: this.camera.x, y0: this.camera.y, s1: s, anchor, lastAt: performance.now() }
  }

  /** 以屏幕点为锚，按比例缩放（触控板捏合 / ⌘滚轮） */
  zoomAt(factor: number, anchor: { x: number; y: number }) {
    const now = performance.now()
    if (!this.zoomGesture || now - this.zoomGesture.lastAt > 140) this.startZoom(anchor)
    const g = this.zoomGesture!
    g.anchor = anchor
    g.s1 = this.clampZoom(g.s1 * factor)
    g.lastAt = now
  }

  /** 缩放到位（HUD 按钮 / ⌘1 等），走同一条平滑曲线 */
  animateZoomTo(target: number, anchor?: { x: number; y: number }) {
    const a = anchor || { x: this.container.clientWidth / 2, y: this.container.clientHeight / 2 }
    if (!this.zoomGesture) this.startZoom(a)
    const g = this.zoomGesture!
    g.anchor = a
    g.s1 = this.clampZoom(target)
    g.lastAt = performance.now()
  }

  private viewportWorld() {
    return { w: this.container.clientWidth, h: this.container.clientHeight }
  }

  /* ------------------------------- assets ------------------------------ */

  setAssets(assets: Asset[], replace = false) {
    const ids = new Set(assets.map((a) => a.id))
    Array.from(this.boards.keys()).forEach((id) => {
      if (replace || !ids.has(id)) this.removeBoard(id)
    })
    assets.forEach((asset, index) => {
      const board = this.boards.get(asset.id) ?? this.createBoard(asset)
      if (this.boardsLayer.children[index] !== board.frame) this.boardsLayer.addAt(board.frame, index)
      if (this.labelsLayer.children[index] !== board.label) this.labelsLayer.addAt(board.label, index)
      if (board.asset !== asset) this.syncAsset(board, asset)
    })
    this.events.onBoardCount?.(this.boards.size)
    this.drawGrid()
    this.syncLabels()
    this.syncSelectionOverlay()
  }

  private syncAsset(board: Board, asset: Asset) {
    const previous = board.asset
    if (previous.x !== asset.x || previous.y !== asset.y) {
      if (this.dragging?.mode === 'move' && this.dragging.board === board) this.cancelPointer()
      board.frame.set({ x: asset.x, y: asset.y })
    }
    board.asset = asset
    if (previous.width !== asset.width || previous.height !== asset.height) {
      board.fit = Math.min(BOARD_MAX_W / Math.max(1, asset.width), BOARD_MAX_H / Math.max(1, asset.height), 1)
      board.cell.w = Math.max(80, asset.width * board.fit)
      board.svgHeight = Math.max(60, asset.height * board.fit)
      board.cell.h = assetCardHeight(board.svgHeight, asset.videoCopy)
      board.frame.set({ width: board.cell.w, height: board.cell.h })
      board.svgViewport.set({ width: board.cell.w, height: board.svgHeight })
      board.contentHolder.set({ scaleX: board.fit, scaleY: board.fit })
      this.updateVideoCopyLayout(board)
    }
    const styleChanged = !sameValue(previous.overrides, asset.overrides)
    const changedStyles = styleChanged ? Object.entries(asset.overrides).filter(([id, patch]) => patch !== previous.overrides[id]) : []
    const removedStyle = styleChanged && Object.entries(previous.overrides).some(([id, patch]) =>
      Object.keys(patch).some((key) => asset.overrides[id]?.[key as keyof StylePatch] === undefined),
    )
    const layoutGeometryChanged = Object.keys(asset.layouts ?? {}).length > 0 && changedStyles.some(([id, patch]) =>
      (['x', 'y', 'rotation', 'scale', 'width', 'height', 'fontSize', 'letterSpacing', 'text'] as const)
        .some((key) => patch[key] !== previous.overrides[id]?.[key]),
    )
    const rebuild = previous.svg !== asset.svg || previous.width !== asset.width || previous.height !== asset.height ||
      removedStyle || layoutGeometryChanged || !sameValue(previous.layouts ?? {}, asset.layouts ?? {})
    if (rebuild || !sameValue(previous.groups, asset.groups)) this.refreshAsset(board, rebuild)
    else if (board.player) board.player.asset = asset
    if (!rebuild) changedStyles.forEach(([id, patch]) => this.applyStyle(asset.id, id, patch))
    if (previous.kind !== asset.kind) {
      board.frame.stroke = asset.kind === 'animated' ? THEMES[this.theme].boardStrokeActive : THEMES[this.theme].boardStroke
    }
    if (previous.kind !== asset.kind || previous.name !== asset.name) this.updateBoardLabel(board)
    const copyVisibilityChanged = hasVideoCopy(previous.videoCopy) !== hasVideoCopy(asset.videoCopy)
    if (copyVisibilityChanged) {
      board.cell.h = assetCardHeight(board.svgHeight, asset.videoCopy)
      board.frame.set({ height: board.cell.h })
    }
    if (previous.videoCopy !== asset.videoCopy || previous.width !== asset.width || previous.height !== asset.height) {
      this.updateVideoCopy(board)
    }
  }

  private createBoard(asset: Asset) {
    const fit = Math.min(BOARD_MAX_W / Math.max(1, asset.width), BOARD_MAX_H / Math.max(1, asset.height), 1)
    const w = Math.max(80, asset.width * fit)
    const h = Math.max(60, asset.height * fit)
    const hasCopy = hasVideoCopy(asset.videoCopy)
    const cardH = assetCardHeight(h, asset.videoCopy)

    const frame = new Box({
      name: `board:${asset.id}`,
      x: asset.x,
      y: asset.y,
      width: w,
      height: cardH,
      fill: THEMES[this.theme].board,
      shadow: this.theme === 'light' ? { x: 0, y: 10, blur: 26, color: 'rgba(15,23,42,0.10)' } : undefined,
      overflow: 'hide',
      cornerRadius: 6,
      stroke: THEMES[this.theme].boardStroke,
      strokeWidth: 1,
      strokeAlign: 'inside',
    } as any)
    frame.hittable = true
    this.boardsLayer.add(frame)

    const svgViewport = new Box({
      name: `svg-viewport:${asset.id}`,
      x: 0,
      y: 0,
      width: w,
      height: h,
      fill: THEMES[this.theme].board,
      strokeWidth: 0,
      overflow: 'hide',
      hittable: false,
    } as any)
    const contentHolder = new Group({ name: `content:${asset.id}` })
    contentHolder.setTransform({ a: fit, b: 0, c: 0, d: fit, e: 0, f: 0 } as any, false)
    svgViewport.add(contentHolder)
    frame.add(svgViewport)

    // 文案条：紧贴画面、满宽，靠分隔线 + 底色 + 左侧色条和画面分区，但仍属于同一张卡片
    const copyBand = new Rect({
      name: `video-copy-band:${asset.id}`,
      x: 0,
      y: h,
      width: w,
      height: VIDEO_COPY_BAND_HEIGHT,
      fill: THEMES[this.theme].copyBand,
      visible: hasCopy,
      hittable: false,
    } as any)
    const copyRule = new Rect({
      name: `video-copy-rule:${asset.id}`,
      x: 0,
      y: h,
      width: w,
      height: 1,
      fill: THEMES[this.theme].copyBandBorder,
      visible: hasCopy,
      hittable: false,
    } as any)
    const copyAccent = new Rect({
      name: `video-copy-accent:${asset.id}`,
      x: COPY_SIDE,
      y: h + COPY_HEADER_TOP + 2,
      width: 2,
      height: 10,
      cornerRadius: 1,
      fill: THEMES[this.theme].copyAccent,
      visible: hasCopy,
      hittable: false,
    } as any)
    const copyHeading = new Text({
      name: `video-copy-heading:${asset.id}`,
      x: COPY_TEXT_LEFT,
      y: h + COPY_HEADER_TOP,
      text: '视频文案',
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: 0.2,
      fill: THEMES[this.theme].copyHeading,
      fontFamily: 'Inter, "PingFang SC", sans-serif',
      visible: hasCopy,
      hittable: false,
    } as any)
    const copyCount = new Text({
      name: `video-copy-count:${asset.id}`,
      x: Math.max(1, w - COPY_SIDE - 88),
      y: h + COPY_HEADER_TOP,
      width: 88,
      text: '',
      textAlign: 'right',
      fontSize: 10,
      fill: THEMES[this.theme].copyCount,
      fontFamily: 'Inter, "PingFang SC", sans-serif',
      visible: hasCopy,
      hittable: false,
    } as any)
    const copyText = new Text({
      name: `video-copy:${asset.id}`,
      x: COPY_TEXT_LEFT,
      y: h + COPY_BODY_TOP,
      width: Math.max(1, w - COPY_TEXT_LEFT * 2),
      height: COPY_LINES * COPY_LINE_HEIGHT,
      text: hasCopy ? asset.videoCopy : '',
      fontSize: 13,
      lineHeight: COPY_LINE_HEIGHT,
      textWrap: 'break',
      textOverflow: 'ellipsis',
      verticalAlign: 'top',
      fill: THEMES[this.theme].copyText,
      fontFamily: 'Inter, "PingFang SC", sans-serif',
      visible: hasCopy,
      hittable: false,
    } as any)
    frame.add(copyBand)
    frame.add(copyRule)
    frame.add(copyAccent)
    frame.add(copyHeading)
    frame.add(copyCount)
    frame.add(copyText)

    const label = new Group({ name: `label:${asset.id}` })
    const dragStrip = new Rect({
      name: `boarddrag:${asset.id}`,
      x: 0,
      y: 0,
      width: 200,
      height: LABEL_H - 2,
      fill: 'rgba(255,255,255,0.001)',
      hittable: true,
    } as any)
    const dot = new Rect({
      x: 0,
      y: 7,
      width: 5,
      height: 5,
      cornerRadius: 3,
      fill: '#4ade80',
      hittable: false,
    } as any)
    const labelText = new Text({
      x: 10,
      text: ' ',
      fontSize: 11.5,
      fill: THEMES[this.theme].label,
      fontFamily: 'Inter, "PingFang SC", sans-serif',
      hittable: false,
    } as any)
    label.add(dragStrip)
    label.add(dot)
    label.add(labelText)
    label.hittable = true
    this.labelsLayer.add(label)

    const board: Board = {
      asset,
      frame,
      label,
      svgViewport,
      contentHolder,
      copyBand,
      copyRule,
      copyAccent,
      copyHeading,
      copyCount,
      copyText,
      content: { content: new Group(), width: 1, height: 1, elements: new Map(), order: [], unsupported: [] },
      player: null as any,
      fit,
      svgHeight: h,
      cell: { x: asset.x, y: asset.y, w, h: cardH },
      ready: false,
    }
    this.boards.set(asset.id, board)
    this.updateBoardLabel(board)
    this.updateVideoCopy(board)
    this.buildBoardContent(board)
    for (const handle of [frame, dragStrip]) {
      handle.on(DragEvent.DRAG, this.onBoardDrag)
      handle.on(DragEvent.END, this.onBoardDragEnd)
    }
    return board
  }

  private buildBoardContent(board: Board) {
    const asset = board.asset
    try {
      const doc = parseSvgDocument(asset.svg)
      const converted = convertSvg(doc, asset)
      board.content = converted
      board.contentHolder.add(converted.content)
      board.player = new AssetPlayer(converted, asset)
      board.player.loop = this.loopEnabled
      board.player.onTime = (t, d) => this.events.onTime?.(asset.id, t, d)
      applyAssetLayouts(converted, asset.layouts)
      board.player.render(0)
      board.ready = true
      board.frame.stroke = asset.kind === 'animated' ? THEMES[this.theme].boardStrokeActive : THEMES[this.theme].boardStroke
    } catch (err) {
      console.error('SVG 构建失败', asset.name, err)
      const fallback = new Text({ text: '无法解析 SVG', fontSize: 14, fill: '#ff6b6b' } as any)
      board.contentHolder.add(fallback)
      board.ready = false
    }
    this.drawGrid()
    this.syncSelectionOverlay()
  }

  private removeBoard(id: string) {
    const board = this.boards.get(id)
    if (!board) return
    if (this.dragging?.mode === 'move' && this.dragging.board === board) this.cancelPointer()
    board.frame.destroy()
    board.label.destroy()
    this.boards.delete(id)
  }

  private updateBoardLabel(board: Board) {
    const text = board.label.children[2] as any
    const dot = board.label.children[1] as any
    text.text = board.asset.name
    text.fill = THEMES[this.theme].label
    dot.fill = board.asset.kind === 'animated' ? '#4ade80' : '#5b6169'
    this.syncLabels()
  }

  private updateVideoCopy(board: Board) {
    const text = board.asset.videoCopy ?? ''
    const hasText = hasVideoCopy(text)
    for (const part of [board.copyBand, board.copyRule, board.copyAccent, board.copyHeading, board.copyCount, board.copyText]) {
      part.visible = hasText
    }
    // 卡片很窄时字数和标题会打架，只留标题
    board.copyCount.visible = hasText && board.cell.w >= 260
    board.copyText.text = hasText ? this.fitVideoCopy(board, text) : ''
    board.copyText.fill = THEMES[this.theme].copyText
    board.copyCount.text = hasText ? `${countCopy(text)} 字` : ''
  }

  /** 三行之外收成省略号；Leafer 自己的多行省略号会画在被裁掉的那一行上 */
  private fitVideoCopy(board: Board, text: string) {
    const width = Math.max(1, board.cell.w - COPY_TEXT_LEFT * 2) * 0.98
    return fitText(text.trim(), width, COPY_LINES, measureVideoCopyText()).text
  }

  private updateVideoCopyLayout(board: Board) {
    const { w } = board.cell
    const top = board.svgHeight
    board.copyBand.set({ x: 0, y: top, width: w, height: VIDEO_COPY_BAND_HEIGHT })
    board.copyRule.set({ x: 0, y: top, width: w })
    board.copyAccent.set({ x: COPY_SIDE, y: top + COPY_HEADER_TOP + 2 })
    board.copyHeading.set({ x: COPY_TEXT_LEFT, y: top + COPY_HEADER_TOP })
    board.copyCount.set({ x: Math.max(1, w - COPY_SIDE - 88), y: top + COPY_HEADER_TOP })
    board.copyText.set({
      x: COPY_TEXT_LEFT,
      y: top + COPY_BODY_TOP,
      width: Math.max(1, w - COPY_TEXT_LEFT * 2),
      height: COPY_LINES * COPY_LINE_HEIGHT,
    })
  }

  /** 标签固定在屏幕空间，缩放时保持可读字号 */
  syncLabels() {
    const s = this.zoomValue
    this.boards.forEach((board) => {
      const x = this.camera.x + board.frame.x * s
      const y = this.camera.y + board.frame.y * s
      board.label.x = Math.round(x)
      board.label.y = Math.round(y - 22)
    })
  }

  private refreshAsset(board: Board, rebuildContent: boolean) {
    if (!board.asset.groups.some((group) => group.enabled !== false)) board.player?.pause()
    if (rebuildContent || !board.ready) {
      const { time = 0, playing = false } = board.player ?? {}
      board.contentHolder.removeAll(true)
      board.ready = false
      this.buildBoardContent(board)
      if (board.ready) {
        board.player.seek(time)
        if (playing) board.player.play()
      }
    } else {
      board.player.asset = board.asset
      board.player.rebuild()
      board.player.seek(board.player.time)
    }
  }

  private applyStyle(assetId: string, elementId: string, patch: StylePatch) {
    const board = this.boards.get(assetId)
    if (!board?.ready) return
    const el = board.content.elements.get(elementId)
    if (!el) return
    applyPatch(el, patch)
    board.player.invalidate()
    board.player.render(board.player.time)
    this.syncSelectionOverlay()
  }

  /* ----------------------------- playback ------------------------------ */

  play(assetId?: string, { restart = false } = {}) {
    const boards = assetId ? [this.boards.get(assetId)] : this.boards.values()
    for (const board of boards) {
      if (!board?.ready || !board.asset.groups.some((group) => group.enabled !== false)) continue
      if (restart) board.player.seek(0)
      board.player.play()
    }
    this.syncReviewMarkers()
    this.events.onPlaybackChange?.()
  }

  pause(assetId?: string) {
    if (assetId) this.boards.get(assetId)?.player.pause()
    else this.boards.forEach((b) => b.player.pause())
    this.events.onPlaybackChange?.()
  }

  seek(assetId: string, time: number) {
    const board = this.boards.get(assetId)
    if (!board) return
    const wasPlaying = board.player.playing
    board.player.pause()
    board.player.seek(Math.min(time, board.player.lastFrameTime))
    this.syncReviewMarkers()
    if (wasPlaying) this.events.onPlaybackChange?.()
  }

  showLastFrames() {
    this.boards.forEach((board) => {
      if (!board.ready || !board.asset.groups.some((group) => group.enabled !== false)) return
      board.player.pause()
      board.player.seek(board.player.lastFrameTime)
    })
    this.leafer.forceRender(undefined, true)
    this.syncSelectionOverlay()
    this.events.onPlaybackChange?.()
  }

  setLoop(loop: boolean) {
    this.loopEnabled = loop
    this.boards.forEach((b) => (b.player.loop = loop))
  }

  isPlaying(assetId: string) {
    return !!this.boards.get(assetId)?.player.playing
  }

  getDuration(assetId: string) {
    return this.boards.get(assetId)?.player.duration ?? 0
  }

  /* ----------------------------- selection ----------------------------- */

  select(sel: StudioSelection, fromCanvas = false, focusInspector = false) {
    this.selection = sel
    this.syncSelectionOverlay()
    if (!fromCanvas) {
      if (sel.assetId) this.focusBoard(sel.assetId, false)
    }
    this.events.onSelectionChange?.(sel, focusInspector)
  }

  private syncSelectionOverlay() {
    this.syncReviewRaster()
    this.syncReviewMarkers()
    const sel = this.selection
    const board = sel.assetId ? this.boards.get(sel.assetId) : undefined
    if (!board) {
      this.selectionBox.visible = false
      this.elementBox.visible = false
      return
    }
    const b = board.frame.getBounds('box', 'world')
    this.selectionBox.set({ x: b.x - 1, y: b.y - 1, width: b.width + 2, height: b.height + 2, visible: true } as any)

    if (sel.elementId) {
      const el = board.content.elements.get(sel.elementId)
      if (el) {
        const eb = el.wrapper.getBounds('box', 'world')
        this.elementBox.set({
          x: eb.x,
          y: eb.y,
          width: Math.max(2, eb.width),
          height: Math.max(2, eb.height),
          visible: true,
        } as any)
      } else this.elementBox.visible = false
    } else {
      this.elementBox.visible = false
    }
  }


  /* ---------------------------- 评审标注 ---------------------------- */

  /** 把评审结果叠到画布上；传空数组即清空。标注按根空间绘制，所以描边与字号不随缩放变化。 */
  setReviewMarkers(assetId: string | null, markers: ReviewMarker[], focus: string | null) {
    const same =
      this.reviewState.assetId === assetId &&
      this.reviewState.focus === focus &&
      this.reviewState.markers.length === markers.length &&
      this.reviewState.markers.every((m, i) => m.id === markers[i]?.id && m.level === markers[i]?.level && m.label === markers[i]?.label)
    this.reviewState = { assetId, markers, focus }
    if (!same) this.rebuildReviewLayer()
    this.syncReviewMarkers()
  }

  private rebuildReviewLayer() {
    for (const child of [...this.reviewLayer.children]) child.remove()
    this.reviewNodes = []
    for (const m of this.reviewState.markers) {
      const color = MARKER_COLOR[m.level] || MARKER_COLOR.WARN
      const rect = new Rect({
        stroke: color,
        strokeWidth: m.level === 'FAIL' ? 1.5 : 1,
        // 不给内容上色：标注只描边，画面颜色保持作者原本的样子
        fill: m.level === 'FAIL' ? 'rgba(248,113,113,0.07)' : m.level === 'PASS' ? 'rgba(52,211,153,0.07)' : undefined,
        cornerRadius: 2,
        hittable: false,
      } as any)
      const labelText = m.label || m.ruleId
      const chipW = 7 + labelText.length * 5.2
      const chip = new Group({ hittable: false })
      const bg = new Rect({ width: chipW, height: 13, cornerRadius: 3, fill: color, hittable: false } as any)
      const label = new Text({
        x: 3.5,
        y: 1.5,
        text: labelText,
        fontSize: 8.5,
        fill: m.level === 'WARN' || m.level === 'PASS' ? '#102018' : '#ffffff',
        fontFamily: 'SF Mono, Menlo, monospace',
        hittable: false,
      } as any)
      chip.add(bg)
      chip.add(label)
      this.reviewLayer.add(rect)
      this.reviewLayer.add(chip)
      this.reviewNodes.push({ rect, chip, ruleId: m.ruleId, level: m.level })
    }
  }

  private syncReviewMarkers() {
    const { assetId, markers, focus } = this.reviewState
    const board = assetId ? this.boards.get(assetId) : undefined
    const player = board?.player
    const awayFromLastFrame = player && player.groups.length > 0 &&
      (player.playing || player.time !== player.lastFrameTime)
    if (!board || !markers.length || awayFromLastFrame) {
      this.reviewLayer.visible = false
      this.reviewHits = []
      return
    }
    this.reviewLayer.visible = true
    const b = board.frame.getBounds('box', 'world')
    // 世界包围盒已经含相机缩放；用它的宽度反推“根空间”比例
    const k = b.width / Math.max(1e-6, board.asset.width * board.fit)
    const showChips = this.zoomValue >= 0.45
    const placed: { x: number; y: number; w: number; h: number }[] = []
    this.reviewHits = []
    markers.forEach((m, i) => {
      const node = this.reviewNodes[i]
      if (!node) return
      const x = b.x + m.bbox[0] * board.fit * k
      const y = b.y + m.bbox[1] * board.fit * k
      const w = Math.max(2, m.bbox[2] * board.fit * k)
      const h = Math.max(2, m.bbox[3] * board.fit * k)
      const dim = !!focus && focus !== m.ruleId
      const active = focus === m.ruleId
      node.rect.set({
        x,
        y,
        width: w,
        height: h,
        opacity: dim ? 0.38 : 1,
        strokeWidth: active ? 2 : m.level === 'FAIL' ? 1.5 : 1,
      } as any)

      // 标签靠右对齐到框的右上角：不压住阅读起点，也不和右侧的框抢位置
      const chipW = 7 + (m.label || m.ruleId).length * 5.2
      let cx = Math.min(x + w, b.x + b.width) - chipW
      let cy = y - 15
      if (y + h > b.y + b.height - 20) {
        // 贴着画板下沿：把标签放到画板下方的留白里，别盖住画面内容
        cy = b.y + b.height + 6
      } else if (cy < b.y + 2) {
        // 顶到画板边缘时依次退让：画板外侧左边 → 画板上方的留白（右对齐避开画板标题）→ 框内
        const gutter = b.x - chipW - 6
        if (gutter > 4) {
          cx = gutter
          cy = y
        } else if (b.y - 16 > 4) {
          cx = b.x + b.width - chipW
          cy = b.y - 16
        } else {
          cy = y + h + 2
        }
      }
      if (cy + 13 > b.y + b.height) cy = Math.max(b.y + 2, y + 2)
      // 同一处挤了多个标注时往上错开，避免叠成一坨
      for (let guard = 0; guard < 4; guard++) {
        const clash = placed.some((p) => cy < p.y + p.h && cy + 13 > p.y && Math.abs(p.x - cx) < Math.max(p.w, chipW))
        if (!clash) break
        cy -= 15
      }
      placed.push({ x: cx, y: cy, w: chipW, h: 13 })
      node.chip.set({ x: cx, y: cy, visible: showChips, opacity: dim ? 0.5 : 1 } as any)
      this.reviewHits.push({ ruleId: m.ruleId, x: Math.min(x, cx), y: Math.min(y, cy), w: Math.max(w, chipW + 4), h: h + Math.abs(cy - y) + 13 })
    })
  }

  /** 标注在根空间，命中测试要把屏幕点先换回根空间 */
  private hitReviewMarker(lx: number, ly: number): string | null {
    if (!this.reviewLayer.visible || !this.reviewHits.length) return null
    const z = this.zoomValue || 1
    const wx = (lx - this.camera.x) / z
    const wy = (ly - this.camera.y) / z
    for (const hit of this.reviewHits) {
      if (wx >= hit.x && wx <= hit.x + hit.w && wy >= hit.y && wy <= hit.y + hit.h) return hit.ruleId
    }
    return null
  }


  /* ---------------------------- 评审栅格 ---------------------------- */

  /** 画评审用的栅格（Ant Design 那套列栅格）：cols 列、gutter 槽、margin 边距，单位是用户单位 */
  setReviewRaster(assetId: string | null, cfg: { cols: number; gutter: number; margin: number } | null) {
    const next = cfg
      ? { assetId, cols: Math.max(1, Math.round(cfg.cols)), gutter: Math.max(0, cfg.gutter), margin: Math.max(0, cfg.margin) }
      : { assetId: null, cols: 0, gutter: 0, margin: 0 }
    const prev = this.reviewRaster
    const changed =
      prev.assetId !== next.assetId || prev.cols !== next.cols || prev.gutter !== next.gutter || prev.margin !== next.margin
    this.reviewRaster = next
    if (changed) this.rebuildReviewRaster()
    this.syncReviewRaster()
  }

  private rebuildReviewRaster() {
    for (const child of [...this.reviewRasterLayer.children]) child.remove()
    this.rasterNodes = []
    const { cols } = this.reviewRaster
    if (!cols) return
    for (let i = 0; i < cols; i++) {
      // 每一列 = 一条淡色色带 + 左边缘一条细线，读起来是「栅格」而不是「坐标纸」
      const band = new Rect({ fill: 'rgba(47,129,247,0.07)', hittable: false } as any)
      const edge = new Rect({ width: 1, fill: 'rgba(47,129,247,0.30)', hittable: false } as any)
      this.reviewRasterLayer.add(band)
      this.reviewRasterLayer.add(edge)
      this.rasterNodes.push({ band, edge })
    }
  }

  /** 单列几何：从左到右 margin + i*(colW+gutter) */
  private rasterGeometry(boardW: number) {
    const { cols, gutter, margin } = this.reviewRaster
    const usable = Math.max(1, boardW - margin * 2 - gutter * (cols - 1))
    const colW = usable / cols
    return { colW, gutter, margin }
  }

  private syncReviewRaster() {
    const { assetId, cols } = this.reviewRaster
    const board = assetId ? this.boards.get(assetId) : undefined
    if (!board || !cols || !this.rasterNodes.length) {
      this.reviewRasterLayer.visible = false
      return
    }
    const b = board.frame.getBounds('box', 'world')
    const k = b.width / Math.max(1e-6, board.asset.width * board.fit)
    const { colW, gutter, margin } = this.rasterGeometry(board.asset.width)
    this.reviewRasterLayer.visible = true
    this.rasterNodes.forEach((node, i) => {
      const x0 = margin + i * (colW + gutter)
      const x = b.x + x0 * board.fit * k
      const w = Math.max(0.5, colW * board.fit * k)
      node.band.set({ x, y: b.y, width: w, height: b.height } as any)
      node.edge.set({ x, y: b.y, width: 1, height: b.height } as any)
    })
  }

  /* ------------------------------- camera ------------------------------ */

  get zoomValue() {
    return this.camera.scaleX || 1
  }

  setZoom(next: number, focus?: { x: number; y: number }, silent = false) {
    const clamped = this.clampZoom(next)
    if (silent) {
      const camera = this.camera
      const current = camera.scaleX || 1
      const center = focus || { x: this.container.clientWidth / 2, y: this.container.clientHeight / 2 }
      camera.scaleOfWorld(center, clamped / current, clamped / current)
      this.zoom = clamped
      this.leafer.updateLayout?.()
      this.drawGrid()
      this.syncSelectionOverlay()
      this.syncLabels()
      return
    }
    this.animateZoomTo(clamped, focus)
  }

  zoomBy(factor: number, focus?: { x: number; y: number }) {
    this.animateZoomTo(this.zoomValue * factor, focus)
  }

  panBy(dx: number, dy: number) {
    this.zoomGesture = null
    this.camera.x += dx
    this.camera.y += dy
    this.afterCameraChange()
  }

  private afterCameraChange() {
    this.drawGrid()
    this.syncSelectionOverlay()
    this.syncLabels()
  }

  fitAll() {
    this.zoomGesture = null
    const bounds = this.contentBounds()
    if (!bounds) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    const pad = 56
    const scale = Math.min((w - pad * 2) / bounds.width, (h - pad * 2) / bounds.height, 1.4)
    const s = this.clampZoom(scale)
    this.camera.setTransform({ a: s, b: 0, c: 0, d: s, e: w / 2 - (bounds.x + bounds.width / 2) * s, f: h / 2 - (bounds.y + bounds.height / 2) * s } as any, false)
    this.zoom = s
    this.afterCameraChange()
    this.events.onZoom?.(s)
  }

  contentBounds() {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    this.boards.forEach((b) => {
      const { asset } = b
      minX = Math.min(minX, asset.x)
      minY = Math.min(minY, asset.y - LABEL_H)
      maxX = Math.max(maxX, asset.x + b.cell.w)
      maxY = Math.max(maxY, asset.y + b.cell.h)
    })
    if (!Number.isFinite(minX)) return null
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }

  focusBoard(assetId: string, animate = true) {
    this.zoomGesture = null
    const board = this.boards.get(assetId)
    if (!board) return
    const s = Math.min(1.2, Math.max(0.3, this.zoomValue))
    const cx = board.asset.x + board.cell.w / 2
    const cy = board.asset.y + board.cell.h / 2
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (animate) {
      const state = { x: this.camera.x, y: this.camera.y, scale: this.zoomValue }
      gsap.to(state, {
        x: w / 2 - cx * s,
        y: h / 2 - cy * s,
        scale: s,
        duration: 0.5,
        ease: 'power3.out',
        onUpdate: () => {
          this.camera.setTransform({ a: state.scale, b: 0, c: 0, d: state.scale, e: state.x, f: state.y } as any, false)
          this.zoom = state.scale
          this.afterCameraChange()
        },
        onComplete: () => this.events.onZoom?.(this.zoomValue),
      })
    } else {
      this.camera.setTransform({ a: s, b: 0, c: 0, d: s, e: w / 2 - cx * s, f: h / 2 - cy * s } as any, false)
      this.zoom = s
      this.afterCameraChange()
      this.events.onZoom?.(s)
    }
  }

  /* ------------------------------- theme ------------------------------- */

  setTheme(theme: StudioTheme) {
    this.theme = theme
    const c = THEMES[theme]
    this.leafer.fill = c.bg
    this.container.style.background = c.bg
    this.boards.forEach((board) => {
      board.frame.fill = c.board
      board.svgViewport.fill = c.board
      board.frame.stroke = board.asset.kind === 'animated' ? c.boardStrokeActive : c.boardStroke
      ;(board.frame as any).shadow = theme === 'light' ? { x: 0, y: 10, blur: 26, color: 'rgba(15,23,42,0.10)' } : undefined
      const text = board.label.children[2] as any
      if (text) text.fill = c.label
      board.copyBand.fill = c.copyBand
      board.copyRule.fill = c.copyBandBorder
      board.copyAccent.fill = c.copyAccent
      board.copyHeading.fill = c.copyHeading
      board.copyCount.fill = c.copyCount
      this.updateVideoCopy(board)
    })
    this.drawGrid()
  }

  /* ------------------------------- grid -------------------------------- */

  toggleGrid(visible: boolean) {
    this.gridVisible = visible
    this.drawGrid()
  }

  setGridVisible(visible: boolean) {
    this.toggleGrid(visible)
  }

  drawGrid() {
    const ctx = this.gridCtx
    const w = this.container.clientWidth
    const h = this.container.clientHeight
    if (!ctx || !w || !h) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    if (!this.gridVisible) return

    const scale = this.zoomValue
    let step = 24
    while (step * scale < 14) step *= 2
    while (step * scale > 120) step /= 2
    const screenStep = step * scale
    const ox = this.camera.x
    const oy = this.camera.y

    if (screenStep >= 46) {
      // 线格
      ctx.lineWidth = 1
      const colors = THEMES[this.theme]
      ctx.strokeStyle = colors.gridMinor
      ctx.beginPath()
      const startX = ox % screenStep
      const startY = oy % screenStep
      for (let x = startX; x < w; x += screenStep) {
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, h)
      }
      for (let y = startY; y < h; y += screenStep) {
        ctx.moveTo(0, Math.round(y) + 0.5)
        ctx.lineTo(w, Math.round(y) + 0.5)
      }
      ctx.stroke()
      // 主网格：5 格加粗
      if (screenStep > 26) {
        ctx.strokeStyle = colors.gridMajor
        ctx.beginPath()
        const big = screenStep * 5
        const bx = ox % big
        const by = oy % big
        for (let x = bx; x < w; x += big) {
          ctx.moveTo(Math.round(x) + 0.5, 0)
          ctx.lineTo(Math.round(x) + 0.5, h)
        }
        for (let y = by; y < h; y += big) {
          ctx.moveTo(0, Math.round(y) + 0.5)
          ctx.lineTo(w, Math.round(y) + 0.5)
        }
        ctx.stroke()
      }
    } else {
      // 点格
      ctx.fillStyle = THEMES[this.theme].gridDot
      const startX = ox % screenStep
      const startY = oy % screenStep
      for (let x = startX; x < w; x += screenStep) {
        for (let y = startY; y < h; y += screenStep) {
          ctx.fillRect(Math.round(x), Math.round(y), 1, 1)
        }
      }
    }
  }

  /* ------------------------------- events ------------------------------ */

  private bindEvents() {
    const el = this.container
    el.addEventListener('wheel', this.onWheel, { passive: false })
    el.addEventListener('gesturestart', this.onGestureStart as any)
    el.addEventListener('gesturechange', this.onGestureChange as any)
    el.addEventListener('gestureend', this.onGestureEnd as any)
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('dblclick', this.onDoubleClick)
    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerCancel)
    window.addEventListener('blur', this.onBlur)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  }

  private localPoint(e: PointerEvent | WheelEvent) {
    const rect = this.container.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  private onDoubleClick = (e: MouseEvent) => {
    const p = this.localPoint(e as any)
    const hit = this.pick(p.x, p.y)
    if (hit?.assetId) this.focusBoard(hit.assetId)
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    const p = this.localPoint(e)
    let dx = e.deltaX
    let dy = e.deltaY
    if (e.deltaMode === 1) {
      dx *= 16
      dy *= 16
    } else if (e.deltaMode === 2) {
      dx *= 800
      dy *= 800
    }

    // macOS 触控板捏合 = ctrlKey + 小 delta；Safari 还会额外发 gesture 事件
    const pinch = e.ctrlKey || this.gestureActive
    if (pinch) {
      const factor = Math.min(1.35, Math.max(0.74, Math.exp(-dy * 0.0125)))
      this.zoomAt(factor, p)
      return
    }
    if (e.metaKey) {
      const factor = Math.min(1.35, Math.max(0.74, Math.exp(-dy * 0.0035)))
      this.zoomAt(factor, p)
      return
    }
    // 两指滚动 = 平移；Shift 转横向
    if (e.shiftKey && !dx) {
      dx = dy
      dy = 0
    }
    this.zoomGesture = null
    this.camera.x -= dx
    this.camera.y -= dy
    this.afterCameraChange()
  }

  private onGestureStart = (e: any) => {
    e.preventDefault()
    this.gestureActive = true
    this.gestureBaseScale = this.zoomGesture ? this.zoomGesture.s1 : this.zoomValue
    this.startZoom(this.localPoint(e))
    this.zoomGesture!.s1 = this.clampZoom(this.gestureBaseScale)
  }

  private onGestureChange = (e: any) => {
    e.preventDefault()
    if (!this.zoomGesture) this.startZoom(this.localPoint(e))
    const g = this.zoomGesture!
    g.anchor = this.localPoint(e)
    g.s1 = this.clampZoom(this.gestureBaseScale * (e.scale || 1))
    g.lastAt = performance.now()
  }

  private onGestureEnd = (e: any) => {
    e.preventDefault()
    this.gestureActive = false
  }

  private onPointerDown = (e: PointerEvent) => {
    if (!e.isPrimary || e.button === 2 || this.dragging) return
    const p = this.localPoint(e)
    const wantsPan = e.button === 1 || this.spaceDown || e.altKey
    if (!wantsPan) {
      const marker = this.hitReviewMarker(p.x, p.y)
      if (marker) {
        this.events.onReviewMarkerClick?.(marker)
        return
      }
    }
    const hit = this.pick(p.x, p.y)
    const board = !wantsPan && hit && !hit.elementId ? this.boards.get(hit.assetId) : undefined
    this.moved = false
    if (board) {
      this.dragging = { pointerId: e.pointerId, mode: 'move', board }
      this.select({ assetId: board.asset.id }, true, true)
    } else {
      this.dragging = { pointerId: e.pointerId, mode: 'pan', startX: p.x, startY: p.y, camX: this.camera.x, camY: this.camera.y }
    }
    if (board || wantsPan || !hit) this.container.style.cursor = 'grabbing'
  }

  private onBoardDrag = (event: DragEvent) => {
    const drag = this.dragging
    if (drag?.mode !== 'move') return
    this.moved = true
    this.zoomGesture = null
    const { x, y } = event.getInnerTotal(this.boardsLayer)
    drag.board.frame.set({ x: drag.board.asset.x + x, y: drag.board.asset.y + y })
    this.syncSelectionOverlay()
    this.syncLabels()
  }

  private onBoardDragEnd = (event: DragEvent & { isCancel?: boolean }) => {
    const drag = this.dragging
    if (drag?.mode !== 'move' || !this.moved) return
    if (event.isCancel) {
      this.cancelPointer()
      return
    }
    this.onBoardDrag(event)
    const { board } = drag
    this.dragging = null
    this.container.style.cursor = this.spaceDown ? 'grab' : 'default'
    this.events.onBoardMove?.(board.asset.id, board.frame.x, board.frame.y)
  }

  private onPointerMove = (e: PointerEvent) => {
    const drag = this.dragging
    if (!drag) {
      const p = this.localPoint(e)
      const over = !!this.hitReviewMarker(p.x, p.y)
      if (over !== this.hoverMarker) {
        this.hoverMarker = over
        this.container.style.cursor = over ? 'pointer' : this.spaceDown ? 'grab' : 'default'
      }
      return
    }
    if (drag.pointerId !== e.pointerId || drag.mode !== 'pan') return
    const p = this.localPoint(e)
    const dx = p.x - drag.startX
    const dy = p.y - drag.startY
    if (Math.abs(dx) + Math.abs(dy) <= 2 && !this.moved) return
    this.moved = true
    this.zoomGesture = null
    this.camera.x = drag.camX + dx
    this.camera.y = drag.camY + dy
    this.afterCameraChange()
  }

  private onPointerUp = (e: PointerEvent) => {
    if (this.dragging?.pointerId !== e.pointerId) return
    const moved = this.moved
    this.cancelPointer()
    if (moved) return
    const p = this.localPoint(e)
    const hit = this.pick(p.x, p.y)
    this.select(hit ? { assetId: hit.assetId, elementId: hit.elementId } : {}, true, !!hit)
  }

  private cancelPointer() {
    const drag = this.dragging
    this.dragging = null
    if (drag?.mode === 'move' && this.moved) {
      const { asset, frame } = drag.board
      frame.set({ x: asset.x, y: asset.y })
      this.syncSelectionOverlay()
      this.syncLabels()
    }
    this.container.style.cursor = this.spaceDown ? 'grab' : 'default'
  }

  private onPointerCancel = (e: PointerEvent) => {
    if (this.dragging?.pointerId === e.pointerId) this.cancelPointer()
  }

  private onBlur = () => {
    this.spaceDown = false
    this.cancelPointer()
  }

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code !== 'Space' || this.spaceDown || e.defaultPrevented) return
    const target = e.target
    if (target instanceof HTMLElement && !this.container.contains(target) && (target.tabIndex >= 0 || target.isContentEditable)) return
    this.spaceDown = true
    this.container.style.cursor = 'grab'
    e.preventDefault()
  }

  private onKeyUp = (e: KeyboardEvent) => {
    if (e.code === 'Space' && this.spaceDown) {
      this.spaceDown = false
      this.container.style.cursor = 'default'
    }
  }

  /** 命中测试：返回素材与元素 */
  pick(x: number, y: number): null | { assetId: string; elementId?: string; dragHandle?: boolean } {
    const s = this.leafer.selector as any
    if (!s) return null
    let res: any
    try {
      res = s.getByPoint({ x, y }, 0)
    } catch {
      return null
    }
    let target = res?.target
    if (!target) return null
    let elementId: string | undefined
    let assetId: string | undefined
    let dragHandle = false
    let cur: any = target
    while (cur) {
      const name: string = cur.name || ''
      if (!elementId && name.startsWith('svgw:')) elementId = name.slice(5)
      if (!elementId && name.startsWith('svg:')) elementId = name.slice(4)
      if (name.startsWith('boarddrag:')) {
        assetId = name.slice(10)
        dragHandle = true
        break
      }
      if (name.startsWith('board:')) {
        assetId = name.slice(6)
        break
      }
      cur = cur.parent
    }
    if (!assetId) return null
    if (elementId && !this.boards.get(assetId)?.content.elements.has(elementId)) elementId = undefined
    return { assetId, elementId, dragHandle }
  }

  /** 返回当前选中元素的只读信息（供面板显示） */
  getSelectedElement(): { element?: ConvertedElement; board?: Board } {
    const { assetId, elementId } = this.selection
    const board = assetId ? this.boards.get(assetId) : undefined
    if (!board) return {}
    return { board, element: elementId ? board.content.elements.get(elementId) : undefined }
  }

  getBoard(assetId: string) {
    return this.boards.get(assetId)
  }

  destroy() {
    const el = this.container
    el.removeEventListener('wheel', this.onWheel)
    el.removeEventListener('gesturestart', this.onGestureStart)
    el.removeEventListener('gesturechange', this.onGestureChange)
    el.removeEventListener('gestureend', this.onGestureEnd)
    el.removeEventListener('pointerdown', this.onPointerDown)
    el.removeEventListener('dblclick', this.onDoubleClick)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerCancel)
    window.removeEventListener('blur', this.onBlur)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    gsap.ticker.remove(this.onTick)
    this.ro?.disconnect()
    this.leafer.destroy()
    this.gridCanvas.remove()
  }
}
