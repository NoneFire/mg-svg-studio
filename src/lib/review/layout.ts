import { RULES, gateStatus } from './rules'
import type { Medium, QvElement } from './types'
import type { RawFinding } from './findings'

/**
 * 元素级测量。全部按 quant-visual-review/scripts/measure.py 的 cmd_layout 口径移植：
 * 阈值从 rules.json 取，几何量统一换算成 px@1080p（scale = 短边/1080）。
 * 这里只产出「值 + 状态」，不做展示判断。
 */

export interface LayoutInput {
  elements: QvElement[]
  groupBoxes: Record<string, [number, number, number, number]>
  W: number
  H: number
  medium: Medium
  displayWidth?: number
  scaleLadder?: number[]
}

export interface LayoutOutput {
  findings: RawFinding[]
  unmeasured: { ruleId: string; reason: string }[]
}

type Box = [number, number, number, number]

const bboxOf = (el: QvElement): Box => el.bbox
const area = (b: Box) => b[2] * b[3]

function overlapArea(a: Box, b: Box): number {
  const dx = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])
  const dy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1])
  return Math.max(0, dx) * Math.max(0, dy)
}

function unionBBox(boxes: Box[]): Box {
  const x0 = Math.min(...boxes.map((b) => b[0]))
  const y0 = Math.min(...boxes.map((b) => b[1]))
  const x1 = Math.max(...boxes.map((b) => b[0] + b[2]))
  const y1 = Math.max(...boxes.map((b) => b[1] + b[3]))
  return [x0, y0, x1 - x0, y1 - y0]
}

const isText = (el: QvElement) => el.kind === 'text' || !!(el.text && el.fontSize)

function isRuleLine(el: QvElement, W: number, H: number): boolean {
  const b = bboxOf(el)
  if (b[2] <= 0 || b[3] <= 0) return false
  const role = String(el.role || '').toLowerCase()
  if (/rule|divider|separator/.test(role)) return true
  const thin = Math.min(b[2], b[3]) <= Math.max(2, 0.003 * Math.min(W, H))
  const long = Math.max(b[2], b[3]) >= 0.25 * Math.max(W, H)
  return thin && long
}

const isCanvasBg = (el: QvElement, W: number, H: number) => area(bboxOf(el)) >= 0.9 * W * H

function horizontalOverlapShare(line: Box, content: Box): number {
  const inter = Math.max(0, Math.min(line[0] + line[2], content[0] + content[2]) - Math.max(line[0], content[0]))
  return inter / Math.max(1e-6, content[2])
}

function median(values: number[]): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function pct(values: number[], q: number): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  if (s.length === 1) return s[0]
  const pos = ((s.length - 1) * q) / 100
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return s[lo]
  return s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

const r2 = (v: number) => Math.round(v * 100) / 100

/**
 * 正文字号口径。按字数加权：MG 素材常把标题拆成每字一个 <text>，
 * 用元素个数的中位数会把正文口径判成标题那么大，层级整组失真。
 */
function weightedMedianSize(texts: QvElement[]): number | null {
  const items = texts.filter((t) => t.fontSize).map((t) => ({ size: t.fontSize!, weight: Math.max(1, t.charCount || 1) }))
  if (!items.length) return null
  items.sort((a, b) => a.size - b.size)
  const total = items.reduce((s, it) => s + it.weight, 0)
  let acc = 0
  for (const it of items) {
    acc += it.weight
    if (acc >= total / 2) return it.size
  }
  return items[items.length - 1].size
}

/** 分组：优先 <g> 声明的 group，其次容器。分隔线与整画布背景不算内容。 */
function groupMembers(els: QvElement[], W: number, H: number, fallback = true): Map<string, QvElement[]> {
  const groups = new Map<string, QvElement[]>()
  for (const e of els) {
    if (isRuleLine(e, W, H) || isCanvasBg(e, W, H)) continue
    const gid = e.group || e.container || (fallback ? 'canvas' : undefined)
    if (!gid) continue
    const list = groups.get(gid) || []
    list.push(e)
    groups.set(gid, list)
  }
  return groups
}

export function measureLayout(input: LayoutInput): LayoutOutput {
  const { elements: els, groupBoxes, W, H, medium, displayWidth, scaleLadder } = input
  const short = Math.min(W, H)
  const scale = short / 1080
  const to1080 = (v: number) => (scale ? v / scale : v)
  const out: RawFinding[] = []
  const unmeasured: { ruleId: string; reason: string }[] = []
  const texts = els.filter(isText)
  const textIds = new Set(texts.map((t) => t.id))

  /* -------------------------------- QL-01 文本溢出 -------------------------------- */
  const containers = new Set<string>()
  for (const el of texts) {
    const cid = el.container
    const cb = el.containerFrame || (cid ? groupBoxes[cid] : undefined)
    if (!cid || !cb) continue
    containers.add(cid)
    const b = bboxOf(el)
    const over = Math.max(0, cb[0] - b[0], cb[1] - b[1], b[0] + b[2] - (cb[0] + cb[2]), b[1] + b[3] - (cb[1] + cb[3]))
    const value = r2(to1080(over))
    out.push({
      ruleId: 'QL-01',
      element: el.id,
      measured: value,
      unit: 'px@1080p',
      status: gateStatus(RULES['QL-01'].gate, value),
      method: 'over_vs_container',
      metric: 'overflow_px',
      evidence: {
        overflowPx: r2(over),
        container: cid,
        containerBox: cb.map(r2),
        containerSource: el.containerFrame ? 'sibling_shapes' : 'group_box',
        bbox: b.map(r2),
        text: (el.text || '').slice(0, 40),
      },
    })
  }
  if (!containers.size) {
    unmeasured.push({
      ruleId: 'QL-01',
      reason: '文字没有能装下它的容器（SVG 不会自动裁剪），溢出只会发生在画布外，已由 VS-01 判',
    })
  }

  /* -------------------------------- QL-02 文本遮挡 -------------------------------- */
  let occlusionSamples = 0
  for (const el of texts) {
    if (!el.visible) continue
    const b = bboxOf(el)
    if (area(b) <= 0) continue
    let worst = 0
    let culprit: string | undefined
    for (const other of els) {
      if (other.id === el.id) continue
      if (textIds.has(other.id)) continue
      if ((other.opacity ?? 1) < 0.5) continue
      if ((other.z ?? 0) <= (el.z ?? 0)) continue
      const ratio = overlapArea(b, bboxOf(other)) / Math.max(1e-6, area(b))
      if (ratio > worst) {
        worst = ratio
        culprit = other.id
      }
    }
    occlusionSamples++
    const cappedWarn = gateStatus(RULES['QL-02'].gate, worst) === 'FAIL'
    out.push({
      ruleId: 'QL-02',
      element: el.id,
      measured: Math.round(worst * 10000) / 10000,
      unit: 'ratio',
      // bbox 相交只是嫌疑：要像素确认才算 FAIL
      status: cappedWarn ? 'WARN' : gateStatus(RULES['QL-02'].gate, worst),
      method: 'bbox_geometry',
      metric: 'occlusion_ratio',
      evidence: { coveredBy: culprit, method: 'bbox', note: 'bbox 相交只算 WARN，像素确认后才升 FAIL' },
    })
  }
  if (!occlusionSamples) {
    unmeasured.push({ ruleId: 'QL-02', reason: '没有可见文字，无遮挡可判' })
  }

  /* -------------------------------- QL-03 字号下限 -------------------------------- */
  let ql03NeedsWidth = false
  let ql03Count = 0
  for (const el of texts) {
    const fs = el.fontSize
    if (!fs) continue
    if (medium === 'ui' && displayWidth) {
      const eff = (fs * displayWidth) / W
      ql03Count++
      out.push({
        ruleId: 'QL-03',
        element: el.id,
        measured: r2(eff),
        unit: 'px',
        status: gateStatus(RULES['QL-03'].gateUI?.gate, eff),
        method: 'effective_font_size',
        metric: 'font_size_px',
        evidence: {
          declaredFontSize: r2(fs),
          effectiveFontSize: r2(eff),
          displayWidth,
          basis: 'display_width',
          text: (el.text || '').slice(0, 30),
        },
      })
    } else if (medium === 'ui') {
      // SVG 的作者单位不是投放像素：不给投放宽度就不能判
      ql03NeedsWidth = true
    } else {
      const ratio = fs / short
      ql03Count++
      out.push({
        ruleId: 'QL-03',
        element: el.id,
        measured: Math.round(ratio * 10000) / 10000,
        unit: 'ratio',
        status: gateStatus(RULES['QL-03'].gate, ratio),
        method: 'font_size_ratio',
        metric: 'font_size_ratio',
        evidence: { declaredFontSize: r2(fs), basis: 'short_side_ratio', shortSide: short },
      })
    }
  }
  if (!ql03Count) {
    unmeasured.push({
      ruleId: 'QL-03',
      reason: ql03NeedsWidth
        ? 'SVG 的画布单位不是投放像素：没有填投放宽度，按 375 还是 800 看会得出相反结论，不能判'
        : '没有字号信息',
    })
  }

  /* -------------------------------- QL-04 行高 -------------------------------- */
  const bodyRef = weightedMedianSize(texts)
  const lhSamples = texts.filter((t) => t.fontSize && t.lineHeight)
  if (!lhSamples.length) {
    unmeasured.push({ ruleId: 'QL-04', reason: '既没有 CSS line-height，也没有可推基线间距的相邻行' })
  } else {
    const sizes = new Set(lhSamples.map((t) => r2(t.fontSize!)))
    if (sizes.size < 2) {
      unmeasured.push({ ruleId: 'QL-04', reason: '全图只有一档字号，分不出正文与展示级，行高阈值不适用' })
    } else {
      const displayGate = RULES['QL-04'].gateDisplay?.gate
      for (const el of lhSamples) {
        const ratio = el.lineHeight! / el.fontSize!
        const display = !!bodyRef && el.fontSize! >= 1.8 * bodyRef
        const gate = display && displayGate ? displayGate : RULES['QL-04'].gate
        out.push({
          ruleId: 'QL-04',
          element: el.id,
          measured: Math.round(ratio * 10000) / 10000,
          unit: 'ratio',
          status: gateStatus(gate, ratio),
          method: display ? 'line_height_ratio_display' : 'line_height_ratio',
          metric: display ? 'line_height_ratio_display' : 'line_height_ratio',
          evidence: {
            lineHeight: r2(el.lineHeight!),
            fontSize: r2(el.fontSize!),
            display,
            bodyRef: bodyRef ? r2(bodyRef) : null,
            source: el.lineHeightSource || 'css',
          },
        })
      }
    }
  }

  /* -------------------------------- VS-01 出画 / 安全区 -------------------------------- */
  let vsCount = 0
  let bleedCount = 0
  for (const el of els) {
    const b = bboxOf(el)
    if (area(b) <= 0) continue
    if (isCanvasBg(el, W, H)) continue // 满画布背景本来就该贴边铺满
    vsCount++
    const outPx = Math.max(0, -b[0], -b[1], b[0] + b[2] - W, b[1] + b[3] - H)
    const tol = 0.5 * scale
    const covered = overlapArea(b, [0, 0, W, H])
    const ratio = outPx <= tol ? 0 : 1 - covered / Math.max(1e-6, area(b))
    const value = Math.round(ratio * 10000) / 10000
    // 只有文字和位图被裁才丢内容。装饰图形出血是 MG 的常规做法：
    // 部分出画算有意出血，整块在画外才是「画了但看不见」。
    const isContent = el.kind === 'text' || el.kind === 'image'
    let status = gateStatus(RULES['VS-01'].gate, value)
    if (!isContent) {
      status = value >= 0.98 ? 'WARN' : 'PASS'
      if (status === 'WARN') bleedCount++
    }
    // 每个元素都留一条记录：PASS 也要落库，否则「没记录」会被当成通过
    out.push({
      ruleId: 'VS-01',
      element: el.id,
      measured: value,
      unit: 'ratio',
      status,
      method: 'out_of_canvas',
      metric: 'out_of_canvas',
      evidence: {
        outPx: r2(outPx),
        tolerancePx: r2(tol),
        bbox: b.map(r2),
        canvas: [W, H],
        kind: el.kind,
        note: isContent
          ? '内容被画布裁掉'
          : status === 'WARN'
            ? '整个元素都在画布外：等于没画'
            : '装饰图形出血：刻意做出画可忽略',
      },
    })

    // 已经判出画的元素不再重复报安全区：同一件事说两遍只会稀释信号
    if (value > 0) continue
    const mx = 0.05 * W
    const my = 0.05 * H
    let outsideSafe = Math.min(b[0] - mx, b[1] - my, W - mx - (b[0] + b[2]), H - my - (b[1] + b[3]))
    // 安全区是给「会被平台二次裁切的内容」定的；装饰图形出血不需要留边
    if (isCanvasBg(el, W, H) || el.kind !== 'text') outsideSafe = 0
    const safeValue = r2(to1080(Math.max(0, -outsideSafe)))
    if (safeValue > Math.max(2, 0.01 * short)) {
      out.push({
        ruleId: 'VS-01',
        element: el.id,
        measured: safeValue,
        unit: 'px@1080p',
        status: 'WARN',
        method: 'safe_area_5pct',
        metric: 'out_of_safe',
        evidence: { outsidePx: r2(Math.max(0, -outsideSafe)), bbox: b.map(r2) },
      })
    }
  }
  if (!vsCount) unmeasured.push({ ruleId: 'VS-01', reason: '没有元素，无出画可判' })

  /* -------------------------------- GR-02 分组间距比 -------------------------------- */
  // 组间缝只按作者显式声明的 <g> 算；把「整张画布」当成一组会让包围盒互相重叠，比值没有意义
  const declaredGroups = groupMembers(els, W, H, false)
  const groups = groupMembers(els, W, H)
  if (declaredGroups.size < 2) {
    unmeasured.push({
      ruleId: 'GR-02',
      reason: `分组只有 ${declaredGroups.size} 个：素材里没有可识别的 <g> 分组，组间缝无从比较`,
    })
  } else {
    const gb = new Map<string, Box>()
    for (const [gid, members] of declaredGroups) gb.set(gid, unionBBox(members.map(bboxOf)))
    const seamsOn = (axis: 0 | 1) => {
      const ordered = [...gb.entries()].sort((a, b) => a[1][axis] - b[1][axis])
      const res: { from: string; to: string; gap: number }[] = []
      for (let i = 1; i < ordered.length; i++) {
        const [g1, b1] = ordered[i - 1]
        const [g2, b2] = ordered[i]
        const gap = b2[axis] - (b1[axis] + b1[axis + 2])
        if (gap > 0.5) res.push({ from: g1, to: g2, gap })
      }
      return res
    }
    const sy = seamsOn(1)
    const sx = seamsOn(0)
    const useY = sy.length >= sx.length && sy.length > 0
    const seams = useY ? sy : sx
    const axis = useY ? 1 : 0
    const within: number[] = []
    for (const members of declaredGroups.values()) {
      const ms = [...members].sort((a, b) => bboxOf(a)[axis] - bboxOf(b)[axis])
      for (let i = 1; i < ms.length; i++) {
        const ba = bboxOf(ms[i - 1])
        const bb = bboxOf(ms[i])
        const gap = bb[axis] - (ba[axis] + ba[axis + 2])
        if (gap >= 0.5 && gap <= 400 * scale) within.push(gap)
      }
    }
    if (!seams.length) {
      unmeasured.push({ ruleId: 'GR-02', reason: '组间没有正间距：各组在 x/y 上都重叠，无法判分组' })
    } else if (within.length < 2) {
      unmeasured.push({ ruleId: 'GR-02', reason: `组内相邻间距样本 ${within.length} < 2，无法算组内基准` })
    } else {
      const wmed = median(within)
      const value = r2(Math.min(...seams.map((s) => s.gap)) / wmed)
      out.push({
        ruleId: 'GR-02',
        element: 'canvas',
        measured: value,
        unit: 'ratio',
        status: gateStatus(RULES['GR-02'].gate, value),
        method: 'between_over_within',
        metric: 'group_gap_ratio',
        evidence: {
          axis: axis === 1 ? 'y' : 'x',
          groups: declaredGroups.size,
          withinMedian: r2(wmed),
          withinSamples: within.length,
          betweenMin: r2(Math.min(...seams.map((s) => s.gap))),
          seams: seams.slice(0, 6).map((s) => ({ ...s, gap: r2(s.gap) })),
        },
      })
    }
  }

  /* -------------------------------- AL-02 分隔线定位 -------------------------------- */
  const ruleLines = els.filter((e) => isRuleLine(e, W, H))
  const hLines = ruleLines.filter((e) => bboxOf(e)[2] >= bboxOf(e)[3] * 3)
  if (!hLines.length) {
    unmeasured.push({ ruleId: 'AL-02', reason: '没有检测到横向分隔线（细长 rect/line，或 role 含 rule/divider）' })
  } else {
    const content = els.filter((e) => !ruleLines.includes(e) && !isCanvasBg(e, W, H))
    const rows: { id: string; gapAbove: number; gapBelow: number; delta: number; bbox: Box }[] = []
    for (const line of hLines) {
      const lb = bboxOf(line)
      const above = content
        .map(bboxOf)
        .filter((b) => horizontalOverlapShare(lb, b) >= 0.5 && b[1] + b[3] <= lb[1] + 1)
      const below = content
        .map(bboxOf)
        .filter((b) => horizontalOverlapShare(lb, b) >= 0.5 && b[1] >= lb[1] + lb[3] - 1)
      if (!above.length || !below.length) continue
      const gapAbove = lb[1] - Math.max(...above.map((b) => b[1] + b[3]))
      const gapBelow = Math.min(...below.map((b) => b[1])) - (lb[1] + lb[3])
      if (gapAbove < -1 || gapBelow < -1) continue
      rows.push({ id: line.id, gapAbove, gapBelow, delta: Math.abs(gapAbove - gapBelow), bbox: lb })
    }
    if (!rows.length) {
      unmeasured.push({ ruleId: 'AL-02', reason: `检测到 ${hLines.length} 条分隔线，但没有一条两侧都有内容` })
    } else {
      const worst = rows.reduce((a, b) => (b.delta > a.delta ? b : a), rows[0])
      const value = r2(to1080(worst.delta))
      out.push({
        ruleId: 'AL-02',
        element: worst.id,
        measured: value,
        unit: 'px@1080p',
        status: gateStatus(RULES['AL-02'].gate, value),
        method: 'rule_line_padding_delta',
        metric: 'rule_line_gap_delta_px',
        evidence: {
          gapAbove: r2(worst.gapAbove),
          gapBelow: r2(worst.gapBelow),
          bbox: worst.bbox.map(r2),
          rows: rows.slice(0, 6).map((r) => ({ id: r.id, gapAbove: r2(r.gapAbove), gapBelow: r2(r.gapBelow) })),
        },
      })
    }
  }

  /* -------------------------------- AL-01 对齐 -------------------------------- */
  let alignSamples = 0
  const alignRows: { group: string; anchor: number; p90: number; samples: number }[] = []
  for (const [gid, members] of groups) {
    // 逐字动画的单字、居中/右对齐的文字，左边缘本来就不该在一条线上
    const groupTexts = members.filter((t) => isText(t) && (t.charCount || 0) >= 3 && (t.align === 'start' || !t.align))
    if (groupTexts.length < 4) continue
    const lefts = groupTexts.map((t) => bboxOf(t)[0])
    // 先聚成列：多栏版面里 80 / 140 / 232 是三个不同的设计起点，不能互相判错
    const columns: number[][] = []
    for (const v of [...lefts].sort((a, b) => a - b)) {
      const last = columns[columns.length - 1]
      if (!last || v - last[last.length - 1] > 2) columns.push([v])
      else last.push(v)
    }
    let worst: { anchor: number; p90: number; samples: number } | null = null
    for (const col of columns) {
      if (col.length < 3) continue
      const anchor = median(col)
      const devs = col.map((v) => Math.abs(v - anchor))
      const p90 = to1080(pct(devs, 90))
      if (!worst || p90 > worst.p90) worst = { anchor: r2(anchor), p90: r2(p90), samples: col.length }
    }
    if (!worst) continue
    alignSamples += worst.samples
    alignRows.push({ group: gid, ...worst })
  }
  if (alignSamples < 4) {
    unmeasured.push({
      ruleId: 'AL-01',
      reason: texts.length
        ? `可用于对齐的文字只有 ${alignSamples} 个：逐字拆的单字与居中/右对齐的文字不参与左边缘判定`
        : '没有文字元素，对齐不可判',
    })
  } else {
    for (const row of alignRows) {
      out.push({
        ruleId: 'AL-01',
        element: row.group,
        measured: row.p90,
        unit: 'px@1080p',
        status: gateStatus(RULES['AL-01'].gate, row.p90),
        method: 'left_edge_p90',
        metric: 'align_dev_p90',
        evidence: { anchor: row.anchor, samples: row.samples },
      })
    }
  }

  /* -------------------------------- GR-01 网格 -------------------------------- */
  const gridItems = els.filter((e) => !isCanvasBg(e, W, H))
  if (gridItems.length < 5) {
    unmeasured.push({ ruleId: 'GR-01', reason: `元素 ${gridItems.length} < 5，网格不可推断` })
  } else {
    const cluster = (vals: number[]) => {
      const outv: number[] = []
      for (const v of [...vals].sort((a, b) => a - b)) {
        if (!outv.length || v - outv[outv.length - 1] > 1) outv.push(v)
      }
      return outv
    }
    const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
    const unitOf = (vals: number[]): number | null => {
      const centers = cluster(vals)
      const deltas = centers.slice(1).map((v, i) => v - centers[i]).filter((d) => d > 1)
      const ints = deltas.map((d) => Math.round(d))
      if (deltas.length && deltas.every((d, i) => Math.abs(d - ints[i]) <= 0.75)) {
        let g = 0
        for (const i of ints) g = gcd(g, i)
        if (g >= 4 && g <= 160) return g
      }
      const candidates = [...new Set(deltas.filter((d) => d >= 4 && d <= 160).map((d) => Math.round(d * 100) / 100))].sort(
        (a, b) => a - b
      )
      for (const cand of candidates) {
        const tol = Math.max(0.5, Math.min(2, 0.05 * cand))
        const share = vals.filter((v) => Math.abs(v - Math.round(v / cand) * cand) <= tol).length / vals.length
        if (share >= 0.8) return cand
      }
      return null
    }
    const units = [unitOf(gridItems.map((e) => bboxOf(e)[0])), unitOf(gridItems.map((e) => bboxOf(e)[1]))].filter(
      (u): u is number => typeof u === 'number'
    )
    if (!units.length) {
      unmeasured.push({ ruleId: 'GR-01', reason: '坐标没有稳定的公约数或重复单元，网格不可推断（不退回 1px 容差）' })
    } else {
      const unit = Math.max(...units)
      const tol = Math.max(0.5, Math.min(2, 0.05 * unit))
      const on = gridItems.filter((e) => {
        const b = bboxOf(e)
        return Math.abs(b[0] - Math.round(b[0] / unit) * unit) <= tol || Math.abs(b[1] - Math.round(b[1] / unit) * unit) <= tol
      })
      const share = Math.round((on.length / gridItems.length) * 1000) / 1000
      out.push({
        ruleId: 'GR-01',
        element: 'canvas',
        measured: share,
        unit: 'ratio',
        status: gateStatus(RULES['GR-01'].gate, share),
        method: 'grid_unit_share',
        metric: 'grid_align_share',
        evidence: {
          unit: r2(unit),
          samples: gridItems.length,
          aligned: on.length,
          tolerance: r2(tol),
          offGrid: gridItems.filter((e) => !on.includes(e)).slice(0, 6).map((e) => e.id),
        },
      })
    }
  }

  /* -------------------------------- CT-01 层级落差 -------------------------------- */
  const sizeList = [...new Set(texts.filter((t) => t.fontSize).map((t) => r2(t.fontSize!)))].sort((a, b) => b - a)
  if (sizeList.length < 2) {
    unmeasured.push({ ruleId: 'CT-01', reason: '字号档位 < 2，层级不可判' })
  } else {
    const body = bodyRef || median(texts.filter((t) => t.fontSize).map((t) => t.fontSize!))
    const r12 = sizeList[1] ? r2(sizeList[0] / sizeList[1]) : 0
    const rmb = body ? r2(sizeList[0] / body) : 0
    out.push({
      ruleId: 'CT-01',
      element: 'canvas',
      measured: r12,
      unit: 'ratio',
      status: gateStatus(RULES['CT-01'].gate, r12),
      method: 'rank1_over_rank2',
      metric: 'size_ratio_rank1_rank2',
      evidence: { sizes: sizeList, body: r2(body) },
    })
    const sub = RULES['CT-01'].secondary
    if (sub?.gate) {
      out.push({
        ruleId: 'CT-01',
        element: 'canvas',
        measured: rmb,
        unit: 'ratio',
        status: gateStatus(sub.gate, rmb),
        method: 'rank1_over_body',
        metric: 'size_ratio_rank1_body',
        evidence: { sizes: sizeList, body: r2(body) },
      })
    }
  }

  /* -------------------------------- GE-02 格式塔·相似 -------------------------------- */
  const placeholders = new Set(['text', 'rect', 'line', 'circle', 'ellipse', 'polygon', 'polyline', 'shape', 'g', 'group', '', 'none', 'image'])
  const sigs = new Map<string, Map<string, string[]>>()
  for (const el of els) {
    if (!el.style || !el.id) continue
    const role = String(el.role || '').toLowerCase()
    if (placeholders.has(role)) continue
    const key = role
    const sig = JSON.stringify([el.style.fill, el.style.weight, el.kind])
    const buckets = sigs.get(key) || new Map<string, string[]>()
    const list = buckets.get(sig) || []
    list.push(el.id)
    buckets.set(sig, list)
    sigs.set(key, buckets)
  }
  if (!sigs.size) {
    unmeasured.push({ ruleId: 'GE-02', reason: '没有 class 标注：分不出「同类」，不能比较外观' })
  } else {
    let emitted = 0
    for (const [role, buckets] of sigs) {
      if (buckets.size < 2) continue
      const sizes = [...buckets.values()].map((ids) => ids.length)
      if (Math.max(...sizes) < 2) continue
      const biggest = [...buckets.values()].sort((a, b) => b.length - a.length)[0]
      const outliers = [...buckets.values()].filter((ids) => ids !== biggest).flat()
      out.push({
        ruleId: 'GE-02',
        element: outliers.slice(0, 4).join(', '),
        measured: buckets.size,
        unit: 'count',
        status: 'WARN',
        method: 'style_signature',
        evidence: { class: role, majority: biggest.slice(0, 4), variants: buckets.size, all: outliers.slice(0, 8) },
      })
      emitted++
    }
    if (!emitted) {
      out.push({
        ruleId: 'GE-02',
        element: 'canvas',
        measured: 1,
        unit: 'count',
        status: gateStatus(RULES['GE-02'].gate, 1),
        method: 'style_signature',
        evidence: { note: '同类元素外观一致' },
      })
    }
  }

  /* -------------------------------- SP-01 间距体系 -------------------------------- */
  const sortedX = [...els].filter((e) => area(bboxOf(e)) > 0).sort((a, b) => bboxOf(a)[0] - bboxOf(b)[0])
  const gaps: number[] = []
  for (let i = 1; i < sortedX.length; i++) {
    const ba = bboxOf(sortedX[i - 1])
    const bb = bboxOf(sortedX[i])
    const gap = Math.round(bb[0] - (ba[0] + ba[2]))
    if (gap >= 1 && gap <= 400) gaps.push(gap)
  }
  if (gaps.length < (RULES['SP-01'].minSamples || 5)) {
    unmeasured.push({ ruleId: 'SP-01', reason: `横向间距样本 ${gaps.length} < ${RULES['SP-01'].minSamples || 5}` })
  } else {
    const levels = [...new Set(gaps)].sort((a, b) => a - b)
    out.push({
      ruleId: 'SP-01',
      element: 'spacing',
      measured: levels.length,
      unit: 'count',
      status: gateStatus(RULES['SP-01'].gate, levels.length),
      method: 'distinct_gaps',
      metric: 'spacing_levels',
      evidence: { levels: levels.slice(0, 12), samples: gaps.length },
    })
  }

  /* -------------------------------- 字体系统 -------------------------------- */
  if (!texts.length) {
    for (const rid of ['TY-01', 'TY-04', 'TY-05', 'TY-06', 'TY-07', 'TY-08', 'RP-01', 'TX-01']) {
      unmeasured.push({ ruleId: rid, reason: '没有文字元素，字体系统规则不适用' })
    }
  } else {
    const fams = new Set(texts.map((t) => t.fontFamily).filter(Boolean) as string[])
    const sizes = [...new Set(texts.filter((t) => t.fontSize).map((t) => r2(t.fontSize!)))].sort((a, b) => a - b)
    const weights = new Set(texts.map((t) => Math.round(t.fontWeight || 400)))
    const colors = new Set(texts.map((t) => String(t.fill || '').toUpperCase()).filter((c) => c && c !== 'NONE'))

    const pushCanvas = (ruleId: string, value: number, unit: string, method: string, evidence: Record<string, unknown>, gate = RULES[ruleId].gate) => {
      out.push({ ruleId, element: 'canvas', measured: value, unit, status: gateStatus(gate, value), method, evidence })
    }

    if (!fams.size) unmeasured.push({ ruleId: 'TY-01', reason: '文字元素没有 font-family' })
    else pushCanvas('TY-01', fams.size, 'count', 'font_families', { families: [...fams].sort() })

    if (sizes.length > 1) pushCanvas('RP-01', sizes.length, 'count', 'type_scale_levels', { sizes })
    else unmeasured.push({ ruleId: 'RP-01', reason: '字号档位 < 2' })

    const ratios = sizes.slice(1).map((v, i) => Math.round((v / sizes[i]) * 100) / 100)
    if (ratios.length) pushCanvas('TY-05', Math.min(...ratios), 'ratio', 'min_adjacent_ratio', { ratios })
    else unmeasured.push({ ruleId: 'TY-05', reason: '字号档位 < 2，相邻比不可算' })

    pushCanvas('TY-06', weights.size, 'count', 'weight_levels', { weights: [...weights].sort((a, b) => a - b) })

    const sat = (c: string) => {
      const m = /^#([0-9a-f]{6})$/i.exec(c)
      if (!m) return 0
      const r = parseInt(m[1].slice(0, 2), 16)
      const g = parseInt(m[1].slice(2, 4), 16)
      const b = parseInt(m[1].slice(4, 6), 16)
      return (Math.max(r, g, b) - Math.min(r, g, b)) / 255
    }
    const lum = (c: string) => {
      const m = /^#([0-9a-f]{6})$/i.exec(c)
      if (!m) return 0
      const ch = (v: number) => {
        const s = v / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * ch(parseInt(m[1].slice(0, 2), 16)) + 0.7152 * ch(parseInt(m[1].slice(2, 4), 16)) + 0.0722 * ch(parseInt(m[1].slice(4, 6), 16))
    }

    const colorList = [...colors]
    const hexOnly = colorList.filter((c) => /^#[0-9a-f]{6}$/i.test(c))
    if (!hexOnly.length) {
      unmeasured.push({ ruleId: 'TX-01', reason: '文字颜色不是十六进制（可能是渐变或 currentColor），没有可解析的填充色' })
    } else {
      const neutral = hexOnly.filter((c) => sat(c) < 0.2 && lum(c) < 0.75).sort()
      const accent = hexOnly.filter((c) => sat(c) >= 0.2).sort()
      const inverted = hexOnly.filter((c) => lum(c) >= 0.75).sort()
      pushCanvas('TX-01', neutral.length, 'count', 'text_neutral_colors', { colors: neutral, inverted, accent })
      const sub = RULES['TX-01'].secondary
      if (sub?.gate) pushCanvas('TX-01', accent.length, 'count', 'text_accent_colors', { colors: accent }, sub.gate)
    }

    const centered = texts.filter((t) => (t.align === 'middle' || t.align === 'center') && (t.charCount || 0) > 30)
    out.push({
      ruleId: 'TY-07',
      element: centered.slice(0, 4).map((t) => t.id).join(', ') || 'canvas',
      measured: centered.length,
      unit: 'count',
      status: gateStatus(RULES['TY-07'].gate, centered.length),
      method: 'centered_long_text',
      evidence: { ids: centered.slice(0, 8).map((t) => t.id) },
    })

    const thin = texts.filter((t) => (t.fontWeight || 400) <= 300 && (t.fontSize || 99) < 24)
    out.push({
      ruleId: 'TY-08',
      element: thin.slice(0, 4).map((t) => t.id).join(', ') || 'canvas',
      measured: thin.length,
      unit: 'count',
      status: gateStatus(RULES['TY-08'].gate, thin.length),
      method: 'thin_weight_small',
      evidence: { ids: thin.slice(0, 8).map((t) => ({ id: t.id, fontSize: r2(t.fontSize || 0) })) },
    })

    if (!scaleLadder?.length) {
      unmeasured.push({ ruleId: 'TY-04', reason: '没有填写字号阶梯，无法判断阶梯外字号' })
    } else {
      const off = texts.filter((t) => t.fontSize && !scaleLadder.some((v) => Math.abs(t.fontSize! - v) < 0.6))
      out.push({
        ruleId: 'TY-04',
        element: off.slice(0, 4).map((t) => t.id).join(', ') || 'none',
        measured: off.length,
        unit: 'count',
        status: gateStatus(RULES['TY-04'].gate, off.length),
        method: 'off_scale_sizes',
        evidence: { ladder: [...scaleLadder].sort((a, b) => a - b), off: off.slice(0, 8).map((t) => ({ id: t.id, fontSize: r2(t.fontSize!) })) },
      })
    }
  }

  return { findings: out, unmeasured }
}
