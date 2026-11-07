import type { Asset } from '../../types'
import { convertSvg, elementBaseMatrix } from '../convert'
import { layoutContainer } from '../layout/apply'
import { AssetPlayer } from '../runtime'
import { parseSvgDocument } from '../svg-doc'
import type { Snapshot } from './snapshot'

const animatedStyle: Record<string, { field: string; unit?: string }> = {
  opacity: { field: 'opacity' },
  fill: { field: 'fill' },
  stroke: { field: 'stroke' },
  'stroke-width': { field: 'strokeWidth' },
  'stroke-dashoffset': { field: 'dashOffset' },
  'font-size': { field: 'fontSize', unit: 'px' },
  'letter-spacing': { field: 'letterSpacing', unit: 'px' },
}

/** 用 Studio 的播放器和布局内核取样，再写回用于测量的 SVG。 */
export function applyStudioFrame(snap: Snapshot, asset: Asset, ids: Map<string, Element>, frame: number) {
  const converted = convertSvg(parseSvgDocument(asset.svg), asset)
  const player = new AssetPlayer(converted, asset)
  const targets = new Map<string, Set<string>>()
  for (const group of asset.groups) {
    for (const id of group.targetIds?.length ? group.targetIds : [group.targetId]) {
      const properties = targets.get(id) || new Set<string>()
      for (const track of group.tracks) properties.add(track.property)
      targets.set(id, properties)
    }
  }

  for (const [id, spec] of Object.entries(asset.layouts || {})) {
    const container = converted.elements.get(id)
    if (!container) continue
    layoutContainer(container, spec)
    for (const child of container.children) child.wrapper.setTransform(elementBaseMatrix(child), false)
  }

  if (player.groups.length) player.render(Math.min(player.duration * frame, player.lastFrameTime))
  for (const element of [snap.svg, ...Array.from(snap.svg.querySelectorAll<SVGElement>('*'))]) {
    element.style?.setProperty('animation', 'none', 'important')
    element.style?.setProperty('transition', 'none', 'important')
  }
  snap.svg.querySelectorAll('animate, animateTransform, animateMotion, set').forEach((node) => node.remove())

  for (const [id, entry] of converted.elements) {
    const svg = ids.get(id) as SVGElement | undefined
    if (!svg?.style) continue
    const properties = targets.get(id)
    const style = svg.style
    const set = (name: string, value: string) => style.setProperty(name, value, 'important')
    const override = asset.overrides?.[id]
    if (entry.layoutOffset || entry.overrideMatrix || properties?.has('transform')) {
      const { a, b, c, d, e, f } = entry.wrapper.getTransform('local')
      set('transform-origin', '0px 0px')
      set('transform-box', 'view-box')
      set('transform', `matrix(${a},${b},${c},${d},${e},${f})`)
    }

    const node = entry.node as unknown as Record<string, unknown>
    for (const [property, { field, unit }] of Object.entries(animatedStyle)) {
      if (!properties?.has(property)) continue
      const value = node[field]
      if (typeof value === 'string' || typeof value === 'number') set(property, String(value) + (unit || ''))
    }
    for (const property of ['width', 'height'] as const) {
      if ((properties?.has(property) || override?.[property] !== undefined) && typeof node[property] === 'number') {
        svg.setAttribute(property, String(node[property]))
        set(property, `${node[property]}px`)
      }
    }
    if (properties?.has('visibility') && node.visible === false) set('visibility', 'hidden')
  }

  snap.duration = player.groups.length ? player.duration : 0
  snap.animationCount = asset.groups.filter((group) => group.enabled !== false).length
  snap.hasSmil = false
}
