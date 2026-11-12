import type { Asset } from '../types'
import { assetCardHeight } from './asset-card'
import { solveLayout } from './layout/engine'

/**
 * 画布格子：把素材画板当成单元格里的内容。
 * 顺序 → 槽位 → 绝对坐标，和布局内核一样是纯计算，渲染层只照着摆。
 */
export const BOARD_MAX_W = 560
export const BOARD_MAX_H = 380
/** 画板标题条的高度：标签画在画板正上方 */
export const LABEL_H = 26
/** 格子之间的默认留白 */
export const GAP = 90

export interface GridSettings {
  /** 一行放几个格子 */
  cols: number
  /** 格子之间的留白 */
  gap: number
}

/** 一整块格子：包含标题条与格子间隙，背景上按这个矩形画格子 */
export interface CellRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CanvasGrid {
  /** 从左上到右下的格子顺序 */
  order: string[]
  /** 每个素材画板的左上角 */
  slots: Map<string, { x: number; y: number }>
  /** 每个格子（含标题条与半格留白），key 是占住这个格子的素材 */
  cells: Map<string, CellRect>
  cols: number
}

/** 画板尺寸：按素材原始比例缩到上限内，视频文案条另算高度 */
export function cardSize(asset: Pick<Asset, 'width' | 'height' | 'videoCopy'>) {
  const fit = Math.min(BOARD_MAX_W / Math.max(1, asset.width), BOARD_MAX_H / Math.max(1, asset.height), 1)
  return {
    w: Math.max(80, asset.width * fit),
    h: assetCardHeight(Math.max(60, asset.height * fit), asset.videoCopy),
  }
}

/** 画布上的可视顺序：先上后下、先左后右；完全重合时按创建时间兜底，保证排序稳定 */
export function visualOrder(assets: Asset[]): Asset[] {
  return [...assets].sort(
    (a, b) => a.y - b.y || a.x - b.x || a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )
}

/** 把 id 挪到第 index 个格子，其余依次让位 */
export function moveInOrder(order: string[], id: string, index: number): string[] {
  const from = order.indexOf(id)
  if (from < 0) return [...order]
  const to = Math.max(0, Math.min(order.length - 1, Math.round(index)))
  if (to === from) return [...order]
  const next = [...order]
  next.splice(from, 1)
  next.splice(to, 0, id)
  return next
}

/** 按给定顺序排格子，返回槽位、格子矩形与最终顺序 */
export function layoutByOrder(assets: Asset[], order: string[], settings: GridSettings): CanvasGrid {
  const byId = new Map(assets.map((asset) => [asset.id, asset]))
  const list = order.map((id) => byId.get(id)).filter((asset): asset is Asset => !!asset)
  const cols = Math.max(1, Math.round(settings.cols || 1))
  const gap = Math.max(0, Number.isFinite(settings.gap) ? settings.gap : GAP)
  const items = list.map((asset) => {
    const size = cardSize(asset)
    return { id: asset.id, width: size.w, height: size.h }
  })
  const { boxes } = solveLayout(items, {
    mode: 'grid',
    cols,
    gap,
    rowGap: gap + LABEL_H,
    alignX: 'start',
    alignY: 'start',
  })

  // 格子宽取最宽的一张卡，行高取该行最高的一张卡：同列的格子对齐，行内不互相压
  const colW = Math.max(1, ...items.map((item) => item.width))
  const rowHeights: number[] = []
  items.forEach((item, index) => {
    const row = Math.floor(index / cols)
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, item.height)
  })

  const slots: CanvasGrid['slots'] = new Map()
  const cells: CanvasGrid['cells'] = new Map()
  boxes.forEach((box, index) => {
    const row = Math.floor(index / cols)
    slots.set(box.id, { x: box.x, y: box.y })
    cells.set(box.id, {
      x: box.x - gap / 2,
      y: box.y - LABEL_H - gap / 2,
      width: colW + gap,
      height: (rowHeights[row] ?? 0) + LABEL_H + gap,
    })
  })
  return { order: list.map((asset) => asset.id), slots, cells, cols }
}

/** 当前排版：按可视顺序排格子 */
export function canvasGrid(assets: Asset[], settings: GridSettings): CanvasGrid {
  return layoutByOrder(assets, visualOrder(assets).map((asset) => asset.id), settings)
}

/** 离某个点最近的格子，返回占住它的素材 id */
export function nearestSlot(grid: CanvasGrid, point: { x: number; y: number }): string | null {
  let best: string | null = null
  let bestDistance = Infinity
  grid.cells.forEach((cell, id) => {
    const dx = cell.x + cell.width / 2 - point.x
    const dy = cell.y + cell.height / 2 - point.y
    const distance = dx * dx + dy * dy
    if (distance < bestDistance) {
      bestDistance = distance
      best = id
    }
  })
  return best
}
