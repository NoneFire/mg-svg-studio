import { apply } from '../matrix'
import { elementBaseMatrix, type ConvertedAsset, type ConvertedElement } from '../convert'
import { solveLayout } from './engine'
import type { LayoutSpec } from './types'

function measureChild(child: ConvertedElement) {
  const bounds = child.wrapper.getBounds('box', 'inner')
  const matrix = child.overrideMatrix ?? child.baseMatrix
  const corners = [
    [bounds.x, bounds.y],
    [bounds.x + bounds.width, bounds.y],
    [bounds.x, bounds.y + bounds.height],
    [bounds.x + bounds.width, bounds.y + bounds.height],
  ].map(([x, y]) => apply(matrix, x, y))
  const xs = corners.map((point) => point.x)
  const ys = corners.map((point) => point.y)
  return {
    id: child.el.id,
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    height: Math.max(1, Math.max(...ys) - Math.min(...ys)),
  }
}

function layoutContainer(container: ConvertedElement, spec: LayoutSpec) {
  const measured = container.children.map(measureChild)
  const x = Math.min(...measured.map((item) => item.x))
  const y = Math.min(...measured.map((item) => item.y))
  const items = measured.map((item) => ({ ...item, x: item.x - x, y: item.y - y }))
  // SVG 排布只写位置，单项宽度按实际图形计算。
  const result = solveLayout(items, { ...spec, maxWidth: null })
  result.boxes.forEach((box, index) => {
    const child = container.children[index]
    child.layoutOffset = { x: box.x - items[index].x, y: box.y - items[index].y }
    child.wrapper.setTransform(elementBaseMatrix(child), false)
  })
  return result
}

/** 在动画取帧前计算布局，先摆放内层组，再用其尺寸计算外层组。 */
export function applyAssetLayouts(converted: ConvertedAsset, layouts?: Record<string, LayoutSpec>) {
  const results = new Map<string, ReturnType<typeof layoutContainer>>()
  if (!layouts || !Object.keys(layouts).length) return results
  for (const container of [...converted.order].reverse()) {
    const spec = layouts[container.el.id]
    if (spec && container.children.length) results.set(container.el.id, layoutContainer(container, spec))
  }
  return results
}
