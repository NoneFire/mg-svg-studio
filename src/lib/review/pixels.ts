import { RULES, gateStatus } from './rules'
import type { QvElement } from './types'
import type { RawFinding } from './findings'
import type { Raster } from './snapshot'

/**
 * 像素类测量：对比度、调色板、负空间。
 * sample_contrast 是 measure.py 的逐行移植——不取盒子平均色，先分离字形核心再取中位色，
 * 并按 3×3 分区取最差值。细字的抗锯齿边缘会把对比度报低，腐蚀这一步不能省。
 */

type RGB = [number, number, number]

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export const relLum = (rgb: RGB) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])

export function contrastRatio(fg: RGB, bg: RGB): number {
  const a = relLum(fg)
  const b = relLum(bg)
  const hi = Math.max(a, b)
  const lo = Math.min(a, b)
  return (hi + 0.05) / (lo + 0.05)
}

const hex = (rgb: RGB) => '#' + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('').toUpperCase()

function medianRgb(px: RGB[]): RGB {
  if (!px.length) return [0, 0, 0]
  const med = (i: number) => {
    const vals = px.map((p) => p[i]).sort((a, b) => a - b)
    const mid = Math.floor(vals.length / 2)
    return vals.length % 2 ? vals[mid] : Math.round((vals[mid - 1] + vals[mid]) / 2)
  }
  return [med(0), med(1), med(2)]
}

function modeColor(px: RGB[]): RGB | null {
  if (!px.length) return null
  const bins = new Map<number, RGB[]>()
  for (const p of px) {
    const k = ((p[0] >> 3) << 10) | ((p[1] >> 3) << 5) | (p[2] >> 3)
    const list = bins.get(k) || []
    list.push(p)
    bins.set(k, list)
  }
  let best: RGB[] = []
  for (const list of bins.values()) if (list.length > best.length) best = list
  return best.length ? medianRgb(best) : null
}

/**
 * 底色之外占比最高的那一簇颜色。用来救「字和底几乎同色」：
 * 亮度差不到 0.15 时找不到字形核心，但整块里确实有第二种颜色，那就是字。
 */
function secondMode(px: RGB[], bg: RGB): { color: RGB; share: number } | null {
  const bl = relLum(bg)
  const bins = new Map<number, RGB[]>()
  for (const p of px) {
    if (Math.abs(relLum(p) - bl) <= 0.02) continue
    const k = ((p[0] >> 3) << 10) | ((p[1] >> 3) << 5) | (p[2] >> 3)
    const list = bins.get(k) || []
    list.push(p)
    bins.set(k, list)
  }
  let best: RGB[] = []
  for (const list of bins.values()) if (list.length > best.length) best = list
  if (!best.length) return null
  return { color: medianRgb(best), share: best.length / px.length }
}

function ringPixels(px: RGB[], w: number, h: number, inset?: number): RGB[] {
  let t = inset ?? Math.max(1, Math.round(0.06 * Math.min(w, h)))
  t = Math.max(1, Math.min(t, Math.max(1, Math.floor(Math.min(w, h) / 2))))
  const ring: RGB[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x < t || x >= w - t || y < t || y >= h - t) ring.push(px[y * w + x])
    }
  }
  return ring
}

function inkRatio(px: RGB[], bgLum: number, tol = 0.15): number {
  if (!px.length) return 0
  let ink = 0
  for (const p of px) if (Math.abs(relLum(p) - bgLum) > tol) ink++
  return ink / px.length
}

function pickBg(px: RGB[], w: number, h: number): RGB | null {
  const ring = modeColor(ringPixels(px, w, h))
  const box = modeColor(px)
  for (const cand of [ring, box]) {
    if (!cand) continue
    const ratio = inkRatio(px, relLum(cand))
    if (ratio >= 0.01 && ratio <= 0.5) return cand
  }
  return ring || box
}

function erode(mask: boolean[], w: number, h: number): boolean[] {
  if (w < 3 || h < 3) return new Array(mask.length).fill(false)
  const out = new Array(mask.length).fill(false)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      if (
        mask[i] &&
        mask[i - 1] &&
        mask[i + 1] &&
        mask[i - w] &&
        mask[i + w] &&
        mask[i - w - 1] &&
        mask[i - w + 1] &&
        mask[i + w - 1] &&
        mask[i + w + 1]
      ) {
        out[i] = true
      }
    }
  }
  return out
}

function coreIndexes(px: RGB[], bg: RGB, w: number, h: number): { sel: number[]; ink: number; method: string } | null {
  const bl = relLum(bg)
  const dist = px.map((p) => Math.abs(relLum(p) - bl))
  const mask = dist.map((d) => d > 0.15)
  const ink = mask.filter(Boolean).length / Math.max(1, mask.length)
  if (ink < 0.005 || ink > 0.6) return null
  const eroded = erode(mask, w, h)
  let sel = eroded.map((v, i) => (v ? i : -1)).filter((i) => i >= 0)
  let method = 'eroded_core'
  if (sel.length < 12) {
    const cand = dist.filter((_, i) => mask[i]).sort((a, b) => a - b)
    const cut = cand.length ? cand[Math.floor(0.9 * (cand.length - 1))] : 1
    sel = dist.map((d, i) => (mask[i] && d >= cut ? i : -1)).filter((i) => i >= 0)
    method = 'far_tail'
  }
  if (sel.length < 8) return null
  return { sel, ink, method }
}

export interface ContrastSample {
  ratio: number
  regionWorst: number
  fg: string
  bg: string
  inkRatio: number
  samples: number
  sampling: string
  regionMethod: string
}

/** 在像素上把字形与底色分开，返回整体与 3×3 最差区域的对比度。 */
export function sampleContrast(
  raster: Raster,
  bbox: [number, number, number, number],
  fineCells = true
): ContrastSample | null {
  if (!raster.image) return null
  const s = raster.pixelScale
  let x = Math.round(bbox[0] * s)
  let y = Math.round(bbox[1] * s)
  let w = Math.round(bbox[2] * s)
  let h = Math.round(bbox[3] * s)
  if (w <= 2 || h <= 2) return null
  w = Math.min(w, raster.width - x)
  h = Math.min(h, raster.height - y)
  if (x < 0) {
    w += x
    x = 0
  }
  if (y < 0) {
    h += y
    y = 0
  }
  if (w <= 2 || h <= 2) return null

  const data = raster.image.data
  const px: RGB[] = new Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const o = ((y + j) * raster.width + (x + i)) * 4
      const a = data[o + 3] / 255
      // 透明区域按白底合成：不合成的话空背景会被当成纯黑
      px[j * w + i] = [
        data[o] * a + 255 * (1 - a),
        data[o + 1] * a + 255 * (1 - a),
        data[o + 2] * a + 255 * (1 - a),
      ]
    }
  }

  const bg = pickBg(px, w, h)
  if (!bg) return null
  const core = coreIndexes(px, bg, w, h)
  if (!core) {
    // 亮度差不到 0.15 时找不到「字形核心」。但字和底几乎同色本身就是最糟的情况，
    // 不能因为测不到就消失：退到「底色之外占比最高的那一簇」当代字色。
    const alt = secondMode(px, bg)
    if (alt && alt.share >= 0.02) {
      const ratio = contrastRatio(alt.color, bg)
      return {
        ratio: Math.round(ratio * 100) / 100,
        regionWorst: Math.round(ratio * 100) / 100,
        fg: hex(alt.color),
        bg: hex(bg),
        inkRatio: Math.round(alt.share * 10000) / 10000,
        samples: Math.round(alt.share * px.length),
        sampling: 'low_contrast_mode',
        regionMethod: 'whole_box',
      }
    }
    // 整框真的只有一种颜色：文字根本没画出来
    let minL = 1
    let maxL = 0
    for (const p of px) {
      const l = relLum(p)
      if (l < minL) minL = l
      if (l > maxL) maxL = l
    }
    if (maxL - minL <= 0.02) {
      return {
        ratio: 1,
        regionWorst: 1,
        fg: hex(bg),
        bg: hex(bg),
        inkRatio: 0,
        samples: 0,
        sampling: 'no_ink',
        regionMethod: 'no_ink',
      }
    }
    return null
  }
  const fg = medianRgb(core.sel.map((i) => px[i]))
  const ratio = contrastRatio(fg, bg)

  // 小字（<24px）的 3×3 分格里几乎没有笔画内部像素，取最差格会把抗锯齿边缘当字色，
  // 5.2:1 的正文会被报成 1.87:1。小字只认整框，证据里写明用了哪种采样。
  let worst = ratio
  let regionMethod = 'whole_box'
  if (fineCells) {
    regionMethod = 'cells_3x3'
  }
  for (let gy = 0; fineCells && gy < 3; gy++) {
    for (let gx = 0; fineCells && gx < 3; gx++) {
      const x0 = (gx * w) / 3
      const x1 = ((gx + 1) * w) / 3
      const y0 = (gy * h) / 3
      const y1 = ((gy + 1) * h) / 3
      const ids = core.sel.filter((i) => {
        const cx = i % w
        const cy = Math.floor(i / w)
        return cx >= x0 && cx < x1 && cy >= y0 && cy < y1
      })
      if (ids.length < 8) continue
      worst = Math.min(worst, contrastRatio(medianRgb(ids.map((i) => px[i])), bg))
    }
  }

  return {
    ratio: Math.round(ratio * 100) / 100,
    regionWorst: Math.round(worst * 100) / 100,
    regionMethod,
    fg: hex(fg),
    bg: hex(bg),
    inkRatio: Math.round(core.ink * 10000) / 10000,
    samples: core.sel.length,
    sampling: core.method,
  }
}

export interface ContrastInput {
  texts: QvElement[]
  raster: Raster | null
  W: number
  medium: 'ui' | 'print'
  displayWidth?: number
}

export function measureContrast(input: ContrastInput): { findings: RawFinding[]; unmeasured: { ruleId: string; reason: string }[] } {
  const out: RawFinding[] = []
  const unmeasured: { ruleId: string; reason: string }[] = []
  const { texts, raster, W, medium, displayWidth } = input
  if (!raster || !raster.image) {
    unmeasured.push({
      ruleId: 'CT-02',
      reason: raster?.error ? `画面光栅化失败（${raster.error}），没有像素可取样` : '画面光栅化失败，没有像素可取样',
    })
    return { findings: out, unmeasured }
  }

  // 字数加权：逐字拆开的标题不该把「大字」的门槛抬上去
  const weighted: { size: number; weight: number }[] = texts
    .filter((t) => (t.fontSize || 0) > 0)
    .map((t) => ({ size: t.fontSize!, weight: Math.max(1, t.charCount || 1) }))
    .sort((a, b) => a.size - b.size)
  let medianFs: number | null = null
  if (weighted.length) {
    const total = weighted.reduce((s, it) => s + it.weight, 0)
    let acc = 0
    for (const it of weighted) {
      acc += it.weight
      if (acc >= total / 2) {
        medianFs = it.size
        break
      }
    }
  }
  const rule = RULES['CT-02']

  let measured = 0
  for (const el of texts) {
    if (!el.visible || (el.opacity ?? 1) < 0.05) continue
    // 24px 是 WCAG 的大字分界，也正好是 3×3 分格开始有足够笔画像素的位置
    const sample = sampleContrast(raster, el.bbox, (el.fontSize || 0) >= 24)
    if (!sample) continue
    measured++
    const fs = el.fontSize || 0
    const large = medium === 'ui' && displayWidth ? (fs * displayWidth) / W >= 24 : medium === 'ui' ? fs >= 24 : medianFs ? fs >= 1.8 * medianFs : false
    const gate = large ? rule.gateLarge || rule.gate : rule.gate
    const status = gateStatus(gate, sample.regionWorst)
    out.push({
      ruleId: 'CT-02',
      element: el.id,
      measured: sample.regionWorst,
      unit: 'ratio',
      status,
      method: 'pixel_contrast@3x3_worst',
      metric: 'contrast_ratio',
      evidence: {
        ...sample,
        note:
          sample.sampling === 'no_ink'
            ? '整块文字与底色几乎同色：字形没画出来，或颜色贴住了背景'
            : sample.sampling === 'low_contrast_mode'
              ? '字色与底色太接近，取的是底色之外占比最高的那簇颜色'
              : undefined,
        bbox: el.bbox.map((v) => Math.round(v * 100) / 100),
        fontSize: Math.round(fs * 10) / 10,
        large,
        text: (el.text || '').slice(0, 30),
        compositedOn: '#FFFFFF',
      },
    })
  }
  if (!measured) {
    unmeasured.push({ ruleId: 'CT-02', reason: '没有可测文本：缺字号、找不到字形核心，或背景过于复杂' })
  }
  return { findings: out, unmeasured }
}

/* ---------------------------------- 画面整体 ---------------------------------- */

export interface PixelsResult {
  findings: RawFinding[]
  palette: string[]
  dominant: string
  whitespace: number
}

export function measurePixels(raster: Raster): PixelsResult {
  const out: RawFinding[] = []
  const data = raster.image.data
  const W = raster.width
  const H = raster.height
  const n = W * H
  const step = Math.max(1, Math.floor(Math.sqrt(n / 400000))) // 大图抽样，最多约 40 万点
  const gw = Math.ceil(W / step)
  const gh = Math.ceil(H / step)
  const hist = new Map<number, { count: number; r: number; g: number; b: number }>()
  // 抽样网格按 gw×gh 记账，环带仍按画面的相对位置取
  const px: RGB[] = new Array(gw * gh)
  for (let j = 0; j < gh; j++) {
    const y = Math.min(H - 1, j * step)
    for (let i = 0; i < gw; i++) {
      const x = Math.min(W - 1, i * step)
      const o = (y * W + x) * 4
      const a = data[o + 3] / 255
      const r = data[o] * a + 255 * (1 - a)
      const g = data[o + 1] * a + 255 * (1 - a)
      const b = data[o + 2] * a + 255 * (1 - a)
      px[j * gw + i] = [r, g, b]
      const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
      const rec = hist.get(k) || { count: 0, r: 0, g: 0, b: 0 }
      rec.count++
      rec.r += r
      rec.g += g
      rec.b += b
      hist.set(k, rec)
    }
  }
  const total = px.length || 1
  const ranked = [...hist.entries()].sort((a, b) => b[1].count - a[1].count)
  const rep = (rec: { count: number; r: number; g: number; b: number }): RGB => [
    rec.r / Math.max(1, rec.count),
    rec.g / Math.max(1, rec.count),
    rec.b / Math.max(1, rec.count),
  ]
  const dominantShare = ranked.length ? ranked[0][1].count / total : 0
  const palette = ranked.filter(([, rec]) => rec.count / total > 0.005).map(([, rec]) => hex(rep(rec)))

  const cl = RULES['CL-01']
  const paletteCount = palette.length
  out.push({
    ruleId: 'CL-01',
    element: 'canvas',
    measured: paletteCount,
    unit: 'count',
    status: gateStatus(cl.gate, paletteCount),
    method: 'quantized_palette@0.5%',
    metric: 'palette_count',
    evidence: { palette: palette.slice(0, 8) },
  })
  if (cl.secondary?.gate) {
    const share = Math.round(dominantShare * 1000) / 1000
    out.push({
      ruleId: 'CL-01',
      element: 'canvas',
      measured: share,
      unit: 'ratio',
      status: gateStatus(cl.secondary.gate, share),
      method: 'dominant_share',
      metric: 'dominant_share',
      evidence: { dominant: hex(rep(ranked[0]?.[1] || { count: 1, r: 0, g: 0, b: 0 })) },
    })
  }

  // 留白率 = 背景色占比；取四边环带的众数色当背景，不能写成 1 - 主色占比
  const ring = ringPixels(px, gw, gh, Math.max(1, Math.round(0.02 * Math.min(gw, gh))))
  const bg = modeColor(ring) || modeColor(px) || ([255, 255, 255] as RGB)
  const tol = 12
  let same = 0
  for (const p of px) {
    if (Math.max(Math.abs(p[0] - bg[0]), Math.abs(p[1] - bg[1]), Math.abs(p[2] - bg[2])) <= tol) same++
  }
  const whitespace = same / total
  out.push({
    ruleId: 'NS-01',
    element: 'canvas',
    measured: Math.round(whitespace * 1000) / 1000,
    unit: 'ratio',
    status: gateStatus(RULES['NS-01'].gate, whitespace),
    method: 'background_share',
    metric: 'whitespace_ratio',
    evidence: { bg: hex(bg), inkShare: Math.round((1 - whitespace) * 1000) / 1000, tolerance: tol },
  })

  return { findings: out, palette, dominant: hex(rep(ranked[0]?.[1] || { count: 1, r: 0, g: 0, b: 0 })), whitespace }
}
