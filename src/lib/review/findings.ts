import { RULES, capLevel, gatePower, impactOf, provenanceOf } from './rules'
import type { Finding, Level, QvElement } from './types'

export interface RawFinding {
  ruleId: string
  element: string
  measured: number | string | boolean
  unit: string
  status: Level
  method: string
  metric?: string
  evidence?: Record<string, unknown>
  /** 人工给这条 finding 一个改法（元素 + 属性 + from → to）；不给就按规则模板生成 */
  fix?: string | null
}

/** 二级指标的错法不一样：卡片上的「错在哪」要跟着指标走，不能照抄主规则的文案 */
const METRIC_VIOLATION: Record<string, string> = {
  out_of_safe: '内容离画面边缘太近，平台二次裁切或播放器安全边会把它切掉。',
  size_ratio_rank1_body: '标题和正文的字号差不到 1.5 倍，主次读不出来。',
  text_accent_colors: '强调色用得太多，读者看不出哪一种才代表重点。',
  dominant_share: '没有主色：每种颜色的面积差不多，画面发花。',
  rule_line_offset_spread: '同类分隔线的上留白不一致，读数时行距忽宽忽窄。',
}

export function makeFinding(raw: RawFinding, seq: number): Finding {
  const rule = RULES[raw.ruleId]
  const power = gatePower(rule)
  const level = capLevel(raw.status, power)
  const finding: Finding = {
    id: `F-${String(seq).padStart(3, '0')}`,
    ruleId: raw.ruleId,
    title: rule?.title || raw.ruleId,
    principle: rule?.principle || '未归类',
    violation: METRIC_VIOLATION[raw.metric || raw.method] || rule?.violation || '',
    impact: impactOf(rule),
    level,
    measured: raw.measured,
    unit: raw.unit,
    metric: raw.metric || raw.method,
    method: raw.method,
    element: raw.element,
    evidence: raw.evidence || {},
    provenance: provenanceOf(rule),
    gatePower: power,
    fix: null,
  }
  if (level === 'FAIL' && raw.status === 'FAIL' && power !== 'blocker') {
    finding.capped = 'gate_power_downgraded'
  }
  const fix = raw.fix !== undefined ? raw.fix : defaultFix(finding)
  if (fix) finding.fix = fix
  else finding.fixReason = '这条规则只负责指出问题：改法取决于版式意图，不能由阈值反推'
  return finding
}

const n = (v: unknown, digits = 2) => {
  const num = Number(v)
  return Number.isFinite(num) ? Number(num.toFixed(digits)) : null
}

/** 改法只从已测到的事实推：元素 + 属性 + from → to。推不出来就返回 null。 */
function defaultFix(f: Finding): string | null {
  const ev = f.evidence || {}
  switch (f.ruleId) {
    case 'QL-01':
      return `${f.element} 的文本超出容器 ${n(ev.overflowPx, 1)}px：改小字号或加宽容器，把 「${String(ev.text || '').slice(0, 12)}」 收回边界内`
    case 'QL-03': {
      const min = ev.basis === 'display_width' ? 14 : 0.022
      const unit = ev.basis === 'display_width' ? 'px' : '（短边比）'
      return `把 ${f.element} 的字号从 ${n(ev.effectiveFontSize ?? ev.declaredFontSize, 1)}${unit} 提到 ${min}${unit} 以上，或换更短的文案`
    }
    case 'QL-04':
      return `把 ${f.element} 的行高从 ${n(f.measured)} 改成 ${ev.display ? 1.08 : 1.5} 倍字号（约 ${Math.round(Number(ev.fontSize || 0) * (ev.display ? 1.08 : 1.5))}px）`
    case 'QL-02':
      return `把压在 ${f.element} 上的元素挪开或降到 opacity 0.5 以下：遮挡比例 ${n(f.measured)}`
    case 'VS-01':
      return `把 ${f.element} 移回画布内：外侧超出 ${n(ev.outPx ?? ev.outsidePx, 1)}px`
    case 'CT-02':
      return `把 ${f.element} 的文字色从 ${String(ev.fg)} 调深/调浅，与底色 ${String(ev.bg)} 达到 4.5:1 以上（实测 ${n(f.measured)}:1）`
    case 'AL-01':
      return `把这一组的左边缘对齐到 ${n(ev.anchor, 1)}px：p90 偏差 ${n(f.measured, 1)}px`
    case 'AL-02':
      return `把 ${f.element} 两侧留白调成相等：上 ${n(ev.gapAbove, 1)}px / 下 ${n(ev.gapBelow, 1)}px`
    case 'GR-01':
      return `把元素起点对齐到 ${n(ev.unit, 1)}px 的网格：当前 ${n(f.measured, 2)} 的元素在格上`
    case 'GR-02':
      return `把组间缝从 ${n(ev.betweenMin, 1)}px 拉到组内中位 ${n(ev.withinMedian, 1)}px 的 1.8 倍以上`
    case 'CT-01':
      return `把一级标题与第二档的字号比从 ${n(f.measured)} 拉到 1.2 倍以上（当前 ${(ev.sizes as number[] | undefined)?.join(' / ') || ''}）`
    case 'TY-05':
      return `相邻两档字号拉开到 1.2 倍以上：当前档位 ${(ev.ratios as number[] | undefined)?.join(' / ') || ''}`
    case 'TY-04':
      return `把阶梯外字号 ${(ev.off as string[] | undefined)?.join(', ') || ''} 改回阶梯 ${(ev.ladder as number[] | undefined)?.join(', ') || ''}`
    case 'TY-07':
      return `把 ${f.element} 的长段落改成左对齐：当前 text-anchor=middle 且超过 30 字`
    case 'TY-08':
      return `把 ${f.element} 的字重从 300 以下提到 400：字号 ${n(ev.fontSize, 1)}px 本来就小`
    case 'SP-01':
      return `把间距收敛到 4–6 档：当前用了 ${n(f.measured, 0)} 档（${(ev.levels as number[] | undefined)?.slice(0, 8).join(', ') || ''}）`
    case 'TY-06':
      return `把字重档位收到 3 档以内：当前 ${(ev.weights as number[] | undefined)?.join(', ') || ''}`
    case 'RP-01':
      return `把字号档位从 ${n(f.measured, 0)} 收到 5 档以内：${(ev.sizes as number[] | undefined)?.join(' / ') || ''}`
    case 'TX-01':
      return `把中性文字色收到 ${3} 种以内：当前 ${(ev.colors as string[] | undefined)?.join(', ') || ''}`
    case 'CL-01':
      return `把主色收到 6 个以内：当前 ${n(f.measured, 0)} 个（${(ev.palette as string[] | undefined)?.slice(0, 6).join(', ') || ''}）`
    case 'NS-01':
      return `给内容留出边距：背景占比 ${n(f.measured, 2)}，目标 0.3 以上`
    case 'QL-07':
      return `给 ${f.element} 补上可用的图片地址：当前是空引用或无法解码`
    case 'GE-02':
      return `把 ${f.element} 的样式签名改成与同类一致：当前这一组出现 ${n(ev.variants, 0)} 种写法`
    default:
      return null
  }
}

export function sortFindings(findings: Finding[]): Finding[] {
  const impactRank = { high: 0, medium: 1, low: 2 } as const
  const levelRank = { FAIL: 0, WARN: 1, UNMEASURED: 2, PASS: 3 } as const
  return [...findings].sort(
    (a, b) =>
      impactRank[a.impact] - impactRank[b.impact] ||
      levelRank[a.level] - levelRank[b.level] ||
      a.ruleId.localeCompare(b.ruleId) ||
      String(a.element).localeCompare(String(b.element))
  )
}

export const textOf = (el: QvElement | undefined) => (el?.text || '').slice(0, 80)
