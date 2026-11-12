export type Mat = { a: number; b: number; c: number; d: number; e: number; f: number }

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
  origin: 'css' | 'smil' | 'manual' | 'lottie' | 'gsap'
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

/**
 * 一个历史版本：素材内容的一次快照。
 * 只存能重画这张图的字段，位置、名字、文案这些「当下」的东西不跟着复制。
 */
export interface AssetVersion {
  index: number
  createdAt: number
  label?: string
  svg: string
  width: number
  height: number
}

/** 素材的承载方式：svg 走 Studio 自己的解析，lottie / gsap 交给原生运行时 */
export type AssetFormat = 'svg' | 'lottie' | 'gsap'

export interface Asset {
  id: string
  name: string
  /** svg 素材是 SVG 源码；原生素材为空，原文放 payload */
  svg: string
  /** 原生素材的原始内容：Lottie 的 JSON 或自带 GSAP 的 SVG */
  format?: AssetFormat
  payload?: string
  /** 原生素材自带的时长（秒），时间轴用 */
  duration?: number
  width: number
  height: number
  kind: 'animated' | 'static'
  groups: AnimGroup[]
  /** 解析后的元素索引，供侧边栏 / CLI / Agent 定位元素 */
  elements?: ProjectElement[]
  /** 与 SVG 素材配套的视频文案 */
  videoCopy?: string
  /** 与视频文案配套的录音，使用可直接播放的 data URL 保存 */
  voiceoverAudio?: string
  overrides: Record<string, StylePatch>
  /** 容器元素 id → 布局 spec（由布局内核计算，渲染层只负责画） */
  layouts?: Record<string, LayoutSpec>
  warnings: string[]
  /** 最近一次规则评审快照：随项目保存，包含正反例明细 */
  review?: import('./lib/review/types').ReviewSnapshot
  /** 最近一次 Agent 语义评审：与公式评审分开保存、分开过期 */
  agentReview?: import('./lib/review/types').AgentReviewSnapshot
  /** 当前指到的历史版本（index 对应 versions 里的那一条） */
  revision?: { index: number; createdAt: number; label?: string }
  /** 历史版本：每项一份完整的 SVG 快照，随项目文件保存，按 index 升序 */
  versions?: AssetVersion[]
  source: 'sample' | 'import'
  x: number
  y: number
  createdAt: number
  version: 1
}

