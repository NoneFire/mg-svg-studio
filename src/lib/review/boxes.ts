import type { QvElement } from './types'
import type { Snapshot } from './snapshot'

/** 与 svg-doc 的遍历规则保持一致：元素 id 相同，面板里的「定位」才能选中画布元素。 */
const SKIP_TAGS = new Set([
  'defs',
  'style',
  'title',
  'desc',
  'metadata',
  'clippath',
  'mask',
  'lineargradient',
  'radialgradient',
  'pattern',
  'filter',
  'symbol',
  'marker',
])

const localTag = (el: Element) => (el.localName || el.tagName || '').toLowerCase()

export interface BoxesResult {
  elements: QvElement[]
  /** 组 id → 包围盒，用于 QL-01 的容器判定 */
  groupBoxes: Record<string, [number, number, number, number]>
  brokenImages: string[]
  unresolvedImages: string[]
  notes: string[]
}

interface Ctx {
  snap: Snapshot
  originLeft: number
  originTop: number
  scale: number
  counter: number
  elements: QvElement[]
  groupBoxes: Record<string, [number, number, number, number]>
  notes: string[]
}

function toUser(ctx: Ctx, r: DOMRect): [number, number, number, number] {
  const x = (r.left - ctx.originLeft) / ctx.scale
  const y = (r.top - ctx.originTop) / ctx.scale
  const w = r.width / ctx.scale
  const h = r.height / ctx.scale
  return [round(x), round(y), round(w), round(h)]
}

const round = (v: number) => Math.round(v * 100) / 100

const groupIdCache = new WeakMap<Element, string>()
let groupSeq = 0


/** 从 data URI 的 PNG/JPEG 头部读原始宽高；读不到返回 null */
function dataUriImageSize(href: string): { w: number; h: number } | null {
  const m = /^data:image\/(png|jpe?g);base64,([\s\S]+)$/i.exec(href)
  if (!m) return null
  let bin: string
  try {
    bin = atob(m[2].slice(0, 8192))
  } catch {
    return null
  }
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  if (m[1].toLowerCase() === 'png') {
    if (bytes.length < 24) return null
    const w = (bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]
    const h = (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]
    return w > 0 && h > 0 ? { w, h } : null
  }
  let i = 2
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) {
      i++
      continue
    }
    const marker = bytes[i + 1]
    if (marker >= 0xc0 && marker <= 0xc3) {
      const h = (bytes[i + 5] << 8) | bytes[i + 6]
      const w = (bytes[i + 7] << 8) | bytes[i + 8]
      return w > 0 && h > 0 ? { w, h } : null
    }
    const len = (bytes[i + 2] << 8) | bytes[i + 3]
    i += 2 + len
  }
  return null
}

const SHAPE_TAGS = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path', 'image'])

/**
 * 同一父节点下的图形（不含文字）并集，代表「卡片底」。
 * 只收够大块的图形：一条 2px 的分隔线不该被当成文字容器，否则每段文字都会被判溢出。
 */
function frameOf(el: Element, textRect: DOMRect, ctx: Ctx): [number, number, number, number] | null {
  const parent = el.parentElement
  if (!parent) return null
  const boxes: [number, number, number, number][] = []
  for (const sibling of Array.from(parent.children)) {
    if (sibling === el) continue
    const tag = localTag(sibling)
    if (!SHAPE_TAGS.has(tag)) continue
    const r = sibling.getBoundingClientRect()
    if (r.width < textRect.width * 0.35 || r.height < textRect.height * 0.35) continue
    boxes.push(toUser(ctx, r))
  }
  if (!boxes.length) return null
  const x0 = Math.min(...boxes.map((b) => b[0]))
  const y0 = Math.min(...boxes.map((b) => b[1]))
  const x1 = Math.max(...boxes.map((b) => b[0] + b[2]))
  const y1 = Math.max(...boxes.map((b) => b[1] + b[3]))
  const frameArea = (x1 - x0) * (y1 - y0)
  const textArea = (textRect.width / ctx.scale) * (textRect.height / ctx.scale)
  if (frameArea < textArea * 0.5) return null
  return [round(x0), round(y0), round(x1 - x0), round(y1 - y0)]
}

function groupIdOf(node: Element): string {
  const cached = groupIdCache.get(node)
  if (cached) return cached
  const raw = node.getAttribute('data-group') || node.getAttribute('id')
  const cls = (node.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0]
  const id = raw ? raw : `ace:${cls || node.localName || 'g'}#${++groupSeq}`
  groupIdCache.set(node, id)
  return id
}

/**
 * 文字容器：向上找第一个「装得下这段文字、且面积明显更大」的祖先。
 * 只看最近一层 <g> 会让容器恒等于文字自身，溢出永远测不出来。
 */
function findContainer(el: Element, rect: DOMRect, ctx: Ctx): { id: string; box: [number, number, number, number] } | null {
  const area = Math.max(1, rect.width * rect.height)
  let node: Element | null = el.parentElement
  while (node && node !== ctx.snap.svg) {
    const r = node.getBoundingClientRect()
    if (r.width >= rect.width && r.height >= rect.height && r.width * r.height >= area * 1.25 + 4) {
      const id = groupIdOf(node)
      const box = toUser(ctx, r)
      ctx.groupBoxes[id] = box
      return { id, box }
    }
    node = node.parentElement
  }
  return null
}

/** 取第 0 个字体族，去掉引号 */
function firstFamily(v: string): string {
  return String(v || '')
    .split(',')[0]
    .trim()
    .replace(/^["']|["']$/g, '')
}

function weightOf(v: string): number {
  const map: Record<string, number> = { normal: 400, bold: 700, bolder: 700, lighter: 300 }
  const key = String(v || '').trim().toLowerCase()
  if (map[key]) return map[key]
  const n = parseFloat(key)
  return Number.isFinite(n) ? n : 400
}

/**
 * 给元素打上稳定的 id，规则和 svg-doc 的遍历完全一致（父 id + 本层序号）。
 * 面板里点「定位」时，这个 id 就是画布上的元素 id。
 */
export function assignIds(snap: Snapshot): Map<string, Element> {
  const map = new Map<string, Element>()
  let counter = 0
  const walk = (el: Element, parentId?: string) => {
    const tag = localTag(el)
    if (!tag || SKIP_TAGS.has(tag)) return
    if (tag === 'use' || tag === 'foreignobject') return
    const index = counter++
    const id = parentId ? `${parentId}.${index}` : String(index)
    el.setAttribute('data-qv-id', id)
    map.set(id, el)
    if (getComputedStyle(el).display === 'none') return
    for (const child of Array.from(el.children)) walk(child, id)
  }
  walk(snap.svg)
  return map
}

export function extractBoxes(snap: Snapshot): BoxesResult {
  if (!snap.svg.querySelector('[data-qv-id]')) assignIds(snap)
  const origin = snap.svg.getBoundingClientRect()
  const ctx: Ctx = {
    snap,
    originLeft: origin.left,
    originTop: origin.top,
    scale: snap.unitScale || 1,
    counter: 0,
    elements: [],
    groupBoxes: {},
    notes: [],
  }
  const brokenImages: string[] = []
  const unresolvedImages: string[] = []

  const walk = (el: Element, containerId: string | undefined, groupId: string | undefined) => {
    const tag = localTag(el)
    if (!tag || SKIP_TAGS.has(tag)) return
    if (tag === 'use' || tag === 'foreignobject') return

    const id = el.getAttribute('data-qv-id')
    if (!id) return
    const cs = getComputedStyle(el)
    if (cs.display === 'none') return

    let nextContainer = containerId
    let nextGroup = groupId

    if (tag === 'svg' || tag === 'g') {
      const explicit = el.getAttribute('data-group') || el.getAttribute('id') || el.getAttribute('class')
      if (tag === 'g' && explicit) {
        const raw = el.getAttribute('data-group') || el.getAttribute('id')
        const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0]
        nextGroup = raw ? raw : `g:${cls || 'group'}#${Object.keys(ctx.groupBoxes).length + 1}`
        nextContainer = nextGroup
        const rect = toUser(ctx, el.getBoundingClientRect())
        ctx.groupBoxes[nextGroup] = rect
      }
      for (const child of Array.from(el.children)) {
        walk(child, nextContainer, nextGroup)
      }
      return
    }

    const rect = el.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0 && tag !== 'text') return
    const bbox = toUser(ctx, rect)
    const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean)[0]
    const role = cls || (tag === 'image' ? 'image' : tag === 'text' ? 'text' : 'shape')
    const ownOpacity = Number.parseFloat(cs.opacity || '1')
    const visible = isVisible(el, cs)

    const kind: QvElement['kind'] = tag === 'text' ? 'text' : tag === 'image' ? 'image' : 'shape'

    let imgSize: { w: number; h: number } | null = null
    if (tag === 'image') {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href') || (el as SVGImageElement).href?.baseVal || ''
      if (!href.trim()) brokenImages.push(id)
      else if (!/^data:/i.test(href)) unresolvedImages.push(href)
      else imgSize = dataUriImageSize(href)
    }

    const out: QvElement = {
      id,
      tag,
      kind,
      bbox,
      z: ctx.elements.length,
      opacity: Number.isFinite(ownOpacity) ? ownOpacity : 1,
      role,
      container: nextContainer,
      group: nextGroup,
      style: { fill: cssColor(cs.fill), stroke: cssColor(cs.stroke), weight: cs.fontWeight },
    }

    if (tag === 'text') {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text) return
      const fontSize = Number.parseFloat(cs.fontSize) / ctx.scale
      out.text = text.slice(0, 200)
      out.charCount = text.replace(/\s/g, '').length
      out.fontSize = Number.isFinite(fontSize) ? round(fontSize) : undefined
      out.fontFamily = firstFamily(cs.fontFamily)
      out.fontWeight = weightOf(cs.fontWeight)
      out.fill = cssColor(cs.fill)
      out.align = (cs.textAnchor || 'start').toLowerCase()
      out.lineHeight = explicitLineHeight(cs, ctx.scale)
      // 真正的「容器」是能装下文字、且比自己大一圈的祖先；只等于自己的 <g> 不算
      const container = findContainer(el, rect, ctx)
      out.container = container?.id
      // 容器自己的包围盒包含这段文字，永远判不出溢出。
      // 卡片类版面里真正的边界是同一层里的图形（rect 底、边框），单独取它们的并集。
      const frame = frameOf(el, rect, ctx)
      if (frame) out.containerFrame = frame
      out.visible = visible
      ctx.elements.push(out)
      return
    }

    if (tag === 'image') {
      out.text = 'image'
      if (imgSize) {
        out.imgW = imgSize.w
        out.imgH = imgSize.h
      }
    }
    out.visible = visible
    ctx.elements.push(out)
  }

  for (const child of Array.from(snap.svg.children)) {
    walk(child, undefined, undefined)
  }

  deriveLineHeights(ctx.elements)

  return { elements: ctx.elements, groupBoxes: ctx.groupBoxes, brokenImages, unresolvedImages, notes: ctx.notes }
}

function isVisible(el: Element, cs: CSSStyleDeclaration): boolean {
  if (cs.visibility === 'hidden' || cs.visibility === 'collapse') return false
  let node: Element | null = el
  while (node) {
    const style = getComputedStyle(node)
    if (style.display === 'none' || Number.parseFloat(style.opacity || '1') < 0.01) return false
    node = node.parentElement
  }
  return true
}

/** computed style 给的是 rgb()，规则表里判彩度要的是十六进制：统一转掉 */
function cssColor(value: string): string {
  if (!value || value === 'none') return value || 'none'
  const m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(value)
  if (m) {
    const to = (v: string) => Math.max(0, Math.min(255, Math.round(Number(v)))).toString(16).padStart(2, '0')
    return ('#' + to(m[1]) + to(m[2]) + to(m[3])).toUpperCase()
  }
  return value.replace(/\s+/g, '')
}

/** 只认显式声明的 line-height；浏览器对 SVG <text> 的默认 line-height 不参与渲染，不能当依据。 */
function explicitLineHeight(cs: CSSStyleDeclaration, scale: number): number | undefined {
  const raw = cs.lineHeight
  if (!raw || raw === 'normal' || raw === 'initial') return undefined
  const m = /^([\d.]+)px$/.exec(raw)
  if (!m) return undefined
  const px = Number.parseFloat(m[1]) / scale
  return Number.isFinite(px) && px > 0 ? round(px) : undefined
}

/**
 * 多行文本的基线间距：同一个容器里、同字号同锚点的相邻文字，竖直间距落在
 * 1.0–1.9 倍字号之间就算同一个段落，用相邻基线差的中位数当行高。
 * 这只是几何推导，不是 CSS 声明，evidence 里会标 baseline_delta。
 */
function deriveLineHeights(elements: QvElement[]) {
  const buckets = new Map<string, QvElement[]>()
  for (const el of elements) {
    if (el.kind !== 'text' || !el.fontSize || el.lineHeight) continue
    const key = [el.container || 'root', Math.round(el.fontSize * 2) / 2, el.align || 'start'].join('|')
    const list = buckets.get(key) || []
    list.push(el)
    buckets.set(key, list)
  }
  for (const list of buckets.values()) {
    if (list.length < 2) continue
    list.sort((a, b) => a.bbox[1] - b.bbox[1])
    const deltas: number[] = []
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1]
      const cur = list[i]
      const gap = cur.bbox[1] - prev.bbox[1]
      const fs = prev.fontSize || 0
      if (gap >= fs && gap <= fs * 1.9) {
        const overlapX = Math.min(prev.bbox[0] + prev.bbox[2], cur.bbox[0] + cur.bbox[2]) - Math.max(prev.bbox[0], cur.bbox[0])
        if (overlapX > 0.4 * Math.min(prev.bbox[2], cur.bbox[2])) deltas.push(gap)
      }
    }
    if (deltas.length < 1) continue
    deltas.sort((a, b) => a - b)
    const median = deltas[Math.floor(deltas.length / 2)]
    for (const el of list) {
      el.lineHeight = round(median)
      el.lineHeightSource = 'baseline_delta'
    }
  }
}
