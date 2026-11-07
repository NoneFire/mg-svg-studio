import { apply, mul, translate, type Mat } from '../matrix'
import type { ConvertedElement } from '../convert'
import { solveLayout } from './engine'
import type { LayoutBox, LayoutItem, LayoutSpec } from './types'
import { DEFAULT_LAYOUT } from './types'

export interface LayoutApplyResult {
  boxes: LayoutBox[]
  width: number
  height: number
  origin: { x: number; y: number }
}

/** 元素在父容器局部坐标系里的轴对齐盒（不含布局偏移，可重复计算不漂移） */
export function baseBox(child: ConvertedElement) {
  const { bbox, baseMatrix } = child
  const corners = [
    [bbox.x, bbox.y],
    [bbox.x + bbox.width, bbox.y],
    [bbox.x, bbox.y + bbox.height],
    [bbox.x + bbox.width, bbox.y + bbox.height],
  ].map(([x, y]) => apply(baseMatrix as Mat, x, y))
  const xs = corners.map((p) => p.x)
  const ys = corners.map((p) => p.y)
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  }
}

export function measureChildren(container: ConvertedElement): { items: LayoutItem[]; origin: { x: number; y: number } } {
  const boxes = container.children.map((child) => {
    if (child.el.kind === 'group' && child.children.length) {
      const b = child.wrapper.getBounds('box', container.node as any)
      return { id: child.el.id, x: b.x, y: b.y, width: Math.max(1, b.width), height: Math.max(1, b.height) }
    }
    const b = baseBox(child)
    return { id: child.el.id, x: b.x, y: b.y, width: b.width, height: b.height }
  })
  if (!boxes.length) return { items: [], origin: { x: 0, y: 0 } }
  return {
    items: boxes,
    origin: { x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)) },
  }
}

/**
 * 用布局内核重排一个容器（<g>）的直接子元素。
 * 只写偏移，不动元素自身的 transform，也不影响动画轨道。
 */
export function layoutContainer(container: ConvertedElement, specIn: Partial<LayoutSpec>): LayoutApplyResult {
  const spec: LayoutSpec = { ...DEFAULT_LAYOUT, ...specIn }
  const { items, origin } = measureChildren(container)
  const solved = solveLayout(items, { ...spec, padding: spec.padding ?? 0 })
  const boxes = solved.boxes.map((b) => ({ ...b, x: b.x + origin.x, y: b.y + origin.y }))

  for (const box of boxes) {
    const child = container.children.find((c) => c.el.id === box.id)
    if (!child) continue
    const base = baseBox(child)
    child.layoutOffset = { x: box.x - base.x, y: box.y - base.y }
  }

  return { boxes, width: solved.width, height: solved.height, origin }
}

export function clearContainerLayout(container: ConvertedElement) {
  container.children.forEach((child) => {
    child.layoutOffset = undefined
  })
}
