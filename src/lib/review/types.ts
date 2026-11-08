/** 视觉评审的类型定义。字段与 quant-visual-review 的 findings.json 契约对齐。 */

export type Level = 'FAIL' | 'WARN' | 'PASS' | 'UNMEASURED'
export type Impact = 'high' | 'medium' | 'low'
export type GatePower = 'blocker' | 'warn'
export type MeasureKind = 'exact' | 'model' | 'semantic'
export type ThresholdKind = 'standard' | 'convention' | 'proposal'
export type Medium = 'ui' | 'print'

export interface Gate {
  fail?: Record<string, unknown>
  warn?: Record<string, unknown>
}

export interface Rule {
  id: string
  title: string
  severity: 'blocker' | 'warn' | 'info' | 'human'
  medium: Medium[]
  metric: string
  unit?: string
  gate: Gate
  gateLarge?: Gate
  gateUI?: { metric: string; gate: Gate }
  gateDisplay?: { metric: string; gate: Gate }
  secondary?: { metric?: string; gate?: Gate }
  minSamples?: number
  note?: string
  measure: MeasureKind
  threshold: ThresholdKind
  citation?: string
  principle: string
  violation: string
  needsPreciseBoxes?: boolean
  needsExactWidth?: boolean
  outOfScope?: string
}

export interface Ruleset {
  libraryVersion: number
  referenceCanvas: { width: number; height: number; note?: string }
  coveragePolicy: Record<string, string>
  dimensions: Record<string, string>
  impactPolicy: {
    axis: string
    labels: Record<string, string>
    byPrinciple: Record<string, Impact>
    override: Record<string, Impact>
    fallback: Impact
    order: Impact[]
    budget: { high: number | null; medium: number | null; low: number | null; elementsPerCard: number }
  }
  rules: Rule[]
  provenance: Record<string, Record<string, string>>
  principles: Record<string, string>
  scope: { in: string[]; out: string[]; note?: string }
}

export interface Provenance {
  measure: MeasureKind
  threshold: ThresholdKind
  citation?: string
}

/** 一个元素在一帧里的测量结果（对位 boxes.json 的 elements[]）。 */
export interface QvElement {
  id: string
  tag: string
  kind: 'group' | 'shape' | 'text' | 'image' | 'other'
  /** [x, y, w, h]，画布用户单位 */
  bbox: [number, number, number, number]
  z: number
  opacity: number
  text?: string
  fontSize?: number
  /** 行盒高度（基线间距），用户单位 */
  lineHeight?: number
  fontFamily?: string
  fontWeight?: number
  fill?: string
  align?: string
  charCount?: number
  /** 位图原始像素宽高（仅 data URI 的 PNG/JPEG 可读） */
  imgW?: number
  imgH?: number
  /** class 第一个 token，作为“同类”判据 */
  role?: string
  /** 最近的祖先组 id */
  container?: string
  /** 容器里「由图形构成的那块板」：兄弟图形元素的并集，用来判文字是否超出卡片 */
  containerFrame?: [number, number, number, number]
  /** 显式声明的分组（<g id> 或有 class 的 <g>） */
  group?: string
  style?: Record<string, string>
  /** 定格帧上是否真的画得出来（display/visibility/opacity 链） */
  visible?: boolean
  /** lineHeight 的来源：css 声明或基线间距推导 */
  lineHeightSource?: 'css' | 'baseline_delta'
}

export interface QvFrame {
  t: number
  elements: QvElement[]
}

export interface QvBoxes {
  canvas: { width: number; height: number }
  frames: QvFrame[]
  precision: 'exact' | 'estimated'
  precisionDetail?: { position: 'exact' | 'estimated'; width: 'exact' | 'estimated' }
  source: string
  /** 画面是否按 1080 短边归一 */
  scale: number
  meta: {
    duration: number
    animationCount: number
    smil: boolean
    imageCount: number
    brokenImages: string[]
    baked: boolean
  }
}

export interface Finding {
  id: string
  ruleId: string
  title: string
  principle: string
  violation: string
  impact: Impact
  level: Level
  /** 测出来的值；UNMEASURED 时为 null */
  measured: number | string | boolean | null
  unit: string
  metric: string
  method: string
  element: string
  evidence: Record<string, unknown>
  provenance: Provenance
  gatePower: GatePower
  fix: string | null
  fixReason?: string
  capped?: string
}

export interface CoverageRow {
  ruleId: string
  title: string
  principle: string
  severity: string
  measure: MeasureKind
  threshold: ThresholdKind
  status: 'measured' | 'unmeasured' | 'na' | 'human' | 'not_implemented' | 'not_run'
  level?: Level
  count?: number
  reason?: string
}

export interface Coverage {
  total: number
  counts: Record<string, number>
  measured: number
  notMeasured: number
  rules: CoverageRow[]
}

export interface ReviewCard {
  ruleId: string
  title: string
  principle: string
  violation: string
  impact: Impact
  level: Level
  count: number
  elementCount: number
  elementsSample: string[]
  measuredRange: number[]
  unit: string
  threshold: ThresholdKind
  measure: MeasureKind
  gatePower: GatePower
  fix: string | null
  /** 这条判定的补充说明（例如「装饰图形整块在画布外」），来自 evidence.note */
  note?: string
}

export interface ReviewSection {
  impact: Impact
  label: string
  findings: number
  cards: number
  shown: ReviewCard[]
  hidden: {
    cards: number
    findings: number
    ruleIds: string[]
    /** 折叠项的完整卡片：面板用一行紧凑条目把它们也露出来，不让 WARN 静默消失 */
    items: ReviewCard[]
  }
}

export interface ReviewView {
  mode: 'ui'
  budget: Record<string, number | null>
  byImpact: Record<Impact, { findings: number; rules: number }>
  sections: ReviewSection[]
  collapsed: { findings: number; detail: string }
}

export type GateVerdict = 'BLOCKED' | 'REVIEW_NEEDED' | 'DELIVERABLE'

export interface ReviewReport {
  assetId: string
  assetName: string
  /** 输入指纹：同一张画面重复评审必须可复现 */
  inputHash: string
  libraryVersion: number
  generatedAt: string
  canvas: { width: number; height: number }
  medium: Medium
  displayWidth?: number
  frame: number
  duration: number
  /** GR-01 推断出的网格：面板据此画网格并做手动校验 */
  grid: GridInfo
  /** 元素 id → 用户单位包围盒：画布标注用它把 finding 叠回原位 */
  boxes: Record<string, [number, number, number, number]>
  counts: { FAIL: number; WARN: number; PASS: number; UNMEASURED: number }
  gate: GateVerdict
  findings: Finding[]
  unmeasured: { ruleId: string; reason: string }[]
  coverage: Coverage
  view: ReviewView
  details: {
    elapsedMs: number
    raster: { width: number; height: number } | null
    notes: string[]
    animations: number
    elements: number
    texts: number
  }
}

/** 存进项目文件的规则评审快照，保留正例、反例与未测项 */
export interface ReviewSnapshot {
  inputHash: string
  options: ReviewOptions
  generatedAt: string
  libraryVersion: number
  gate: GateVerdict
  counts: ReviewReport['counts']
  coverage: { measured: number; total: number; counts: Record<string, number> }
  /** 全部规则结果：PASS 可作为正例，FAIL/WARN 可作为反例，未测仍明确保留。 */
  findings: Finding[]
}

export type AgentResultKind = 'positive' | 'negative' | 'unmeasured'

export interface AgentReviewResult {
  ruleId: string
  result: AgentResultKind
  reason: string
  elementId?: string
  bbox?: [number, number, number, number]
}

/** Agent 语义评审独立保存、独立过期，不混入公式规则闸门。 */
export interface AgentReviewSnapshot {
  inputHash: string
  options: ReviewOptions
  generatedAt: string
  results: AgentReviewResult[]
}

export interface GridInfo {
  /** 推断出的步长（用户单位）；推不出来是 null */
  unit: number | null
  tolerance: number
  share: number | null
  aligned: number
  samples: number
  offGrid: string[]
  source: 'inferred' | 'none'
}

export interface ReviewOptions {
  medium?: Medium
  /** 投放宽度（px）。给了就按 px 口径判字号，否则 QL-03 弃权 */
  displayWidth?: number
  /** 字号阶梯，用于 TY-04；不给就记未测 */
  scaleLadder?: number[]
  /** 定格位置：0 = 入场，1 = 末帧 */
  frame?: number
}
