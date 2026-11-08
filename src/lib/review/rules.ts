import raw from './rules-core.json'
import fullRaw from './rules.json'
import type {
  CoverageRow,
  Gate,
  GatePower,
  Impact,
  Level,
  Medium,
  Provenance,
  Rule,
  Ruleset,
  ThresholdKind,
} from './types'

/**
 * 规则库快照。数值只来自这份 JSON：阈值不在评审代码里现场发明。
 * 来源：quant-visual-review/assets/rules.json（libraryVersion 见下）。
 * 重新同步：node scripts/sync-review-rules.mjs --from <skill>/assets/rules.json
 */
export const ruleset = raw as unknown as Ruleset
/** 收窄前的完整规则库（68 条），保留作对照与回退 */
export const fullRuleset = fullRaw as unknown as Ruleset
export const LIBRARY_VERSION = ruleset.libraryVersion

// 全量查询表：layout 里可能计算规则库外的项（例如格式塔、字重档），需要能查到定义
export const RULES: Record<string, Rule> = {
  ...Object.fromEntries(fullRuleset.rules.map((r) => [r.id, r])),
  ...Object.fromEntries(ruleset.rules.map((r) => [r.id, r])),
}
/** 当前生效的规则（23 条）；UI 与覆盖率只看这些 */
export const ACTIVE_IDS = new Set(ruleset.rules.map((r) => r.id))

/** 本实现真正能测的规则 → 需要的测量阶段。没进这张表的记 not_implemented，不算通过。 */
export const IMPLEMENTED: Record<string, Set<Stage>> = {
  'QL-01': new Set<Stage>(['layout']),
  'QL-02': new Set<Stage>(['layout']),
  'QL-03': new Set<Stage>(['layout']),
  'QL-07': new Set<Stage>(['media']),
  'VS-01': new Set<Stage>(['layout']),
  // DE-01 需要多帧采样才能说「全程不可见」，单帧评审不做，留在未实现里
  'AL-01': new Set<Stage>(['layout']),
  'AL-02': new Set<Stage>(['layout']),
  'GR-01': new Set<Stage>(['layout']),
  'GR-02': new Set<Stage>(['layout']),
  'CT-01': new Set<Stage>(['layout']),
  'CT-02': new Set<Stage>(['contrast']),
  'GE-02': new Set<Stage>(['layout']),
  'SP-01': new Set<Stage>(['layout']),
  'TY-01': new Set<Stage>(['layout']),
  'TY-02': new Set<Stage>(['layout']),
  'CORE-02': new Set<Stage>(['layout']),
  'TY-04': new Set<Stage>(['layout']),
  'TY-05': new Set<Stage>(['layout']),
  'TY-06': new Set<Stage>(['layout']),
  'TY-07': new Set<Stage>(['layout']),
  'TY-08': new Set<Stage>(['layout']),
  'RP-01': new Set<Stage>(['layout']),
  'TX-01': new Set<Stage>(['layout']),
  'CL-01': new Set<Stage>(['pixels']),
  'NS-01': new Set<Stage>(['pixels']),
}

export type Stage = 'layout' | 'contrast' | 'pixels' | 'media'

export const IMPACT_ORDER: Record<Impact, number> = { high: 0, medium: 1, low: 2 }
export const LEVEL_ORDER: Record<Level, number> = { FAIL: 0, WARN: 1, UNMEASURED: 2, PASS: 3 }
export const IMPACT_LABELS: Record<Impact, string> = { high: '高', medium: '中', low: '低' }

export const THRESHOLD_LABELS: Record<ThresholdKind, string> = {
  standard: '◆ 规范',
  convention: '◇ 惯例',
  proposal: '○ 提案',
}

const OPS: Record<string, (a: unknown, b: unknown) => boolean> = {
  gt: (a, b) => Number(a) > Number(b),
  lt: (a, b) => Number(a) < Number(b),
  gte: (a, b) => Number(a) >= Number(b),
  lte: (a, b) => Number(a) <= Number(b),
  eq: (a, b) => a === b,
  in: (a, b) => Array.isArray(b) && b.includes(a as never),
}

/** 三元闸门：先看 fail 再看 warn，都不命中即 PASS。 */
export function gateStatus(gate: Gate | undefined, value: unknown): Level {
  if (value === null || value === undefined) return 'UNMEASURED'
  if (!gate) return 'PASS'
  for (const level of ['fail', 'warn'] as const) {
    const cond = gate[level]
    if (!cond) continue
    for (const [op, threshold] of Object.entries(cond)) {
      const fn = OPS[op]
      if (!fn) continue
      try {
        if (fn(value, threshold)) return level === 'fail' ? 'FAIL' : 'WARN'
      } catch {
        /* 类型不匹配按不命中处理 */
      }
    }
  }
  return 'PASS'
}

/** 闸门权限：只有 exact 测量 + 非提案阈值 + blocker 才允许阻断。 */
export function gatePower(rule: Rule | undefined): GatePower {
  if (!rule) return 'warn'
  if (rule.threshold === 'proposal') return 'warn'
  if (rule.measure === 'model' || rule.measure === 'semantic') return 'warn'
  if (rule.severity !== 'blocker') return 'warn'
  return 'blocker'
}

export function provenanceOf(rule: Rule | undefined): Provenance {
  if (!rule) return { measure: 'exact', threshold: 'proposal' }
  return { measure: rule.measure, threshold: rule.threshold, citation: rule.citation }
}

/** 影响程度只从规则表查，不现场判。 */
export function impactOf(rule: Rule | undefined): Impact {
  const policy = ruleset.impactPolicy
  if (!rule) return policy.fallback || 'medium'
  const override = policy.override?.[rule.id]
  if (override && override in IMPACT_ORDER) return override
  const byPrinciple = policy.byPrinciple?.[rule.principle]
  return byPrinciple && byPrinciple in IMPACT_ORDER ? byPrinciple : policy.fallback || 'medium'
}

export function ruleAllowed(rule: Rule | undefined, medium: Medium): boolean {
  if (!rule) return false
  return (rule.medium || []).includes(medium)
}

/** 提案阈值 / 代理模型永不允许阻断——和 measure.py 的强制降级保持一致。 */
export function capLevel(level: Level, power: GatePower): Level {
  if (level === 'FAIL' && power !== 'blocker') return 'WARN'
  return level
}

export function buildCoverage(args: {
  medium: Medium
  findings: { ruleId: string; level: Level }[]
  unmeasured: { ruleId: string; reason: string }[]
  ran: Set<Stage>
  naRules?: Record<string, string>
}): { total: number; counts: Record<string, number>; measured: number; notMeasured: number; rules: CoverageRow[] } {
  const { medium, findings, unmeasured, ran } = args
  const naRules = args.naRules || {}
  const byRule = new Map<string, { ruleId: string; level: Level }[]>()
  for (const f of findings) {
    const list = byRule.get(f.ruleId) || []
    list.push(f)
    byRule.set(f.ruleId, list)
  }
  const um = new Map<string, string[]>()
  for (const u of unmeasured) {
    const list = um.get(u.ruleId) || []
    if (u.reason) list.push(u.reason)
    um.set(u.ruleId, list)
  }

  const rows: CoverageRow[] = []
  for (const rule of ruleset.rules) {
    if (rule.outOfScope) continue
    const row: CoverageRow = {
      ruleId: rule.id,
      title: rule.title,
      principle: rule.principle,
      severity: rule.severity,
      measure: rule.measure,
      threshold: rule.threshold,
    } as CoverageRow
    if (rule.severity === 'human' || rule.measure === 'semantic') {
      row.status = 'human'
      row.reason = '只能人审，不进自动闸门'
    } else if (naRules[rule.id]) {
      row.status = 'na'
      row.reason = naRules[rule.id]
    } else if (!ruleAllowed(rule, medium)) {
      row.status = 'na'
      row.reason = `medium=${medium} 不在 ${JSON.stringify(rule.medium)}`
    } else if (!IMPLEMENTED[rule.id]) {
      row.status = 'not_implemented'
      row.reason = '规则库有、这个评审器没有实现——只能进人审/待补，不算通过'
    } else if (![...IMPLEMENTED[rule.id]].some((s) => ran.has(s))) {
      row.status = 'not_run'
      row.reason = `需要 ${[...IMPLEMENTED[rule.id]].join('/')} 测量，本次没跑`
    } else {
      const hits = byRule.get(rule.id) || []
      if (hits.length) {
        row.status = 'measured'
        row.level = hits.map((h) => h.level).sort((a, b) => LEVEL_ORDER[a] - LEVEL_ORDER[b])[0]
        row.count = hits.length
      } else if (um.has(rule.id)) {
        row.status = 'unmeasured'
        row.reason = (um.get(rule.id) || []).filter(Boolean).join('；') || '测量条件不成立'
      } else {
        row.status = 'unmeasured'
        row.reason = '已实现但本次没有产出记录——按纪律记未测，不得当 PASS'
      }
    }
    rows.push(row)
  }

  const counts: Record<string, number> = {}
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1
  const measured = counts.measured || 0
  return {
    total: rows.length,
    counts,
    measured,
    notMeasured: Math.max(0, rows.length - measured - (counts.na || 0) - (counts.human || 0)),
    rules: rows,
  }
}
