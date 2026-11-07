import type { StylePatch } from '../../types'
import type { Snapshot } from './snapshot'

/**
 * 把侧边栏里改过的样式套回评审用的那份 SVG。
 * 评审必须看「画布上现在这张」，否则用户调完颜色和字号，评审还在量原始文件。
 * 只有位移/旋转/缩放是近似：用 CSS transform 复现，四舍五入到 0.01px。
 */
export function applyOverrides(
  snap: Snapshot,
  overrides: Record<string, StylePatch> | undefined,
  idMap: Map<string, Element>
): { applied: number; geometric: number; notes: string[] } {
  const notes: string[] = []
  let applied = 0
  let geometric = 0
  if (!overrides) return { applied, geometric, notes }

  for (const [id, patch] of Object.entries(overrides)) {
    const el = idMap.get(id)
    if (!el || !patch) continue

    const style = (el as SVGElement).style
    if (patch.fill !== undefined) {
      style.setProperty('fill', patch.fill === 'none' ? 'none' : patch.fill)
    }
    if (patch.stroke !== undefined) style.setProperty('stroke', patch.stroke === 'none' ? 'none' : patch.stroke)
    if (patch.strokeWidth !== undefined) style.setProperty('stroke-width', String(patch.strokeWidth))
    if (patch.opacity !== undefined) style.setProperty('opacity', String(patch.opacity))
    if (patch.fontSize !== undefined) style.setProperty('font-size', `${patch.fontSize}px`)
    if (patch.letterSpacing !== undefined) style.setProperty('letter-spacing', `${patch.letterSpacing}px`)
    if (patch.text !== undefined) el.textContent = patch.text
    if (patch.cornerRadius !== undefined && el.localName === 'rect') {
      el.setAttribute('rx', String(patch.cornerRadius))
      el.setAttribute('ry', String(patch.cornerRadius))
    }
    if (patch.width !== undefined && el.localName === 'rect') el.setAttribute('width', String(patch.width))
    if (patch.height !== undefined && el.localName === 'rect') el.setAttribute('height', String(patch.height))

    const wantsGeom =
      patch.x !== undefined || patch.y !== undefined || patch.rotation !== undefined || patch.scale !== undefined
    if (wantsGeom) {
      const bbox = (el as SVGGraphicsElement).getBBox?.()
      const parts: string[] = []
      if (bbox && (patch.x !== undefined || patch.y !== undefined)) {
        const dx = (patch.x ?? bbox.x) - bbox.x
        const dy = (patch.y ?? bbox.y) - bbox.y
        parts.push(`translate(${round(dx)}px, ${round(dy)}px)`)
      }
      if (patch.rotation !== undefined || patch.scale !== undefined) {
        parts.push(`rotate(${round(patch.rotation ?? 0)}deg)`)
        parts.push(`scale(${round(patch.scale ?? 1)})`)
      }
      if (parts.length) {
        style.setProperty('transform-box', 'fill-box')
        style.setProperty('transform-origin', 'center')
        style.setProperty('transform', parts.join(' '))
        geometric++
      }
    }
    applied++
  }

  if (geometric) notes.push(`覆盖：${geometric} 处位移/旋转按 CSS transform 近似复现，可能与画布有亚像素差`)
  return { applied, geometric, notes }
}

const round = (v: number) => Math.round(v * 100) / 100
