import type { AnimGroup, Keyframe, PropTrack } from '../types'
import { evalTimeExpr, matchRules, parseStylesheet, substituteVars, type Stylesheet } from './css'
import { queueSvgFonts } from './fonts'

export interface GradientStop {
  offset: number
  color: string
  opacity: number
}

export interface GradientDef {
  id: string
  type: 'linear' | 'radial'
  units: 'objectBoundingBox' | 'userSpaceOnUse'
  x1: number
  y1: number
  x2: number
  y2: number
  cx: number
  cy: number
  r: number
  fx: number
  fy: number
  transform?: string
  spread: string
  stops: GradientStop[]
}

export interface FilterDef {
  id: string
  blur?: number
  unsupported: string[]
}

export interface GfxEl {
  id: string
  tag: string
  kind: 'group' | 'shape' | 'text' | 'image' | 'other'
  dom: Element
  depth: number
  parentId?: string
  children: GfxEl[]
  style: Record<string, string>
  label: string
  text?: string
  /** 是否参与绘制（defs/标题等为 false） */
  visible: boolean
}

export interface SvgDocument {
  width: number
  height: number
  viewBox: [number, number, number, number]
  root: GfxEl
  elements: GfxEl[]
  drawables: GfxEl[]
  gradients: Record<string, GradientDef>
  filters: Record<string, FilterDef>
  sheet: Stylesheet
  warnings: string[]
  groups: AnimGroup[]
}

const SHAPE_TAGS = new Set(['rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'path'])
const DRAW_TAGS = new Set([...SHAPE_TAGS, 'text'])
const SKIP_TAGS = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'clippath', 'mask', 'lineargradient', 'radialgradient', 'pattern', 'filter', 'symbol', 'marker'])

const INHERITED = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-linecap',
  'stroke-linejoin',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
  'visibility',
  'clip-rule',
]

const GEOMETRY = [
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
  'd',
  'dx',
  'dy',
  'text-anchor',
  'dominant-baseline',
]

const PRESENTATION = new Set([
  ...INHERITED,
  ...GEOMETRY,
  'opacity',
  'display',
  'transform',
  'transform-origin',
  'transform-box',
  'filter',
  'clip-path',
  'mask',
  'mix-blend-mode',
])

const STYLE_ATTR_ALIAS: Record<string, string> = {
  'font-family': 'font-family',
}

function num(v: string | null | undefined, fallback = 0): number {
  if (v == null) return fallback
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

function localTag(el: Element): string {
  return (el.localName || el.tagName || '').toLowerCase()
}

function collectSheet(doc: Document): Stylesheet {
  let css = ''
  doc.querySelectorAll('style').forEach((s) => {
    css += '\n' + (s.textContent || '')
  })
  return parseStylesheet(css)
}

let parserFactory: () => { parseFromString: (text: string, type: string) => Document } = () => new DOMParser()

/** 让 Node 侧（CLI / MCP）注入 linkedom 之类的 XML 解析器 */
export function setSvgDomParser(factory: () => { parseFromString: (text: string, type: string) => Document }) {
  parserFactory = factory
}

export function parseSvgDocument(svgText: string): SvgDocument {
  const warnings: string[] = []
  const doc = parserFactory().parseFromString(svgText, 'image/svg+xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) throw new Error('SVG 解析失败：' + (parseError.textContent || '').slice(0, 120))

  const svg = doc.documentElement
  if (localTag(svg) !== 'svg') throw new Error('不是有效 SVG 文件')

  const sheet = collectSheet(doc)

  const viewBoxAttr = svg.getAttribute('viewBox')
  let viewBox: [number, number, number, number]
  if (viewBoxAttr) {
    const p = viewBoxAttr.split(/[\s,]+/).map(Number)
    viewBox = [p[0] || 0, p[1] || 0, p[2] || 0, p[3] || 0]
  } else {
    viewBox = [0, 0, num(svg.getAttribute('width'), 1920), num(svg.getAttribute('height'), 1080)]
  }
  const rawW = svg.getAttribute('width')
  const rawH = svg.getAttribute('height')
  const width = rawW && !rawW.includes('%') ? num(rawW, viewBox[2]) : viewBox[2] || 1920
  const height = rawH && !rawH.includes('%') ? num(rawH, viewBox[3]) : viewBox[3] || 1080

  // 渐变 / 滤镜
  const gradients: Record<string, GradientDef> = {}
  const filterDefs: Record<string, FilterDef> = {}
  const patternIds = new Set<string>()

  doc.querySelectorAll('linearGradient, radialGradient').forEach((g) => {
    const id = g.getAttribute('id')
    if (!id) return
    const isLinear = localTag(g) === 'lineargradient'
    const stops: GradientStop[] = []
    g.querySelectorAll('stop').forEach((s) => {
      stops.push({
        offset: num(s.getAttribute('offset'), 0),
        color: s.getAttribute('stop-color') || '#000000',
        opacity: num(s.getAttribute('stop-opacity'), 1),
      })
    })
    gradients[id] = {
      id,
      type: isLinear ? 'linear' : 'radial',
      units: (g.getAttribute('gradientUnits') as GradientDef['units']) || 'objectBoundingBox',
      x1: num(g.getAttribute('x1'), 0),
      y1: num(g.getAttribute('y1'), 0),
      x2: num(g.getAttribute('x2'), isLinear ? 1 : 0),
      y2: num(g.getAttribute('y2'), isLinear ? 0 : 1),
      cx: num(g.getAttribute('cx'), 0.5),
      cy: num(g.getAttribute('cy'), 0.5),
      r: num(g.getAttribute('r'), 0.5),
      fx: num(g.getAttribute('fx'), num(g.getAttribute('cx'), 0.5)),
      fy: num(g.getAttribute('fy'), num(g.getAttribute('cy'), 0.5)),
      transform: g.getAttribute('gradientTransform') || undefined,
      spread: g.getAttribute('spreadMethod') || 'pad',
      stops,
    }
  })

  doc.querySelectorAll('pattern').forEach((p) => {
    const id = p.getAttribute('id')
    if (id) patternIds.add(id)
  })

  doc.querySelectorAll('filter').forEach((f) => {
    const id = f.getAttribute('id')
    if (!id) return
    const blurEl = f.querySelector('feGaussianBlur')
    const unsupported: string[] = []
    f.querySelectorAll('*').forEach((child) => {
      const t = localTag(child)
      if (t === 'fegaussianblur') return
      if (t === 'filter') return
      unsupported.push(t.replace(/^fe/, 'fe'))
    })
    filterDefs[id] = {
      id,
      blur: blurEl ? num(blurEl.getAttribute('stdDeviation'), 0) : undefined,
      unsupported: Array.from(new Set(unsupported)),
    }
  })

  Object.values(filterDefs).forEach((def) => {
    if (def.unsupported.length && def.blur) warnings.push(`滤镜 #${def.id} 只保留模糊 ${def.blur}，${def.unsupported.join('/')} 已忽略`)
    else if (def.unsupported.length)
      warnings.push(
        `滤镜 #${def.id} 已忽略（${def.unsupported[0].replace(/^fe/, 'fe')} 等 ${def.unsupported.length} 个原语不支持）`
      )
    else if (def.blur) warnings.push(`滤镜 #${def.id} 已近似为模糊 ${def.blur}`)
  })

  const elements: GfxEl[] = []
  const drawables: GfxEl[] = []
  let counter = 0

  const resolveStyle = (el: Element, parentStyle: Record<string, string>): Record<string, string> => {
    const style: Record<string, string> = {}
    INHERITED.forEach((k) => {
      if (parentStyle[k] !== undefined) style[k] = parentStyle[k]
    })

    // 1. 表现属性（最低优先级）
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      if (PRESENTATION.has(name)) style[name] = attr.value
    }
    // transform 只从属性读一次
    // 2. CSS 规则
    Object.assign(style, matchRules(el, sheet))
    // 3. 内联样式
    const inline = el.getAttribute('style')
    if (inline) {
      inline.split(';').forEach((chunk) => {
        const idx = chunk.indexOf(':')
        if (idx < 0) return
        const k = chunk.slice(0, idx).trim().toLowerCase()
        const v = chunk.slice(idx + 1).trim()
        if (k) style[k] = v
      })
    }
    // 继承修正：显式 inherit
    Object.keys(style).forEach((k) => {
      if (style[k] === 'inherit' && parentStyle[k] !== undefined) style[k] = parentStyle[k]
    })
    // 解析 var()
    Object.keys(style).forEach((k) => {
      if (style[k] && style[k].includes('var(')) style[k] = substituteVars(style[k], el)
    })
    return style
  }

  const walk = (dom: Element, parent: GfxEl | undefined, depth: number): GfxEl | null => {
    const tag = localTag(dom)
    if (SKIP_TAGS.has(tag)) return null
    if (tag === 'use') {
      warnings.push(`<use> 引用未展开（${dom.getAttribute('href') || dom.getAttribute('xlink:href') || ''}）`)
      return null
    }
    if (tag === 'foreignobject') {
      warnings.push('<foreignObject> 不支持')
      return null
    }
    const index = counter++
    const id = parent ? `${parent.id}.${index}` : `${index}`
    const style = resolveStyle(dom, parent ? parent.style : {})
    const kind: GfxEl['kind'] = tag === 'g' || tag === 'svg' ? 'group' : tag === 'text' ? 'text' : tag === 'image' ? 'image' : SHAPE_TAGS.has(tag) ? 'shape' : 'other'
    if (style.display === 'none') return null

    const node: GfxEl = {
      id,
      tag,
      kind,
      dom,
      depth,
      parentId: parent?.id,
      children: [],
      style,
      label: '',
      visible: true,
    }
    node.label = describe(node)

    elements.push(node)
    if (DRAW_TAGS.has(tag)) drawables.push(node)
    if (tag === 'image') warnings.push('位图以图片形式渲染（不能编辑内部像素）')
    if (style['clip-path']) warnings.push('clip-path 仅支持简单形状，已按叠加处理')
    if (style['mask']) warnings.push('mask 渐变遮罩已被忽略')
    if (tag === 'pattern') warnings.push('pattern 填充已跳过')

    for (const child of Array.from(dom.children)) {
      const c = walk(child, node, depth + 1)
      if (c) node.children.push(c)
    }
    return node
  }

  const root = walk(svg, undefined, 0) || {
    id: 'root',
    tag: 'svg',
    kind: 'group' as const,
    dom: svg,
    depth: 0,
    children: [],
    style: {},
    label: 'svg',
    visible: true,
  }

  if (drawables.length === 0) warnings.push('没有可绘制的图形元素')

  const animatable = elements.filter((e) => e !== root && (e.kind === 'shape' || e.kind === 'text' || e.kind === 'group'))
  const groups = extractAnimations(sheet, animatable, warnings)

  const known = new Set([...Object.keys(gradients), ...Array.from(patternIds)])
  elements.forEach((el) => {
    ;['fill', 'stroke'].forEach((key) => {
      const v = el.style[key]
      if (!v) return
      const m = v.match(/url\(#([^)]+)\)/)
      if (m && !known.has(m[1])) warnings.push(`${key} 引用的 #${m[1]} 不存在，已跳过`)
    })
  })

  if (patternIds.size) {
    drawables.forEach((el) => {
      const fill = el.style['fill'] || ''
      const m = fill.match(/url\(#([^)]+)\)/)
      if (m && patternIds.has(m[1])) warnings.push(`pattern 填充 #${m[1]} 已跳过（用纯色/渐变替代）`)
    })
  }

  // 素材自带的 @font-face 不会进页面；这里排队注册，字体就绪后画布会重建一次
  void queueSvgFonts(svgText)

  return {
    width,
    height,
    viewBox,
    root,
    elements,
    drawables,
    gradients,
    filters: filterDefs,
    sheet,
    warnings: Array.from(new Set(warnings)),
    groups,
  }
}

function describe(node: GfxEl): string {
  const idAttr = node.dom.getAttribute('id')
  if (node.tag === 'text') {
    const text = (node.dom.textContent || '').trim()
    return text ? `“${text.slice(0, 12)}”` : '文本'
  }
  if (idAttr) return `#${idAttr}`
  const cls = node.dom.getAttribute('class')
  if (cls) return `${node.tag}.${cls.split(/\s+/)[0]}`
  return node.tag
}

/* ------------------------------- 动画提取 ------------------------------- */

const TIMING_FUNCS = ['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end']

function parseAnimationShorthand(value: string) {
  const parts = value.trim().split(/\s+/)
  const out: Partial<AnimGroup> & { name?: string } = {}
  let timeSeen = 0
  parts.forEach((p) => {
    if (/^[\d.]+(ms|s)$/.test(p)) {
      if (timeSeen === 0) out.duration = evalTimeExpr(p, null) ?? 0
      else if (timeSeen === 1) out.delay = evalTimeExpr(p, null) ?? 0
      timeSeen++
      return
    }
    if (p === 'infinite') return void (out.iterations = 'infinite')
    if (/^[\d.]+$/.test(p)) return void (out.iterations = parseFloat(p))
    if (['normal', 'reverse', 'alternate', 'alternate-reverse'].includes(p)) return void (out.direction = p as AnimGroup['direction'])
    if (['none', 'forwards', 'backwards', 'both'].includes(p)) return void (out.fillMode = p as AnimGroup['fillMode'])
    if (TIMING_FUNCS.includes(p) || p.startsWith('cubic-bezier') || p.startsWith('steps') || p.startsWith('linear(')) {
      return void (out.ease = p)
    }
    if (!out.name) out.name = p
  })
  return out
}

const ANIM_PROPS = [
  'opacity',
  'transform',
  'letter-spacing',
  'fill',
  'stroke',
  'stroke-width',
  'stroke-dashoffset',
  'stroke-dasharray',
  'font-size',
  'visibility',
  'width',
  'height',
]

function normalizeEase(ease: string): string {
  if (!ease) return 'ease'
  return ease
}

function splitList(value?: string): string[] {
  if (!value) return []
  // 逗号分隔，但要避免切到 cubic-bezier(...) 里的逗号
  const out: string[] = []
  let depth = 0
  let buf = ''
  for (const ch of value) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      out.push(buf.trim())
      buf = ''
    } else buf += ch
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** 解析 transform-origin + transform-box，返回 0-1 的原点比例 */
export function parseTransformOrigin(style: Record<string, string>): { x: number; y: number } {
  const box = style['transform-box'] || 'view-box'
  const origin = style['transform-origin'] || '50% 50%'
  const parts = origin.trim().split(/\s+/)
  const pos = (v: string | undefined, fallback: number) => {
    if (!v) return fallback
    if (v === 'left' || v === 'top') return 0
    if (v === 'center') return 0.5
    if (v === 'right' || v === 'bottom') return 1
    if (v.endsWith('%')) return parseFloat(v) / 100
    return fallback
  }
  const x = pos(parts[0], 0.5)
  const y = pos(parts[1], 0.5)
  return { x, y }
}

function extractAnimations(sheet: Stylesheet, drawables: GfxEl[], warnings: string[]): AnimGroup[] {
  const groups: AnimGroup[] = []
  let n = 0
  for (const el of drawables) {
    const style = el.style
    const animations = splitList(style['animation'])
    const names = splitList(style['animation-name'])
    const durations = splitList(style['animation-duration'])
    const delays = splitList(style['animation-delay'])
    const easings = splitList(style['animation-timing-function'])
    const iterations = splitList(style['animation-iteration-count'])
    const directions = splitList(style['animation-direction'])
    const fills = splitList(style['animation-fill-mode'])

    const list: { name?: string; top?: number; delay?: number; ease?: string; iterations?: number | 'infinite'; direction?: string; fill?: string }[] = []
    if (animations.length) {
      animations.forEach((a) => {
        const parsed = parseAnimationShorthand(substituteVars(a, el.dom))
        list.push({
          name: parsed.name,
          top: parsed.duration,
          delay: parsed.delay,
          ease: parsed.ease,
          iterations: parsed.iterations as number | 'infinite' | undefined,
          direction: parsed.direction,
          fill: parsed.fillMode,
        })
      })
    }
    if (!list.length && names.length) {
      names.forEach((name, i) => {
        list.push({
          name,
          top: evalTimeExpr(durations[i] ?? durations[0], el.dom) ?? 0,
          delay: evalTimeExpr(delays[i] ?? delays[0], el.dom) ?? 0,
          ease: easings[i] ?? easings[0],
        })
      })
    }

    list.forEach((item, idx) => {
      if (!item.name || item.name === 'none') return
      const kf = sheet.keyframes[item.name]
      if (!kf) return
      const durations2 = durations.length ? evalTimeExpr(durations[idx] ?? durations[0], el.dom) : null
      const delays2 = delays.length ? evalTimeExpr(delays[idx] ?? delays[0], el.dom) : null
      const duration = item.top ?? durations2 ?? 0.6
      const delay = item.delay ?? delays2 ?? 0
      const ease = normalizeEase(item.ease || easings[idx] || easings[0] || 'ease')
      const iterRaw = iterations[idx] ?? iterations[0]
      const iter =
        item.iterations === 'infinite'
          ? 'infinite'
          : item.iterations !== undefined
          ? Math.max(1, Number(item.iterations))
          : iterRaw === 'infinite'
          ? 'infinite'
          : Math.max(1, parseFloat(iterRaw ?? '1') || 1)
      const dir = (item.direction ?? directions[idx] ?? directions[0] ?? 'normal') as AnimGroup['direction']
      const fill = (item.fill ?? fills[idx] ?? fills[0] ?? 'none') as AnimGroup['fillMode']

      const tracks: PropTrack[] = []
      ANIM_PROPS.forEach((prop) => {
        const frames: Keyframe[] = []
        kf.frames.forEach((f) => {
          const raw = f.decls[prop]
          if (raw === undefined) return
          frames.push({ offset: f.offset, value: substituteVars(raw, el.dom) })
        })
        if (!frames.length) return
        if (frames[0].offset > 0) frames.unshift({ offset: 0, value: defaultKeyValue(el, prop) })
        if (frames[frames.length - 1].offset < 1) frames.push({ offset: 1, value: frames[frames.length - 1].value })
        tracks.push({ id: `t${n++}`, property: prop, keyframes: frames })
      })
      if (!tracks.length) return

      groups.push({
        id: `g${n++}`,
        name: item.name,
        targetId: el.id,
        duration: Math.max(0.05, duration),
        delay,
        ease,
        iterations: iter,
        direction: dir,
        fillMode: fill,
        tracks,
        origin: 'css',
        originPoint: parseTransformOrigin(style),
        enabled: true,
      })
    })

    // SMIL：<animate> / <animateTransform>
    Array.from(el.dom.children).forEach((child) => {
      const tag = localTag(child)
      if (tag !== 'animate' && tag !== 'animatetransform' && tag !== 'animatemotion') return
      if (tag === 'animatemotion') {
        warnings.push('animateMotion 暂不支持')
        return
      }
      const isTransform = tag === 'animatetransform'
      const attribute = isTransform ? 'transform' : child.getAttribute('attributeName') || 'opacity'
      const tType = (child.getAttribute('type') || 'translate').toLowerCase()
      const convertValue = (v: string): string => {
        if (!isTransform) return v
        const nums = v.trim().split(/[\s,]+/).map(Number)
        if (tType === 'rotate') return `rotate(${nums[0] || 0}deg)`
        if (tType === 'scale') return `scale(${nums[0] ?? 1}${nums[1] !== undefined ? `, ${nums[1]}` : ''})`
        if (tType === 'skewx') return `skewX(${nums[0] || 0}deg)`
        if (tType === 'skewy') return `skewY(${nums[0] || 0}deg)`
        return `translate(${nums[0] || 0}px, ${nums[1] || 0}px)`
      }
      const dur = evalTimeExpr(child.getAttribute('dur'), el.dom) ?? 1
      const begin = evalTimeExpr(child.getAttribute('begin'), el.dom) ?? 0
      const values = child.getAttribute('values')
      const from = child.getAttribute('from')
      const to = child.getAttribute('to')
      const keyTimes = child.getAttribute('keyTimes')
      const frames: Keyframe[] = []
      if (values) {
        const vals = values.split(';').filter((v) => v !== '')
        const times = keyTimes ? keyTimes.split(';').map(Number).filter((v) => !Number.isNaN(v)) : vals.map((_, i) => i / Math.max(1, vals.length - 1))
        vals.forEach((v, i) => frames.push({ offset: times[i] ?? i / Math.max(1, vals.length - 1), value: convertValue(v) }))
      } else if (from !== null || to !== null) {
        frames.push({ offset: 0, value: convertValue(from ?? to ?? '') })
        frames.push({ offset: 1, value: convertValue(to ?? from ?? '') })
      }
      if (frames.length < 2) return
      const repeat = child.getAttribute('repeatCount')
      groups.push({
        id: `g${n++}`,
        name: `SMIL ${attribute}`,
        targetId: el.id,
        duration: dur,
        delay: begin,
        ease: 'linear',
        iterations: repeat === 'indefinite' ? 'infinite' : Math.max(1, parseInt(repeat || '1', 10) || 1),
        direction: 'normal',
        fillMode: (child.getAttribute('fill') as AnimGroup['fillMode']) || 'both',
        tracks: [{ id: `t${n++}`, property: attribute, keyframes: frames }],
        origin: 'smil',
        originPoint: parseTransformOrigin(style),
        enabled: true,
      })
    })
  }
  return mergeLayers(groups)
}

/**
 * 分层：把同名、同时长、同缓动、同关键帧、但目标不同的动画合并成一条「层」，
 * 用 stagger 描述逐个延迟。这样 7 个字的掉落只需要改一次。
 */
function mergeLayers(groups: AnimGroup[]): AnimGroup[] {
  const buckets = new Map<string, AnimGroup[]>()
  for (const g of groups) {
    if (!g.tracks.length) continue
    const key = [
      g.name,
      g.duration.toFixed(4),
      String(g.ease),
      String(g.iterations),
      g.direction,
      g.fillMode,
      g.origin,
      g.tracks
        .map((t) => `${t.property}[${t.keyframes.map((k) => `${k.offset}:${k.value}`).join(',')}]`)
        .join(';'),
    ].join('|')
    const list = buckets.get(key) || []
    list.push(g)
    buckets.set(key, list)
  }

  const merged: AnimGroup[] = []
  const used = new Set<string>()
  buckets.forEach((list) => {
    const distinct = new Set(list.map((g) => g.targetId))
    if (list.length < 2 || distinct.size !== list.length) return
    const sorted = [...list].sort((a, b) => a.delay - b.delay)
    const gaps: number[] = []
    for (let i = 1; i < sorted.length; i++) gaps.push(Math.max(0, sorted[i].delay - sorted[i - 1].delay))
    gaps.sort((a, b) => a - b)
    const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0
    const stagger = Math.round(median * 1000) / 1000
    const base = sorted[0]
    merged.push({
      ...base,
      id: base.id,
      name: base.name,
      targetId: base.targetId,
      targetIds: sorted.map((g) => g.targetId),
      stagger,
      delay: base.delay,
    })
    sorted.forEach((g) => used.add(g.id))
  })

  const rest = groups.filter((g) => !used.has(g.id))
  return [...merged, ...rest].sort((a, b) => a.delay - b.delay || a.name.localeCompare(b.name))
}

function defaultKeyValue(el: GfxEl, prop: string): string {
  if (prop === 'opacity') return el.style['opacity'] || '1'
  if (prop === 'transform') return 'none'
  if (prop === 'fill') return el.style['fill'] || '#000'
  if (prop === 'stroke') return el.style['stroke'] || 'none'
  if (prop === 'letter-spacing') return el.style['letter-spacing'] || '0'
  return ''
}
