import gsap from 'gsap'
import type { AnimGroup, Asset, PropTrack } from '../types'
import { mixColor, parseColor, rgbaString, type RGBA } from './css'
import { mul, pivotMatrix, translate, rotate, scale, skewX, skewY, type Mat } from './matrix'
import { elementBaseMatrix, type ConvertedAsset, type ConvertedElement } from './convert'

/* --------------------------------- easing -------------------------------- */

const CUBIC_KEYWORDS: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
  linear: [0, 0, 1, 1],
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const A = (a: number, b: number) => 1 - 3 * b + 3 * a
  const B = (a: number, b: number) => 3 * b - 6 * a
  const C = (a: number) => 3 * a
  const calc = (t: number, a: number, b: number) => ((A(a, b) * t + B(a, b)) * t + C(a)) * t
  const slope = (t: number, a: number, b: number) => 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a)
  return (p: number) => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    let t = p
    for (let i = 0; i < 8; i++) {
      const x = calc(t, x1, x2) - p
      if (Math.abs(x) < 1e-5) break
      const d = slope(t, x1, x2)
      if (Math.abs(d) < 1e-6) break
      t -= x / d
    }
    return calc(t, y1, y2)
  }
}

const easeCache = new Map<string, (p: number) => number>()

export function resolveEase(ease: string): (p: number) => number {
  const key = (ease || 'ease').trim()
  if (easeCache.has(key)) return easeCache.get(key)!

  let fn: (p: number) => number
  const cubic = key.match(/cubic-bezier\(([^)]+)\)/)
  const steps = key.match(/steps\(\s*(\d+)\s*(?:,\s*([a-z-]+))?\s*\)/)
  if (CUBIC_KEYWORDS[key]) {
    const [a, b, c, d] = CUBIC_KEYWORDS[key]
    fn = cubicBezier(a, b, c, d)
  } else if (cubic) {
    const n = cubic[1].split(',').map(Number)
    fn = cubicBezier(n[0] ?? 0.25, n[1] ?? 0.1, n[2] ?? 0.25, n[3] ?? 1)
  } else if (steps) {
    const count = parseInt(steps[1], 10) || 1
    const pos = steps[2] || 'end'
    fn = (p: number) => {
      const clamped = Math.min(1, Math.max(0, p))
      if (pos === 'start' || pos === 'jump-start') return Math.min(1, Math.floor(clamped * count) / count)
      return Math.min(1, Math.ceil(clamped * count) / count)
    }
  } else {
    const parsed = gsap.parseEase(key)
    fn = parsed || ((p: number) => p)
  }
  easeCache.set(key, fn)
  return fn
}

/* ------------------------------- transform ------------------------------- */

interface TransformFn {
  fn: string
  args: { value: number; pct: boolean }[]
}

function parseTransformFns(value: string): TransformFn[] {
  const out: TransformFn[] = []
  if (!value || value === 'none') return [{ fn: 'translate', args: [{ value: 0, pct: false }, { value: 0, pct: false }] }]
  const re = /([a-zA-Z0-9]+)\s*\(([^)]*)\)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(value))) {
    const fn = m[1].toLowerCase()
    const args = m[2]
      .split(/[,\s]+/)
      .filter(Boolean)
      .map((v) => ({ value: parseFloat(v) || 0, pct: v.endsWith('%') }))
    out.push({ fn, args })
  }
  if (!out.length) return [{ fn: 'translate', args: [{ value: 0, pct: false }, { value: 0, pct: false }] }]
  return out
}

function fnsToMatrix(fns: TransformFn[], w: number, h: number): Mat {
  let m: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
  const at = (fn: TransformFn, i: number): number => {
    const arg = fn.args[i]
    if (!arg) return i === 0 ? 1 : 0
    if (!arg.pct) return arg.value
    const axis = fn.fn.endsWith('y') ? h : w
    return (arg.value / 100) * axis
  }
  for (const fn of fns) {
    switch (fn.fn) {
      case 'translate':
        m = mul(m, translate(at(fn, 0), fn.args[1] ? at(fn, 1) : 0))
        break
      case 'translatex':
        m = mul(m, translate(at(fn, 0), 0))
        break
      case 'translatey':
        m = mul(m, translate(0, at(fn, 0)))
        break
      case 'translate3d':
        m = mul(m, translate(at(fn, 0), at(fn, 1)))
        break
      case 'scale': {
        const sx = at(fn, 0)
        const sy = fn.args[1] !== undefined ? at(fn, 1) : sx
        m = mul(m, scale(sx, sy))
        break
      }
      case 'scalex':
        m = mul(m, scale(at(fn, 0), 1))
        break
      case 'scaley':
        m = mul(m, scale(1, at(fn, 0)))
        break
      case 'rotate':
      case 'rotatez':
        m = mul(m, rotate(fn.args[0]?.value || 0))
        break
      case 'skewx':
        m = mul(m, skewX(fn.args[0]?.value || 0))
        break
      case 'skewy':
        m = mul(m, skewY(fn.args[0]?.value || 0))
        break
      case 'matrix': {
        const v = fn.args.map((a) => a.value)
        if (v.length >= 6) m = mul(m, { a: v[0], b: v[1], c: v[2], d: v[3], e: v[4], f: v[5] })
        break
      }
    }
  }
  return m
}

function interpolateFns(a: TransformFn[], b: TransformFn[], p: number, w: number, h: number): Mat {
  const sameShape = a.length === b.length && a.every((v, i) => v.fn === b[i].fn && v.args.length === b[i].args.length)
  if (sameShape) {
    const out: TransformFn[] = a.map((f, i) => ({
      fn: f.fn,
      args: f.args.map((arg, j) => {
        const bv = b[i].args[j]
        const axis = f.fn.endsWith('y') ? h : w
        const av = arg.pct ? (arg.value / 100) * axis : arg.value
        const bb = bv.pct ? (bv.value / 100) * axis : bv.value
        return { value: av + (bb - av) * p, pct: false }
      }),
    }))
    return fnsToMatrix(out, w, h)
  }
  const ma = fnsToMatrix(a, w, h)
  const mb = fnsToMatrix(b, w, h)
  return lerpMatrix(ma, mb, p)
}

function decompose(m: Mat) {
  const sx = Math.hypot(m.a, m.b)
  const rot = Math.atan2(m.b, m.a)
  const denom = sx || 1
  const skew = (m.a * m.c + m.b * m.d) / (denom * denom)
  const sy = Math.hypot(m.c - m.a * skew, m.d - m.b * skew) || 1
  return { tx: m.e, ty: m.f, rot, sx, sy, skew }
}

function recompose(d: ReturnType<typeof decompose>): Mat {
  const cos = Math.cos(d.rot)
  const sin = Math.sin(d.rot)
  return {
    a: cos * d.sx,
    b: sin * d.sx,
    c: (cos * d.skew - sin) * d.sy,
    d: (sin * d.skew + cos) * d.sy,
    e: d.tx,
    f: d.ty,
  }
}

function lerpMatrix(a: Mat, b: Mat, p: number): Mat {
  const da = decompose(a)
  const db = decompose(b)
  let rot = da.rot + (db.rot - da.rot) * p
  if (db.rot - da.rot > Math.PI) rot = da.rot + ((db.rot - da.rot - Math.PI * 2) * p)
  if (db.rot - da.rot < -Math.PI) rot = da.rot + ((db.rot - da.rot + Math.PI * 2) * p)
  return recompose({
    tx: da.tx + (db.tx - da.tx) * p,
    ty: da.ty + (db.ty - da.ty) * p,
    rot,
    sx: da.sx + (db.sx - da.sx) * p,
    sy: da.sy + (db.sy - da.sy) * p,
    skew: da.skew + (db.skew - da.skew) * p,
  })
}

/* ------------------------------ value model ------------------------------ */

type ValueKind = 'number' | 'color' | 'transform' | 'keyword'

interface BoundKey {
  offset: number
  kind: ValueKind
  raw: string
  num?: number
  color?: RGBA
  fns?: TransformFn[]
}

interface BoundTrack {
  property: string
  keys: BoundKey[]
  unitScale: number
}

interface BoundGroup {
  group: AnimGroup
  element: ConvertedElement
  tracks: BoundTrack[]
  ease: (p: number) => number
  /** 该目标自己的开始时间（层 + stagger） */
  delay: number
}

function parseNumeric(raw: string, fontSize: number): number {
  const v = (raw || '').trim()
  if (!v) return 0
  const num = parseFloat(v)
  if (!Number.isFinite(num)) return 0
  if (v.endsWith('em')) return num * fontSize
  if (v.endsWith('%')) return num
  return num
}

function propKind(prop: string): ValueKind {
  if (prop === 'transform') return 'transform'
  if (prop === 'fill' || prop === 'stroke' || prop === 'color') return 'color'
  if (prop === 'visibility' || prop === 'display') return 'keyword'
  return 'number'
}

export class AssetPlayer {
  asset: Asset
  converted: ConvertedAsset
  groups: BoundGroup[] = []
  time = 0
  duration = 1
  playing = false
  loop = true
  speed = 1
  onTime?: (t: number, d: number) => void
  onEnd?: () => void
  private cache = new Map<string, string>()

  constructor(converted: ConvertedAsset, asset: Asset) {
    this.converted = converted
    this.asset = asset
    this.rebuild()
  }

  rebuild() {
    const converted = this.converted
    this.groups = []
    let duration = 0
    const groups = this.asset.groups || []
    groups.forEach((group) => {
      if (group.enabled === false) return
      const targets = group.targetIds?.length ? group.targetIds : [group.targetId]
      const stagger = Math.max(0, group.stagger || 0)
      const iterations = group.iterations === 'infinite' ? Infinity : Math.max(1, group.iterations || 1)
      targets.forEach((targetId, index) => {
        const element = converted.elements.get(targetId)
        if (!element) return
        const fontSize = element.baseStyle.fontSize || 16
        const tracks: BoundTrack[] = group.tracks.map((track) => this.bindTrack(track, fontSize))
        if (!tracks.length) return
        const delay = group.delay + index * stagger
        const groupEnd = delay + group.duration * iterations
        if (Number.isFinite(groupEnd)) duration = Math.max(duration, groupEnd)
        this.groups.push({ group, element, tracks, ease: resolveEase(group.ease), delay })
      })
    })
    if (!Number.isFinite(duration) || duration <= 0) {
      // 全是无限循环：用最长单次时长作为时间轴的显示长度
      duration = Math.max(1, ...groups.map((g) => g.delay + g.duration))
    }
    this.duration = duration
    this.time = Math.min(this.time, duration)
    this.reset()
  }

  private bindTrack(track: PropTrack, fontSize: number): BoundTrack {
    const kind = propKind(track.property)
    const keys: BoundKey[] = track.keyframes
      .map((k) => {
        const raw = k.value
        const bound: BoundKey = { offset: k.offset, kind, raw: raw ?? '' }
        if (kind === 'number') bound.num = parseNumeric(raw, fontSize)
        else if (kind === 'color') bound.color = parseColor(raw)
        else if (kind === 'transform') bound.fns = parseTransformFns(raw)
        return bound
      })
      .sort((a, b) => a.offset - b.offset)
    return { property: track.property, keys, unitScale: fontSize }
  }

  private sample(track: BoundTrack, key: BoundKey): number {
    return key.num ?? 0
  }

  /** 计算某个属性在给定进度下的值 */
  private valueAt(track: BoundTrack, p: number, el: ConvertedElement): number | RGBA | Mat | string {
    const keys = track.keys
    if (!keys.length) return 0
    if (p <= keys[0].offset) return this.keyValue(keys[0], el)
    if (p >= keys[keys.length - 1].offset) return this.keyValue(keys[keys.length - 1], el)
    let i = 0
    while (i < keys.length - 1 && keys[i + 1].offset < p) i++
    const a = keys[i]
    const b = keys[i + 1]
    const span = b.offset - a.offset || 1
    const local = Math.min(1, Math.max(0, (p - a.offset) / span))
    if (a.kind === 'transform' && a.fns && b.fns) {
      return interpolateFns(a.fns, b.fns, local, el.bbox.width, el.bbox.height)
    }
    if (a.kind === 'color' && a.color && b.color) {
      return mixColor(a.color, b.color, local)
    }
    if (a.kind === 'keyword') {
      return local < 1 ? (a.raw === 'visible' || a.raw === 'inline' ? 1 : 0) : b.raw === 'visible' || b.raw === 'inline' ? 1 : 0
    }
    const av = this.sample(track, a)
    const bv = this.sample(track, b)
    return av + (bv - av) * local
  }

  private keyValue(key: BoundKey, el: ConvertedElement): number | RGBA | Mat | string {
    if (key.kind === 'transform' && key.fns) return fnsToMatrix(key.fns, el.bbox.width, el.bbox.height)
    if (key.kind === 'color' && key.color) return key.color
    if (key.kind === 'keyword') return key.raw === 'visible' || key.raw === 'inline' ? 1 : 0
    return key.num ?? 0
  }

  /** 把时间落到所有元素上：同一元素上多条动画时，活动轨道优先于未活动轨道的基准值 */
  render(time: number) {
    this.time = time
    const map = new Map<ConvertedElement, Map<string, { active: boolean; value: any }>>()
    for (const bound of this.groups) {
      const { element, ease } = bound
      const state = this.stateAt(bound, time)
      const p = state ? ease(state.progress) : 0
      let per = map.get(element)
      if (!per) {
        per = new Map()
        map.set(element, per)
      }
      for (const track of bound.tracks) {
        const existing = per.get(track.property)
        if (state) {
          per.set(track.property, { active: true, value: this.valueAt(track, p, element) })
        } else if (!existing || !existing.active) {
          per.set(track.property, { active: false, value: this.baseValue(track.property, element) })
        }
      }
    }
    map.forEach((per, element) => {
      per.forEach((entry, prop) => this.applyValue(prop, entry.value, element, entry.active))
    })
  }

  private baseValue(prop: string, el: ConvertedElement): any {
    const b = el.baseStyle
    switch (prop) {
      case 'opacity':
        return b.opacity
      case 'transform':
        return null
      case 'letter-spacing':
        return b.letterSpacing ?? 0
      case 'font-size':
        return b.fontSize ?? 16
      case 'width':
        return b.width ?? el.bbox.width
      case 'height':
        return b.height ?? el.bbox.height
      case 'stroke-width':
        return b.strokeWidth ?? 1
      case 'fill':
      case 'stroke':
        return (b as any)[prop]
      default:
        return undefined
    }
  }

  private changed(prop: string, el: ConvertedElement, signature: string): boolean {
    const key = `${el.el.id}|${prop}`
    if (this.cache.get(key) === signature) return false
    this.cache.set(key, signature)
    return true
  }

  private applyValue(prop: string, value: any, el: ConvertedElement, active: boolean) {
    const node = el.node as any
    switch (prop) {
      case 'transform': {
        if (!active) {
          const base = elementBaseMatrix(el)
          const sig = `m${base.a},${base.b},${base.c},${base.d},${base.e},${base.f}`
          if (this.changed('transform', el, sig)) el.wrapper.setTransform(base as any, false)
          break
        }
        const m: Mat = value as Mat
        const pivot = {
          x: el.bbox.x + el.originPoint.x * el.bbox.width,
          y: el.bbox.y + el.originPoint.y * el.bbox.height,
        }
        const composed = mul(elementBaseMatrix(el), pivotMatrix(m, pivot.x, pivot.y))
        const sig = `m${composed.a.toFixed(4)},${composed.b.toFixed(4)},${composed.c.toFixed(4)},${composed.d.toFixed(4)},${composed.e.toFixed(2)},${composed.f.toFixed(2)}`
        if (this.changed('transform', el, sig)) el.wrapper.setTransform(composed as any, false)
        break
      }
      case 'opacity': {
        const next = clamp01(Number(value))
        if (this.changed(prop, el, String(next))) node.opacity = next
        break
      }
      case 'letter-spacing': {
        const next = Number(value)
        if (this.changed(prop, el, String(next))) node.letterSpacing = next
        break
      }
      case 'font-size': {
        const next = Math.max(1, Number(value))
        if (this.changed(prop, el, String(next))) node.fontSize = next
        break
      }
      case 'stroke-width': {
        const next = Math.max(0, Number(value))
        if (this.changed(prop, el, String(next))) node.strokeWidth = next
        break
      }
      case 'stroke-dashoffset': {
        const next = Number(value)
        if (this.changed(prop, el, String(next))) node.dashOffset = next
        break
      }
      case 'fill':
      case 'stroke': {
        const str = typeof value === 'string' ? value : value && 'r' in (value as any) ? rgbaString(value as RGBA) : ''
        if (str && this.changed(prop, el, str)) node[prop] = str
        break
      }
      case 'visibility': {
        const next = Number(value) > 0.5
        if (this.changed(prop, el, String(next))) node.visible = next
        break
      }
      case 'width':
      case 'height': {
        const next = Math.max(1, Number(value))
        if (this.changed(prop, el, String(next))) node[prop] = next
        break
      }
    }
  }

  private stateAt(bound: BoundGroup, time: number) {
    const group = bound.group
    const d = Math.max(0.001, group.duration)
    let t = time - bound.delay
    if (t < 0) {
      if (group.fillMode === 'backwards' || group.fillMode === 'both') return { progress: 0 }
      return null
    }
    const iterations = group.iterations === 'infinite' ? Infinity : Math.max(1, group.iterations || 1)
    let index = Math.floor(t / d)
    let local = t - index * d
    if (iterations !== Infinity && index >= iterations) {
      if (group.fillMode === 'forwards' || group.fillMode === 'both') {
        index = iterations - 1
        local = d
      } else {
        return null
      }
    }
    let progress = Math.min(1, Math.max(0, local / d))
    const dir = group.direction
    if (dir === 'reverse' || (dir === 'alternate' && index % 2 === 1) || (dir === 'alternate-reverse' && index % 2 === 0)) {
      progress = 1 - progress
    }
    return { progress }
  }

  /** 布局 / 样式变化后清掉值缓存，让下一帧重新写入 */
  invalidate() {
    this.cache.clear()
  }

  reset() {
    this.groups.forEach(({ element, tracks }) => {
      tracks.forEach((t) => {
        const base = this.baseValue(t.property, element)
        if (t.property === 'transform') {
          element.wrapper.setTransform(elementBaseMatrix(element) as any, false)
        } else if (base !== undefined) {
          this.applyValue(t.property, base, element, false)
        }
      })
    })
  }

  seek(time: number) {
    this.time = Math.min(this.duration, Math.max(0, time))
    this.render(this.time)
    this.onTime?.(this.time, this.duration)
  }

  get lastFrameTime() {
    // 取结束边界前的画面，避免 fill-mode: none 恢复初始样式。
    return this.duration - Math.min(0.000001, this.duration / 2)
  }

  play() {
    if (this.playing) return
    if (this.time >= this.lastFrameTime) this.seek(0)
    this.playing = true
  }

  pause() {
    this.playing = false
  }

  tick(dt: number) {
    if (!this.playing) return
    let t = this.time + dt * this.speed
    if (t >= this.duration) {
      if (this.loop) {
        t = this.duration > 0 ? t % this.duration : 0
      } else {
        t = this.lastFrameTime
        this.playing = false
        this.onEnd?.()
      }
    }
    this.render(t)
    this.onTime?.(t, this.duration)
  }
}

function clamp01(v: number) {
  if (!Number.isFinite(v)) return 1
  return Math.min(1, Math.max(0, v))
}
