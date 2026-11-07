export type Mat = { a: number; b: number; c: number; d: number; e: number; f: number }

export type Color = { r: number; g: number; b: number; a: number }

export interface Keyframe {
  offset: number
  value: string
}

export interface PropTrack {
  id: string
  /** opacity / transform / letter-spacing / fill / stroke / stroke-width ... */
  property: string
  keyframes: Keyframe[]
}

export interface AnimGroup {
  id: string
  /** 展示名，例如 charIn / ruleIn / 手动轨道 */
  name: string
  /** 主目标；分层动画时为第一个元素 */
  targetId: string
  /** 分层：同一个动画作用在一组元素上 */
  targetIds?: string[]
  /** 分层交错延迟（秒） */
  stagger?: number
  duration: number
  delay: number
  ease: string
  iterations: number | 'infinite'
  direction: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse'
  fillMode: 'none' | 'forwards' | 'backwards' | 'both'
  tracks: PropTrack[]
  /** 提取来源：css | smil | manual */
  origin: 'css' | 'smil' | 'manual'
  /** 动画变换的基准点，相对元素包围盒（0-1） */
  originPoint: { x: number; y: number }
  enabled: boolean
}

export interface StylePatch {
  fill?: string
  stroke?: string
  strokeWidth?: number
  opacity?: number
  x?: number
  y?: number
  rotation?: number
  scale?: number
  width?: number
  height?: number
  cornerRadius?: number
  fontSize?: number
  letterSpacing?: number
  text?: string
}

import type { LayoutSpec } from './lib/layout/types'

export interface ProjectElement {
  id: string
  tag: string
  label: string
  depth: number
  kind: 'group' | 'shape' | 'text' | 'image' | 'other'
  parentId?: string
}

export interface Asset {
  id: string
  name: string
  svg: string
  width: number
  height: number
  kind: 'animated' | 'static'
  groups: AnimGroup[]
  /** 解析后的元素索引，供侧边栏 / CLI / Agent 定位元素 */
  elements?: ProjectElement[]
  overrides: Record<string, StylePatch>
  /** 容器元素 id → 布局 spec（由布局内核计算，渲染层只负责画） */
  layouts?: Record<string, LayoutSpec>
  warnings: string[]
  /** 最近一次评审的快照（非 PASS 明细）：随项目保存，CLI 直接读 */
  review?: import('./lib/review/types').ReviewSnapshot
  source: 'sample' | 'import'
  x: number
  y: number
  createdAt: number
  version: 1
}

export interface BoardRect {
  x: number
  y: number
  width: number
  height: number
}

export interface AssetRuntimeInfo {
  duration: number
  groupCount: number
  elementCount: number
}
