import type { StylePatch } from '../types'

export const NUMERIC_STYLE = new Set([
  'strokeWidth', 'opacity', 'x', 'y', 'rotation', 'scale',
  'width', 'height', 'cornerRadius', 'fontSize', 'letterSpacing',
])
const TEXT_STYLE = new Set(['fill', 'stroke', 'text'])
const NONNEGATIVE = new Set(['strokeWidth', 'width', 'height', 'cornerRadius'])

export function parseStylePatch(value: unknown): StylePatch {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('样式补丁必须是对象')
  const entries = Object.entries(value)
  if (!entries.length) throw new Error('请至少提供一个样式属性')
  for (const [key, item] of entries) {
    if (TEXT_STYLE.has(key)) {
      if (typeof item !== 'string') throw new Error(`样式 ${key} 需要字符串`)
    } else if (NUMERIC_STYLE.has(key)) {
      if (typeof item !== 'number' || !Number.isFinite(item)) throw new Error(`样式 ${key} 需要有限数字`)
      if (key === 'opacity' && (item < 0 || item > 1)) throw new Error('不透明度必须在 0 到 1 之间')
      if (NONNEGATIVE.has(key) && item < 0) throw new Error(`样式 ${key} 不能小于 0`)
      if ((key === 'scale' || key === 'fontSize') && item <= 0) throw new Error(`样式 ${key} 必须大于 0`)
    } else {
      throw new Error(`不支持的样式属性：${key}`)
    }
  }
  return Object.fromEntries(entries) as StylePatch
}
