import { Box, Ellipse, Group, Image, Path, Rect, Text, type IUI } from 'leafer-ui'
import type { Asset, StylePatch } from '../types'
import { pivotMatrix, parseCssTransform, parseSvgTransform, mul, translate, type Mat, IDENTITY } from './matrix'
import { parseColor, rgbaString } from './css'
import type { GfxEl, GradientDef, SvgDocument } from './svg-doc'

export interface BaseStyle {
  fill?: string | object
  stroke?: string | object
  strokeWidth: number
  opacity: number
  dashPattern?: number[]
  dashOffset?: number
  cornerRadius?: number
  width?: number
  height?: number
  fontSize?: number
  letterSpacing?: number
  text?: string
}

export interface ConvertedElement {
  el: GfxEl
  node: IUI
  /** 形状被包在 wrapper 里，动画只改 wrapper 的矩阵 */
  wrapper: Group
  baseMatrix: Mat
  overrideMatrix?: Mat
  baseStyle: BaseStyle
  originPoint: { x: number; y: number }
  /** 该元素在 SVG 用户坐标系里的包围盒（不含自身 transform） */
  bbox: { x: number; y: number; width: number; height: number }
  /** 布局内核算出的位移，叠加在 baseMatrix 之前（父坐标系） */
  layoutOffset?: { x: number; y: number }
  children: ConvertedElement[]
}

export interface ConvertedAsset {
  content: Group
  width: number
  height: number
  elements: Map<string, ConvertedElement>
  order: ConvertedElement[]
  unsupported: string[]
}

const SVG_LENGTH_RE = /^-?[\d.]+(px|em|ex|pt|pc|cm|mm|in|%)?$/

function len(value: string | undefined, percentBase = 0): number {
  if (!value) return 0
  const v = value.trim()
  if (v.endsWith('%')) return (parseFloat(v) / 100) * percentBase
  if (v.endsWith('em')) return (parseFloat(v) || 0) * (percentBase || 16)
  if (v.endsWith('rem')) return (parseFloat(v) || 0) * 16
  if (SVG_LENGTH_RE.test(v)) return parseFloat(v)
  return parseFloat(v) || 0
}

function normFamily(family?: string): string {
  if (!family) return 'PingFang SC, Microsoft YaHei, sans-serif'
  return family
    .split(',')
    .map((f) => {
      const t = f.trim().replace(/^["']|["']$/g, '')
      if (!t) return ''
      return /[\s]/.test(t) ? `"${t}"` : t
    })
    .filter(Boolean)
    .join(', ')
}

function mapFontWeight(w?: string): string | number {
  if (!w) return 'normal'
  if (w === 'bold') return 'bold'
  if (w === 'bolder') return 700
  if (w === 'lighter') return 300
  const n = parseInt(w, 10)
  return Number.isFinite(n) ? n : 'normal'
}

function solidColor(color: string, alpha = 1): string {
  const c = parseColor(color)
  c.a *= alpha
  return rgbaString(c)
}

/** 把 SVG 填充/描边转成 Leafer 的 fill/stroke */
function toPaint(
  value: string | undefined,
  opacity: number,
  doc: SvgDocument,
  bbox: { x: number; y: number; width: number; height: number },
  currentColor: string,
  warnings: string[]
): string | object | undefined {
  if (!value) return undefined
  const v = value.trim()
  if (!v || v === 'none') return undefined
  if (v === 'currentColor') return solidColor(currentColor, opacity)
  if (v.startsWith('url(')) {
    const id = v.replace(/url\(["']?#?|["']?\)/g, '').trim()
    const def = doc.gradients[id]
    if (!def) {
      if (!warnings.some((w) => w.includes(`#${id}`))) warnings.push(`渐变 #${id} 未找到，已跳过`)
      return undefined
    }
    return gradientToPaint(def, bbox, opacity)
  }
  if (v.startsWith('#')) return solidColor(v, opacity)
  if (/^(rgb|hsl)/.test(v)) return solidColor(v, opacity)
  if (/^[a-z]+$/i.test(v)) return solidColor(v, opacity)
  return v
}

function gradientToPaint(def: GradientDef, bbox: { x: number; y: number; width: number; height: number }, opacity: number) {
  const w = bbox.width || 1
  const h = bbox.height || 1
  const fx = def.units === 'objectBoundingBox' ? (v: number) => v : (v: number) => (v - bbox.x) / w
  const fy = def.units === 'objectBoundingBox' ? (v: number) => v : (v: number) => (v - bbox.y) / h
  const stops = def.stops.map((s) => {
    const c = parseColor(s.color)
    c.a *= s.opacity
    return { offset: s.offset, color: rgbaString(c) }
  })
  if (!stops.length) return undefined
  if (def.type === 'linear') {
    return {
      type: 'linear' as const,
      from: { type: 'percent', x: fx(def.x1), y: fy(def.y1) },
      to: { type: 'percent', x: fx(def.x2), y: fy(def.y2) },
      stops,
      opacity: opacity < 1 ? opacity : undefined,
    }
  }
  return {
    type: 'radial' as const,
    from: { type: 'percent', x: fx(def.cx), y: fy(def.cy) },
    to: { type: 'percent', x: fx(def.cx) + def.r * (def.units === 'objectBoundingBox' ? 1 : 1), y: fy(def.cy) },
    stops,
    opacity: opacity < 1 ? opacity : undefined,
  }
}

function pointsToPath(points: string, close: boolean): string {
  const nums = (points.match(/-?[\d.]+(?:e[-+]?\d+)?/gi) || []).map(Number)
  let d = ''
  for (let i = 0; i < nums.length; i += 2) {
    d += `${i === 0 ? 'M' : 'L'}${nums[i]} ${nums[i + 1] ?? 0} `
  }
  return close ? d + 'Z' : d
}

const BLEND: Record<string, string> = {
  normal: 'normal',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
}

export function convertSvg(doc: SvgDocument, asset: Asset): ConvertedAsset {
  const warnings: string[] = [...doc.warnings]
  const elements = new Map<string, ConvertedElement>()
  const order: ConvertedElement[] = []
  const content = new Group({ name: 'svg-root' })
  content.width = doc.width
  content.height = doc.height
  // SVG 的 viewBox 原点可能不是 0；width/height 也可能和 viewBox 尺寸不同，需要整体换算
  const [vx, vy, vw, vh] = doc.viewBox
  const sx = vw ? doc.width / vw : 1
  const sy = vh ? doc.height / vh : 1
  if (vx || vy || Math.abs(sx - 1) > 1e-6 || Math.abs(sy - 1) > 1e-6) {
    content.setTransform({ a: sx, b: 0, c: 0, d: sy, e: -vx * sx, f: -vy * sy } as any, false)
  }

  const measureCanvas = document.createElement('canvas')
  const mctx = measureCanvas.getContext('2d')

  const bboxOf = (el: GfxEl): { x: number; y: number; width: number; height: number } => {
    const s = el.style
    const t = el.tag
    if (t === 'rect') {
      const x = len(s['x'])
      const y = len(s['y'])
      return { x, y, width: len(s['width']), height: len(s['height']) }
    }
    if (t === 'circle') {
      const r = len(s['r'])
      return { x: len(s['cx']) - r, y: len(s['cy']) - r, width: r * 2, height: r * 2 }
    }
    if (t === 'ellipse') {
      const rx = len(s['rx'])
      const ry = len(s['ry'])
      return { x: len(s['cx']) - rx, y: len(s['cy']) - ry, width: rx * 2, height: ry * 2 }
    }
    if (t === 'line' || t === 'polyline' || t === 'polygon') {
      const raw = t === 'line' ? `${s['x1']},${s['y1']} ${s['x2']},${s['y2']}` : s['points'] || ''
      const nums = (raw.match(/-?[\d.]+(?:e[-+]?\d+)?/gi) || []).map(Number)
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 0; i < nums.length; i += 2) {
        xs.push(nums[i])
        ys.push(nums[i + 1] ?? 0)
      }
      if (!xs.length) return { x: 0, y: 0, width: 0, height: 0 }
      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minY = Math.min(...ys)
      const maxY = Math.max(...ys)
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    }
    if (t === 'text') {
      // 文本包围盒按字号估算，精确值由 Leafer 排版后回填
      const fontSize = len(s['font-size'], 16) || 16
      const text = (el.dom.textContent || '').trim()
      const family = normFamily(s['font-family'])
      const weight = mapFontWeight(s['font-weight'])
      const spacing = len(s['letter-spacing'], fontSize) || 0
      const chars = [...text].length
      let width = 0
      if (mctx) {
        mctx.font = `${weight} ${fontSize}px ${family}`
        width = mctx.measureText(text).width
      }
      width += spacing * Math.max(0, chars - 1)
      const anchor = s['text-anchor'] || 'start'
      const x = len(s['x']) - (anchor === 'middle' ? width / 2 : anchor === 'end' ? width : 0)
      const lineHeight = fontSize * 1.2
      const baseline = s['dominant-baseline'] || ''
      const baselineShift =
        baseline === 'middle' || baseline === 'central'
          ? -fontSize * 0.6
          : baseline === 'hanging' || baseline === 'text-before-edge'
          ? -fontSize * 0.2
          : 0
      return {
        x,
        y: len(s['y']) - lineHeight * 0.95 + baselineShift,
        width: Math.max(width, 1),
        height: lineHeight,
      }
    }
    if (t === 'image') {
      return { x: len(s['x']), y: len(s['y']), width: Math.max(1, len(s['width'])), height: Math.max(1, len(s['height'])) }
    }
    if (t === 'path') {
      // 用临时 Path 让 Leafer 计算 path 包围盒
      const tmp = new Path({ path: s['d'] || '' })
      const b = tmp.getBounds('box', 'local')
      return { x: b.x, y: b.y, width: Math.max(b.width, 1), height: Math.max(b.height, 1) }
    }
    return { x: 0, y: 0, width: 1, height: 1 }
  }

  const build = (el: GfxEl, parent: IUI): ConvertedElement | null => {
    const style = el.style
    const ownTransform: Mat = style['transform'] ? parseSvgTransform(style['transform']) : { ...IDENTITY }
    const opacity = clamp01(parseFloat(style['opacity'] ?? '1'))
    const blend = style['mix-blend-mode'] ? BLEND[style['mix-blend-mode'].trim()] : undefined
    const currentColor = style['color'] || '#000000'

    if (el.tag === 'g' || el.kind === 'group') {
      const group = new Group({ name: `svg:${el.id}` })
      group.opacity = opacity
      if (blend) (group as any).blendMode = blend
      group.setTransform(ownTransform as any, false)
      parent.add(group)
      const converted: ConvertedElement = {
        el,
        node: group,
        wrapper: group,
        baseMatrix: ownTransform,
        baseStyle: { strokeWidth: 0, opacity },
        originPoint: { x: 0.5, y: 0.5 },
        bbox: { x: 0, y: 0, width: doc.width, height: doc.height },
        children: [],
      }
      elements.set(el.id, converted)
      order.push(converted)
      el.children.forEach((child) => {
        const c = build(child, group)
        if (c) converted.children.push(c)
      })
      return converted
    }

    const bbox = bboxOf(el)
    const isText = el.tag === 'text'
    const fontSize = isText ? len(style['font-size'], 16) || 16 : undefined
    const strokeWidth = len(style['stroke-width'], 1) || 0
    const fillOpacity = clamp01(parseFloat(style['fill-opacity'] ?? '1'))
    const strokeOpacity = clamp01(parseFloat(style['stroke-opacity'] ?? '1'))

    const fill = toPaint(style['fill'], fillOpacity, doc, bbox, currentColor, warnings)
    const stroke = toPaint(style['stroke'], strokeOpacity, doc, bbox, currentColor, warnings)
    const dashPattern = style['stroke-dasharray']
      ? (style['stroke-dasharray'].match(/[\d.]+/g) || []).map(Number)
      : undefined

    const wrapper = new Group({ name: `svgw:${el.id}` })
    parent.add(wrapper)

    let node: IUI
    if (isText) {
      const rawText = collectText(el.dom)
      const family = normFamily(style['font-family'])
      const weight = mapFontWeight(style['font-weight'])
      const letterSpacing = len(style['letter-spacing'], fontSize!) || 0
      const anchor = style['text-anchor'] || 'start'
      const lineHeight = fontSize! * 1.2
      const textNode = new Text({
        x: bbox.x,
        y: bbox.y,
        text: rawText,
        fontFamily: family,
        fontSize,
        fontWeight: weight,
        italic: style['font-style'] === 'italic',
        letterSpacing,
        lineHeight,
        fill: fill as any,
        opacity: 1,
        textAlign: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left',
        textWrap: 'none',
        width: Math.max(bbox.width, 1),
      } as any)
      node = textNode
    } else if (el.tag === 'image') {
      const href = el.dom.getAttribute('href') || el.dom.getAttribute('xlink:href') || ''
      node = new Image({ x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height, url: href } as any)
    } else {
      let shape: IUI
      switch (el.tag) {
        case 'rect': {
          const rx = len(style['rx'], bbox.width / 2)
          const ry = len(style['ry'], bbox.height / 2)
          shape = new Rect({
            x: bbox.x,
            y: bbox.y,
            width: bbox.width,
            height: bbox.height,
            cornerRadius: Math.min(rx, ry) || 0,
          } as any)
          break
        }
        case 'circle':
        case 'ellipse':
          shape = new Ellipse({ x: bbox.x, y: bbox.y, width: bbox.width, height: bbox.height } as any)
          break
        case 'line':
          shape = new Path({ path: `M${len(style['x1'])} ${len(style['y1'])} L${len(style['x2'])} ${len(style['y2'])}`, fill: undefined } as any)
          break
        case 'polyline':
          shape = new Path({ path: pointsToPath(style['points'] || '', false) } as any)
          break
        case 'polygon':
          shape = new Path({ path: pointsToPath(style['points'] || '', true) } as any)
          break
        case 'path':
          shape = new Path({ path: style['d'] || '' } as any)
          break
        default:
          warnings.push(`未支持的标签 <${el.tag}>`)
          wrapper.remove()
          return null
      }
      node = shape
      node.fill = fill as any
      node.stroke = stroke as any
      if (stroke) {
        ;(node as any).strokeWidth = strokeWidth
        ;(node as any).strokeAlign = 'center'
        if (dashPattern && dashPattern.length) (node as any).dashPattern = dashPattern
        if (style['stroke-dashoffset']) (node as any).dashOffset = len(style['stroke-dashoffset'])
        const cap = style['stroke-linecap']
        if (cap === 'round' || cap === 'square') (node as any).strokeCap = cap
        const join = style['stroke-linejoin']
        if (join === 'round' || join === 'bevel') (node as any).strokeJoin = join
      }
    }

    ;(node as any).opacity = opacity
    if (blend) (node as any).blendMode = blend
    node.name = `svg:${el.id}`

    // 滤镜 → 模糊
    if (style['filter']) {
      const id = style['filter'].replace(/url\(["']?#?|["']?\)/g, '').trim()
      const def = doc.filters[id]
      if (def?.blur) (node as any).blur = def.blur
      if (def?.unsupported?.length) warnings.push(`滤镜 #${id} 含 ${def.unsupported.join('/')}，已降级为模糊`)
    }

    wrapper.add(node)

    // 元素自身 transform 作用在 wrapper 上
    if (!isTransformIdentity(ownTransform)) wrapper.setTransform(ownTransform as any, false)

    const converted: ConvertedElement = {
      el,
      node,
      wrapper,
      baseMatrix: ownTransform,
      baseStyle: {
        fill: fill as any,
        stroke: stroke as any,
        strokeWidth,
        opacity,
        dashPattern,
        dashOffset: style['stroke-dashoffset'] ? len(style['stroke-dashoffset']) : undefined,
        cornerRadius: el.tag === 'rect' ? Math.min(len(style['rx'], bbox.width / 2), len(style['ry'], bbox.height / 2)) || 0 : undefined,
        fontSize,
        width: node.width ?? bbox.width,
        height: node.height ?? bbox.height,
        letterSpacing: isText ? len(style['letter-spacing'], fontSize!) || 0 : undefined,
        text: isText ? collectText(el.dom) : undefined,
      },
      originPoint: { x: 0.5, y: 0.5 },
      bbox,
      children: [],
    }
    elements.set(el.id, converted)
    order.push(converted)

    // 子元素（text 的 tspan 不再单独渲染）
    if (!isText) {
      el.children.forEach((child) => {
        if (child.kind === 'other') return
        const c = build(child, wrapper)
        if (c) converted.children.push(c)
      })
    }
    return converted
  }

  doc.root.children.forEach((child) => {
    build(child, content)
  })

  applyOverrides(elements, asset)

  return {
    content,
    width: doc.width,
    height: doc.height,
    elements,
    order,
    unsupported: Array.from(new Set(warnings)),
  }
}

/** 元素的基础矩阵 = 布局位移 × 自身 transform */
export function elementBaseMatrix(el: ConvertedElement): Mat {
  const base = el.overrideMatrix ?? el.baseMatrix
  const o = el.layoutOffset
  if (!o || (!o.x && !o.y)) return base
  return mul(translate(o.x, o.y), base)
}

function collectText(dom: Element): string {
  return (dom.textContent || '').replace(/\s+/g, ' ').trim()
}

function isTransformIdentity(m: Mat) {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0
}

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 1
  return Math.min(1, Math.max(0, v))
}

/** 应用持久化的样式覆盖 */
export function applyOverrides(elements: Map<string, ConvertedElement>, asset: Asset) {
  Object.entries(asset.overrides || {}).forEach(([elId, patch]) => {
    const el = elements.get(elId)
    if (!el) return
    applyPatch(el, patch, true)
  })
}

export function applyPatch(converted: ConvertedElement, patch: StylePatch, silent = false) {
  const node = converted.node as any
  if (patch.fill !== undefined) {
    node.fill = patch.fill === 'none' ? undefined : patch.fill
    converted.baseStyle.fill = node.fill
  }
  if (patch.stroke !== undefined) {
    node.stroke = patch.stroke === 'none' ? undefined : patch.stroke
    converted.baseStyle.stroke = node.stroke
  }
  if (patch.strokeWidth !== undefined) {
    node.strokeWidth = patch.strokeWidth
    converted.baseStyle.strokeWidth = patch.strokeWidth
  }
  if (patch.opacity !== undefined) {
    node.opacity = patch.opacity
    converted.baseStyle.opacity = patch.opacity
  }
  if (patch.cornerRadius !== undefined && node.cornerRadius !== undefined) node.cornerRadius = patch.cornerRadius
  if (patch.fontSize !== undefined) {
    node.fontSize = patch.fontSize
    converted.baseStyle.fontSize = patch.fontSize
  }
  if (patch.letterSpacing !== undefined) {
    node.letterSpacing = patch.letterSpacing
    converted.baseStyle.letterSpacing = patch.letterSpacing
  }
  if (patch.width !== undefined) {
    node.width = patch.width
    converted.baseStyle.width = patch.width
  }
  if (patch.height !== undefined) {
    node.height = patch.height
    converted.baseStyle.height = patch.height
  }
  if (patch.text !== undefined) node.text = patch.text
  if (patch.rotation !== undefined || patch.scale !== undefined || patch.x !== undefined || patch.y !== undefined) {
    let m = converted.baseMatrix
    if (patch.x !== undefined || patch.y !== undefined) {
      const dx = patch.x === undefined ? 0 : patch.x - converted.bbox.x
      const dy = patch.y === undefined ? 0 : patch.y - converted.bbox.y
      m = mul(translate(dx, dy), m)
    }
    if (patch.rotation !== undefined || patch.scale !== undefined) {
      const cx = converted.bbox.x + converted.bbox.width / 2
      const cy = converted.bbox.y + converted.bbox.height / 2
      m = mul(m, pivotMatrix(parseCssTransform(`rotate(${patch.rotation ?? 0}deg) scale(${patch.scale ?? 1})`), cx, cy))
    }
    converted.overrideMatrix = m
    converted.wrapper.setTransform(elementBaseMatrix(converted) as any, false)
  }
}
