import type { Asset } from '../../types'
import { ACTIVE_IDS, IMPACT_LABELS, IMPACT_ORDER, LIBRARY_VERSION, RULES, buildCoverage, gateStatus, ruleset, type Stage } from './rules'
import type {
  Coverage,
  Finding,
  GridInfo,
  GateVerdict,
  Impact,
  Level,
  Medium,
  ReviewCard,
  ReviewOptions,
  ReviewReport,
  ReviewSection,
  ReviewView,
  QvElement,
} from './types'
import { assignIds, extractBoxes } from './boxes'
import { bakeStatic, mountSnapshot, rasterize, type Snapshot } from './snapshot'
import { applyOverrides } from './overrides'
import { measureLayout } from './layout'
import { measureContrast, measurePixels } from './pixels'
import { makeFinding, sortFindings, type RawFinding } from './findings'
import { reviewInputHash } from './hash'

export { reviewInputHash } from './hash'
export type { ReviewInput } from './hash'

/** Produce the exact static SVG frame used by the numeric review for Agent inspection. */
export async function buildReviewFrameSvg(asset: Asset, options: ReviewOptions = {}): Promise<string> {
  const frameRatio = clamp01(options.frame ?? 1)
  const snap = await mountSnapshot(asset)
  try {
    const idMap = assignIds(snap)
    applyOverrides(snap, asset.overrides, idMap)
    if (asset.groups.length || Object.keys(asset.layouts || {}).length || Object.keys(asset.overrides || {}).length || snap.animationCount || snap.hasSmil) {
      const { applyStudioFrame } = await import('./studioFrame')
      applyStudioFrame(snap, asset, idMap, frameRatio)
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    return bakeStatic(snap)
  } finally {
    snap.dispose()
  }
}

/**
 * 评审入口：定格一帧 → 取坐标 → 量像素 → 套阈值 → 出覆盖率与闸门。
 * 只测量、只判「违反了哪条原则」，不签发通过：DELIVERABLE 由人签发。
 */
export async function runReview(asset: Asset, options: ReviewOptions = {}): Promise<ReviewReport> {
  const started = performance.now()
  const medium: Medium = options.medium || 'ui'
  const frameRatio = clamp01(options.frame ?? 1)
  const notes: string[] = []
  const ran = new Set<Stage>()

  let snap: Snapshot | null = null
  try {
    snap = await mountSnapshot(asset)
    const idMap = assignIds(snap)
    const overrideInfo = applyOverrides(snap, asset.overrides, idMap)
    notes.push(...overrideInfo.notes)

    if (asset.groups.length || Object.keys(asset.layouts || {}).length ||
      Object.keys(asset.overrides || {}).length || snap.animationCount || snap.hasSmil) {
      const { applyStudioFrame } = await import('./studioFrame')
      applyStudioFrame(snap, asset, idMap, frameRatio)
      notes.push('动画与布局按 Studio 参数定格，再以 SVG 复现取样')
    }
    // 等一帧让暂停后的样式落定，否则量到的是暂停前的值
    await new Promise<void>((r) => requestAnimationFrame(() => r()))

    const boxes = extractBoxes(snap)
    if (snap.animationCount === 0 && !snap.hasSmil) notes.push('这条素材没有可抽取的动画，评审的是静态画面')

    const staticSvg = bakeStatic(snap)
    const raster = await rasterize(snap, staticSvg)
    if (!raster?.image) notes.push('光栅化失败：对比度与调色板按未测处理')
    notes.push('透明区域按白底合成后取样')

    const texts = boxes.elements.filter((e) => e.kind === 'text' || (e.text && e.fontSize))

    /* ---- layout 阶段 ---- */
    ran.add('layout')
    const layout = measureLayout({
      elements: boxes.elements,
      groupBoxes: boxes.groupBoxes,
      W: snap.width,
      H: snap.height,
      medium,
      displayWidth: options.displayWidth,
      scaleLadder: options.scaleLadder,
    })

    /* ---- contrast 阶段 ---- */
    ran.add('contrast')
    const contrast = measureContrast({
      texts,
      raster: raster && raster.image ? raster : null,
      W: snap.width,
      medium,
      displayWidth: options.displayWidth,
    })

    /* ---- pixels 阶段 ---- */
    ran.add('pixels')
    const pixelFindings: RawFinding[] = []
    let palette: string[] = []
    if (raster?.image) {
      const px = measurePixels(raster)
      pixelFindings.push(...px.findings)
      palette = px.palette
    }

    /* ---- media 阶段：资源失效 ---- */
    ran.add('media')
    const mediaFindings: RawFinding[] = []
    if (boxes.brokenImages.length) {
      for (const id of boxes.brokenImages) {
        mediaFindings.push({
          ruleId: 'QL-07',
          element: id,
          measured: 'empty',
          unit: 'status',
          status: gateStatus(RULES['QL-07'].gate, 'empty'),
          method: 'image_href',
          evidence: { reason: '<image> 没有 href，或指向空串' },
        })
      }
    } else if (boxes.unresolvedImages.length) {
      mediaFindings.push({
        ruleId: 'QL-07',
        element: boxes.unresolvedImages[0],
        measured: 'unresolved',
        unit: 'status',
        status: 'UNMEASURED',
        method: 'image_href',
        evidence: {
          refs: boxes.unresolvedImages.slice(0, 4),
          note: '位图是外链，离线无法校验可达性；只有空引用能确定是坏的',
        },
      })
    } else {
      mediaFindings.push({
        ruleId: 'QL-07',
        element: 'canvas',
        measured: 'ok',
        unit: 'status',
        status: gateStatus(RULES['QL-07'].gate, 'ok'),
        method: 'image_href',
        evidence: { note: '这张素材没有位图引用，不存在外链失效' },
      })
    }

    const bleed = layout.findings.filter((f) => f.ruleId === 'VS-01' && f.status === 'WARN' && f.evidence?.kind !== 'text').length
    if (bleed) notes.push(`${bleed} 个装饰图形整块在画布外：不影响画面，但等于没画`)
    const partialBleed = layout.findings.filter((f) => f.ruleId === 'VS-01' && f.status === 'PASS' && f.evidence?.kind === 'shape' && Number(f.measured) > 0).length
    if (partialBleed) notes.push(`${partialBleed} 个装饰图形出血到画外：按有意出血处理，不计裁切`)

    // 只保留当前规则库里的规则；语义规则交给 Agent，不参与自动测量
    const raws: RawFinding[] = [...layout.findings, ...contrast.findings, ...pixelFindings, ...mediaFindings]
      .filter((r) => ACTIVE_IDS.has(r.ruleId) && RULES[r.ruleId]?.measure !== 'semantic')
    const unmeasured = [...layout.unmeasured, ...contrast.unmeasured]
    if (!raster?.image) unmeasured.push({ ruleId: 'CL-01', reason: '光栅化失败，调色板无法统计' })
    if (!raster?.image) unmeasured.push({ ruleId: 'NS-01', reason: '光栅化失败，负空间无法统计' })

    // 有 UNMEASURED 记录的规则，即便带了 PASS 记录也不算测过
    const unmeasuredIds = new Set(unmeasured.map((u) => u.ruleId))
    const measuredRaws = raws.filter((r) => !(unmeasuredIds.has(r.ruleId) && r.status === 'PASS'))

    const sorted = sortFindings(measuredRaws.map((raw, i) => makeFinding(raw, i + 1)))
    const findings = sorted.map((f, i) => ({ ...f, id: `F-${String(i + 1).padStart(3, '0')}` }))

    const gr01 = layout.findings.find((f) => f.ruleId === 'GR-01' && f.metric === 'grid_align_share')
    const grid: GridInfo = gr01
      ? {
          unit: Number(gr01.evidence.unit) || null,
          tolerance: Number(gr01.evidence.tolerance) || 1,
          share: Number(gr01.measured),
          aligned: Number(gr01.evidence.aligned) || 0,
          samples: Number(gr01.evidence.samples) || 0,
          offGrid: (gr01.evidence.offGrid as string[]) || [],
          source: 'inferred',
        }
      : {
          unit: null,
          tolerance: 1,
          share: null,
          aligned: 0,
          samples: boxes.elements.length,
          offGrid: [],
          source: 'none',
        }
    const boxMap: Record<string, [number, number, number, number]> = {}
    for (const el of boxes.elements) boxMap[el.id] = el.bbox
    const counts = countLevels(findings)
    const coverage = buildCoverage({ medium, findings, unmeasured, ran })
    const gate = gateOf(counts, coverage)
    const view = buildView(findings)

    return {
      assetId: asset.id,
      assetName: asset.name,
      inputHash: reviewInputHash(asset, options),
      libraryVersion: LIBRARY_VERSION,
      generatedAt: new Date().toISOString(),
      canvas: { width: snap.width, height: snap.height },
      medium,
      displayWidth: options.displayWidth,
      frame: frameRatio,
      duration: Math.round(snap.duration * 100) / 100,
      grid,
      boxes: boxMap,
      counts,
      gate,
      findings,
      unmeasured,
      coverage,
      view,
      details: {
        elapsedMs: Math.round(performance.now() - started),
        raster: raster?.image ? { width: raster.width, height: raster.height } : null,
        notes: [...notes, ...(palette.length ? [`主色 ${palette.slice(0, 5).join(' ')}`] : [])],
        animations: snap.animationCount,
        elements: boxes.elements.length,
        texts: texts.length,
      },
    }
  } finally {
    snap?.dispose()
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 1))

function countLevels(findings: Finding[]): ReviewReport['counts'] {
  const counts: ReviewReport['counts'] = { FAIL: 0, WARN: 0, PASS: 0, UNMEASURED: 0 }
  for (const f of findings) counts[f.level] = (counts[f.level] || 0) + 1
  return counts
}

/** 闸门：有 FAIL 就 BLOCKED；未测与未实现的规则都算「没查过」，不能因为没报错就当可交付。 */
export function gateOf(counts: ReviewReport['counts'], coverage: Coverage): GateVerdict {
  if (counts.FAIL) return 'BLOCKED'
  const pending = (coverage.counts.unmeasured || 0) + (coverage.counts.not_run || 0) + (coverage.counts.not_implemented || 0)
  if (counts.WARN || pending) return 'REVIEW_NEEDED'
  return 'DELIVERABLE'
}

/** 一条规则一张卡：同一根因不按元素摊成几十张。折叠只发生在展示层，findings 不删。 */
export function buildView(findings: Finding[]): ReviewView {
  const policy = ruleset.impactPolicy
  const budget: Record<string, number | null> = {
    high: policy.budget.high ?? null,
    medium: policy.budget.medium ?? 5,
    low: policy.budget.low ?? 0,
  }
  const perCard = policy.budget.elementsPerCard || 5
  const cards = new Map<string, ReviewCard>()
  const values = new Map<string, number[]>()

  for (const f of findings) {
    if (f.level === 'PASS') continue
    // 同一条规则的不同指标单位不同（出画是比例、安全区是 px），不能混进一张卡
    const key = `${f.ruleId}|${f.metric}`
    let card = cards.get(key)
    if (!card) {
      card = {
        ruleId: f.ruleId,
        title: CARD_TITLES[f.metric] || f.title,
        principle: f.principle,
        violation: f.violation,
        impact: f.impact,
        level: f.level,
        count: 0,
        elementCount: 0,
        elementsSample: [],
        measuredRange: [],
        unit: f.unit,
        threshold: f.provenance.threshold,
        measure: f.provenance.measure,
        gatePower: f.gatePower,
        fix: f.fix,
        note: typeof f.evidence?.note === 'string' ? (f.evidence.note as string) : undefined,
      }
      cards.set(key, card)
      values.set(key, [])
    }
    card.count++
    if (!card.elementsSample.includes(f.element)) card.elementsSample.push(f.element)
    if (!card.fix && f.fix) card.fix = f.fix
    if (IMPACT_ORDER[f.impact] < IMPACT_ORDER[card.impact]) card.impact = f.impact
    if (levelRank(f.level) < levelRank(card.level)) card.level = f.level
    if (typeof f.measured === 'number') values.get(key)!.push(f.measured)
  }

  for (const [key, card] of cards) {
    const list = values.get(key) || []
    card.measuredRange = list.length ? [round4(Math.min(...list)), round4(Math.max(...list))] : []
    card.elementCount = card.elementsSample.length
    card.elementsSample = card.elementsSample.slice(0, perCard)
  }

  const ranked = [...cards.values()].sort(
    (a, b) =>
      IMPACT_ORDER[a.impact] - IMPACT_ORDER[b.impact] ||
      levelRank(a.level) - levelRank(b.level) ||
      b.count - a.count ||
      a.ruleId.localeCompare(b.ruleId)
  )

  const order: Impact[] = policy.order?.length ? policy.order : ['high', 'medium', 'low']
  const sections: ReviewSection[] = []
  let collapsed = 0
  for (const key of order) {
    const items = ranked.filter((c) => c.impact === key)
    const cap = budget[key]
    const shown = cap === null || cap === undefined ? items : items.slice(0, cap)
    const hidden = items.slice(shown.length)
    collapsed += hidden.reduce((sum, c) => sum + c.count, 0)
    sections.push({
      impact: key,
      label: IMPACT_LABELS[key],
      findings: items.reduce((sum, c) => sum + c.count, 0),
      cards: items.length,
      shown,
      hidden: {
        cards: hidden.length,
        findings: hidden.reduce((sum, c) => sum + c.count, 0),
        ruleIds: hidden.map((c) => c.ruleId),
        items: hidden,
      },
    })
  }

  return {
    mode: 'ui',
    budget,
    byImpact: {
      high: byImpact(ranked, 'high'),
      medium: byImpact(ranked, 'medium'),
      low: byImpact(ranked, 'low'),
    },
    sections,
    collapsed: { findings: collapsed, detail: '折叠项仍完整保留在 findings[]，可按 id 回查，不删除' },
  }
}

/** 二级指标单独成卡时，标题得说清是哪一半 */
const CARD_TITLES: Record<string, string> = {
  out_of_canvas: '出画（被画布裁掉）',
  out_of_safe: '安全区（四边 5%）',
  size_ratio_rank1_body: '层级落差（标题 vs 正文）',
  text_accent_colors: '文字配色预算（强调色）',
  dominant_share: '调色板（主色占比）',
  rule_line_offset_spread: '分隔线定位（同类偏差）',
}

const byImpact = (cards: ReviewCard[], impact: Impact) => ({
  findings: cards.filter((c) => c.impact === impact).reduce((s, c) => s + c.count, 0),
  rules: cards.filter((c) => c.impact === impact).length,
})

const levelRank = (l: Level) => ({ FAIL: 0, WARN: 1, UNMEASURED: 2, PASS: 3 })[l] ?? 9
const round4 = (v: number) => Math.round(v * 10000) / 10000

export type { Finding, ReviewReport, ReviewOptions, QvElement }
