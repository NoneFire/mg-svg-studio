import { DEFAULT_LAYOUT, type Align, type Justify, type LayoutBox, type LayoutItem, type LayoutResult, type LayoutSpec } from './types'

/**
 * 纯函数布局内核：不依赖 DOM / Leafer / SVG。
 * 输入每个子项的固有尺寸与容器约束，输出每个子项在容器坐标系里的绝对矩形。
 * 画布（素材排布）、SVG 容器（元素重排）共用同一个内核。
 */
export function solveLayout(items: LayoutItem[], specIn: Partial<LayoutSpec> = {}): LayoutResult {
  const spec: LayoutSpec = { ...DEFAULT_LAYOUT, ...specIn }
  const pad = Math.max(0, spec.padding || 0)
  const gap = Math.max(0, spec.gap || 0)
  const rowGap = Math.max(0, specIn.rowGap ?? specIn.gap ?? gap)
  const innerW = spec.width ? Math.max(0, spec.width - pad * 2) : 0

  const size = (item: LayoutItem) => ({
    w: Math.max(1, Math.min(item.fixedWidth ?? item.width, spec.maxWidth ?? Infinity)),
    h: Math.max(1, item.fixedHeight ?? item.height),
  })

  if (spec.mode === 'free') {
    const boxes = items.map((item) => {
      const { w, h } = size(item)
      return { id: item.id, x: item.x ?? 0, y: item.y ?? 0, width: w, height: h }
    })
    return { boxes, ...extent(boxes) }
  }

  if (spec.mode === 'grid') return solveGrid(items, spec, size, pad, gap, rowGap, innerW)

  const horizontal = spec.mode === 'row'
  const lines: { items: LayoutItem[]; main: number; cross: number }[] = []
  let current: LayoutItem[] = []
  let mainUsed = 0

  for (const item of items) {
    const { w, h } = size(item)
    const mainSize = horizontal ? w : h
    const nextMain = current.length ? mainUsed + gap + mainSize : mainSize
    if (spec.wrap && spec.width && horizontal && nextMain > innerW && current.length) {
      lines.push(buildLine(current, mainUsed, size, horizontal))
      current = []
      mainUsed = 0
    }
    current.push(item)
    mainUsed = current.length === 1 ? mainSize : mainUsed + gap + mainSize
  }
  if (current.length) lines.push(buildLine(current, mainUsed, size, horizontal))

  const boxes: LayoutBox[] = []
  let crossPos = pad
  for (const line of lines) {
    const lineMain = line.main
    const free = horizontal ? innerW - lineMain : 0
    let offset = 0
    let extraGap = 0
    if (free > 0) {
      if (spec.justify === 'center') offset = free / 2
      else if (spec.justify === 'end') offset = free
      else if (spec.justify === 'between' && line.items.length > 1) extraGap = free / (line.items.length - 1)
    }
    let cursor = pad + offset
    for (const item of line.items) {
      const { w, h } = size(item)
      const crossSize = horizontal ? h : w
      const mainSize = horizontal ? w : h
      const crossContainer = horizontal ? line.cross : Math.max(innerW, line.cross)
      const crossOffset = alignOffset(crossContainer, crossSize, spec[horizontal ? 'alignY' : 'alignX'])
      if (horizontal) {
        boxes.push({ id: item.id, x: cursor, y: crossPos + crossOffset, width: w, height: h })
      } else {
        boxes.push({ id: item.id, x: crossPos + crossOffset, y: cursor, width: w, height: h })
      }
      cursor += mainSize + gap + extraGap
    }
    crossPos += line.cross + rowGap
  }

  const contentW = Math.max(spec.width ?? 0, Math.max(pad, ...boxes.map((b) => b.x + b.width)) + pad)
  const contentH = Math.max(pad, ...boxes.map((b) => b.y + b.height)) + pad
  return { boxes, width: contentW, height: contentH }
}

function buildLine(items: LayoutItem[], main: number, size: (i: LayoutItem) => { w: number; h: number }, horizontal: boolean) {
  const cross = Math.max(0, ...items.map((i) => (horizontal ? size(i).h : size(i).w)))
  return { items, main, cross }
}

function alignOffset(containerSize: number, itemSize: number, align: Align): number {
  switch (align) {
    case 'center':
      return (containerSize - itemSize) / 2
    case 'end':
      return containerSize - itemSize
    case 'stretch':
    case 'start':
    default:
      return 0
  }
}

function solveGrid(
  items: LayoutItem[],
  spec: LayoutSpec,
  size: (i: LayoutItem) => { w: number; h: number },
  pad: number,
  gap: number,
  rowGap: number,
  innerW: number
): LayoutResult {
  const cols = Math.max(1, Math.floor(spec.cols || 1))
  const maxItemW = Math.max(1, ...items.map((i) => size(i).w))
  const colW = Math.max(maxItemW, (innerW - gap * (cols - 1)) / cols)
  const rows = Math.ceil(items.length / cols)
  const rowHeights: number[] = []
  for (let r = 0; r < rows; r++) {
    const slice = items.slice(r * cols, r * cols + cols)
    rowHeights.push(Math.max(1, ...slice.map((i) => size(i).h)))
  }
  const boxes: LayoutBox[] = items.map((item, i) => {
    const { w, h } = size(item)
    const col = i % cols
    const row = Math.floor(i / cols)
    const cellX = pad + col * (colW + gap)
    const cellY = pad + rowHeights.slice(0, row).reduce((s, v) => s + v + rowGap, 0)
    return {
      id: item.id,
      x: cellX + alignOffset(colW, w, spec.alignX),
      y: cellY + alignOffset(rowHeights[row], h, spec.alignY),
      width: w,
      height: h,
    }
  })
  const width = pad * 2 + cols * colW + gap * (cols - 1)
  const height = pad * 2 + rowHeights.reduce((s, v) => s + v, 0) + rowGap * Math.max(0, rows - 1)
  return { boxes, width, height }
}

function extent(boxes: LayoutBox[]) {
  const width = Math.max(0, ...boxes.map((b) => b.x + b.width))
  const height = Math.max(0, ...boxes.map((b) => b.y + b.height))
  return { width, height }
}

/** 语义化预设，UI 上的「一键排布」用它 */
export const LAYOUT_PRESETS: Record<string, Partial<LayoutSpec>> = {
  row: { mode: 'row', gap: 24, alignY: 'center', justify: 'start' },
  rowSpread: { mode: 'row', gap: 24, alignY: 'center', justify: 'between' },
  column: { mode: 'column', gap: 16, alignX: 'start', justify: 'start' },
  grid3: { mode: 'grid', cols: 3, gap: 20, rowGap: 20, alignX: 'center', alignY: 'center' },
  grid2: { mode: 'grid', cols: 2, gap: 24, rowGap: 24, alignX: 'start', alignY: 'start' },
}

export function summarizeLayout(items: number, spec: LayoutSpec): string {
  const mode = spec.mode === 'row' ? '横向' : spec.mode === 'column' ? '纵向' : spec.mode === 'grid' ? `${spec.cols} 列网格` : '自由'
  return `${items} 个元素 · ${mode} · 间距 ${spec.gap}`
}

export type { LayoutSpec, LayoutItem, LayoutBox, LayoutResult }
