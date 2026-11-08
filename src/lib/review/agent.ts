import type { Asset } from '../../types'
import type { AgentReviewResult, AgentResultKind, ReviewOptions, Rule } from './types'
import reviewExamples from './examples.json'

export type { AgentReviewResult, AgentResultKind } from './types'

type ReviewExample = (typeof reviewExamples)[number]

function normalizedRuleName(name: string) {
  return name.replace(/[（(][^）)]*[）)]/g, '').replace(/\s/g, '')
}

export function agentExamplesFor(ruleName: string): { positive?: string; negative?: string } {
  const matches = (reviewExamples as ReviewExample[]).filter(
    (example) => normalizedRuleName(example.ruleName) === normalizedRuleName(ruleName),
  )
  return {
    positive: matches.find((example) => example.caseType === '正例')?.description,
    negative: matches.find((example) => example.caseType === '反例')?.description,
  }
}

export interface AgentReviewDocument {
  assetId?: string
  inputHash?: string
  options?: ReviewOptions
  reviews: AgentReviewResult[]
}

/** 只把无数值指标、需语义理解的规则交给 Agent；定量规则仍由本地公式负责。 */
export function agentReviewRules(rules: Rule[]) {
  return rules.filter((rule) => !rule.outOfScope && (rule.measure === 'semantic' || rule.severity === 'human'))
}

export function buildAgentReviewPrompt(
  asset: Asset,
  rules: Rule[],
  frameSvg = asset.svg,
  inputHash = '',
  options: ReviewOptions = { medium: 'ui', displayWidth: Math.round(asset.width), frame: 1 },
) {
  const ruleList = rules
    .map((rule) => {
      const examples = agentExamplesFor(rule.title)
      return [
        `- ${rule.id}｜${rule.title}｜原则：${rule.principle}`,
        `  评审问题：${rule.violation}`,
        examples.positive ? `  正例参考（不是当前素材结论）：${examples.positive}` : '',
        examples.negative ? `  反例参考（不是当前素材结论）：${examples.negative}` : '',
      ].filter(Boolean).join('\n')
    })
    .join('\n')
  return [
    '你是 MG SVG Studio 的 Agent 评审员。请只评审下方列出的语义/人工规则；精确数值规则由软件公式评审，不要重复判定。',
    `素材：${asset.name}；画板：${asset.width} × ${asset.height}。`,
    '评审对象是动画末帧（进度 100%）。先理解 SVG 的 viewBox、层级、文本和元素关系，再按每条问题逐项给结论。证据不足时必须标 unmeasured，不能猜测。',
    `结果绑定信息：assetId=${asset.id}；inputHash=${inputHash || '缺失'}；options=${JSON.stringify(options)}。返回时必须原样复制 assetId 和 inputHash。`,
    '',
    '规则：',
    ruleList || '（当前规则库没有需要 Agent 评审的规则）',
    '',
    '只返回 JSON，不要 Markdown。格式：',
    '{"assetId":"上方给出的 assetId","inputHash":"上方给出的 inputHash","options":上方给出的 options 对象,"reviews":[{"ruleId":"规则 ID","result":"positive|negative|unmeasured","reason":"可核验的简短证据与判断","elementId":"SVG 元素 id；没有则省略","bbox":[x,y,width,height]}]}',
    'positive 表示有证据符合规则，negative 表示有证据触发问题，unmeasured 表示素材或上下文不足。bbox 使用 SVG viewBox 用户坐标；如果能识别元素 id，优先返回 elementId。每条规则必须恰好返回一次。',
    '',
    '待评审 SVG（请按末帧理解）：',
    '```svg',
    frameSvg,
    '```',
  ].join('\n')
}

export function parseAgentReviewDocument(
  raw: string,
  validRuleIds: Set<string>,
  boxes: Record<string, [number, number, number, number]>,
): AgentReviewDocument {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const parsed = JSON.parse(cleaned)
  const source = Array.isArray(parsed) ? parsed : parsed?.reviews
  if (!Array.isArray(source)) throw new Error('JSON 顶层需要是数组，或包含 reviews 数组')
  const results = new Map<string, AgentReviewResult>()
  for (const row of source) {
    const ruleId = String(row?.ruleId || '')
    if (!validRuleIds.has(ruleId)) throw new Error(`结果包含未知规则：${ruleId || '缺少 ruleId'}`)
    if (results.has(ruleId)) throw new Error(`规则 ${ruleId} 重复返回`)
    const rawResult = String(row?.result || '').toLowerCase()
    const result: AgentResultKind | null =
      ['positive', 'pass', '正例', '通过'].includes(rawResult) ? 'positive' :
        ['negative', 'issue', 'fail', '反例', '问题'].includes(rawResult) ? 'negative' :
          ['unmeasured', 'unknown', '未测'].includes(rawResult) ? 'unmeasured' : null
    if (!result) throw new Error(`规则 ${ruleId} 的 result 无效`)
    const elementId = typeof row?.elementId === 'string' && row.elementId.trim() ? row.elementId.trim() : undefined
    const candidate = row?.bbox
    const bbox = Array.isArray(candidate) && candidate.length === 4 && candidate.every((n: unknown) => Number.isFinite(Number(n))) && Number(candidate[2]) > 0 && Number(candidate[3]) > 0
      ? candidate.map(Number) as [number, number, number, number]
      : elementId ? boxes[elementId] : undefined
    results.set(ruleId, {
      ruleId,
      result,
      reason: String(row?.reason || 'Agent 未提供判断依据。'),
      ...(elementId ? { elementId } : {}),
      ...(bbox ? { bbox } : {}),
    })
  }
  const missing = [...validRuleIds].filter((ruleId) => !results.has(ruleId))
  if (missing.length) throw new Error(`缺少 ${missing.length} 条规则结论：${missing.slice(0, 6).join('、')}${missing.length > 6 ? '…' : ''}`)
  return {
    ...(typeof parsed?.assetId === 'string' ? { assetId: parsed.assetId } : {}),
    ...(typeof parsed?.inputHash === 'string' ? { inputHash: parsed.inputHash } : {}),
    ...(parsed?.options && typeof parsed.options === 'object' ? { options: parsed.options as ReviewOptions } : {}),
    reviews: [...results.values()],
  }
}

