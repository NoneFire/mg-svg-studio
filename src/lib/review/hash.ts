import type { Asset } from '../../types'
import type { ReviewOptions } from './types'

export type ReviewInput = Pick<Asset, 'svg' | 'overrides' | 'groups' | 'layouts' | 'width' | 'height'>

/** Stable input fingerprint used to mark old review results as stale. */
export function reviewInputHash(asset: ReviewInput, options: ReviewOptions = {}): string {
  const canonical = (value: unknown) => JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.keys(item).sort().map((key) => [key, item[key]]))
      : item,
  )
  return hashOf([
    'studio-frame-v2', asset.svg, String(asset.width), String(asset.height),
    canonical(asset.groups || []), canonical(asset.layouts || {}), canonical(asset.overrides || {}), canonical(options),
  ])
}

function hashOf(parts: string[]): string {
  let h = 0x811c9dc5
  const text = parts.join('\u0000')
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}
