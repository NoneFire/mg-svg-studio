/**
 * 轻量 CSS 引擎：只覆盖 SVG 素材里真实出现的语法
 * - 简单选择器：tag / #id / .class / tag.class / 后代 / 子代 / *
 * - 声明块、!important（按普通优先级处理，最后覆盖）
 * - @keyframes（百分比与 from/to）
 * - var() / calc() 的时间表达式（MG 素材常用 --d / --t 做逐个延迟）
 */
export interface Compound {
  tag?: string
  id?: string
  classes: string[]
  attrs: { name: string; value?: string }[]
  universal?: boolean
  notTag?: string
}

export interface SelectorPart {
  combinator: ' ' | '>' | ''
  compound: Compound
}

export interface ParsedSelector {
  source: string
  specificity: number
  parts: SelectorPart[]
}

export interface CssRule {
  selectors: ParsedSelector[]
  decls: Record<string, string>
  order: number
}

export interface CssKeyframes {
  name: string
  frames: { offset: number; decls: Record<string, string> }[]
}

export interface Stylesheet {
  rules: CssRule[]
  keyframes: Record<string, CssKeyframes>
}

const TIMING_RE = /^([\d.]+)(ms|s)$/

export function parseTime(value?: string): number | null {
  if (!value) return null
  const v = value.trim()
  const m = v.match(TIMING_RE)
  if (m) {
    const n = parseFloat(m[1])
    return m[2] === 'ms' ? n / 1000 : n
  }
  return null
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** 把规则体切成 selector { ... } 和 @keyframes name { ... } */
export function parseStylesheet(cssText: string): Stylesheet {
  const css = stripComments(cssText || '')
  const rules: CssRule[] = []
  const keyframes: Record<string, CssKeyframes> = {}
  let order = 0
  let i = 0

  while (i < css.length) {
    const brace = css.indexOf('{', i)
    if (brace < 0) break
    const header = css.slice(i, brace).trim()
    // 找到匹配的右括号
    let depth = 1
    let j = brace + 1
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth++
      else if (css[j] === '}') depth--
      j++
    }
    const body = css.slice(brace + 1, j - 1)
    i = j

    if (!header) continue
    if (header.startsWith('@keyframes') || header.startsWith('@-webkit-keyframes')) {
      const name = header.replace(/@(-webkit-)?keyframes/, '').trim()
      keyframes[name] = { name, frames: parseKeyframeBody(body) }
      continue
    }
    if (header.startsWith('@')) {
      // @media / @supports：直接展开内部规则，忽略条件
      if (header.startsWith('@media') || header.startsWith('@supports')) {
        const inner = parseStylesheet(body)
        inner.rules.forEach((r) => {
          r.order = order++
          rules.push(r)
        })
      }
      continue
    }

    const selectors = splitSelectors(header)
      .map((s) => parseSelector(s))
      .filter(Boolean) as ParsedSelector[]
    if (!selectors.length) continue
    rules.push({ selectors, decls: parseDecls(body), order: order++ })
  }

  return { rules, keyframes }
}

export function parseDecls(body: string): Record<string, string> {
  const out: Record<string, string> = {}
  body.split(';').forEach((chunk) => {
    const idx = chunk.indexOf(':')
    if (idx < 0) return
    const key = chunk.slice(0, idx).trim().toLowerCase()
    const value = chunk
      .slice(idx + 1)
      .replace(/!important/i, '')
      .trim()
    if (key) out[key] = value
  })
  return out
}

function splitSelectors(header: string): string[] {
  return header
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parseKeyframeBody(body: string) {
  const frames: { offset: number; decls: Record<string, string> }[] = []
  let i = 0
  while (i < body.length) {
    const brace = body.indexOf('{', i)
    if (brace < 0) break
    const header = body.slice(i, brace).trim()
    let depth = 1
    let j = brace + 1
    while (j < body.length && depth > 0) {
      if (body[j] === '{') depth++
      else if (body[j] === '}') depth--
      j++
    }
    const content = body.slice(brace + 1, j - 1)
    i = j
    if (!header) continue
    header.split(',').forEach((part) => {
      const p = part.trim()
      if (!p) return
      let offset = 0
      if (p === 'from') offset = 0
      else if (p === 'to') offset = 1
      else offset = parseFloat(p) / 100
      if (Number.isNaN(offset)) return
      frames.push({ offset, decls: parseDecls(content) })
    })
  }
  frames.sort((a, b) => a.offset - b.offset)
  return frames
}

function parseCompound(text: string): Compound {
  const compound: Compound = { classes: [], attrs: [] }
  const re = /(\*)|([a-zA-Z][\w-]*)|#([\w-]+)|\.([\w-]+)|\[([^\]]+)\]|:[:a-zA-Z-]+(\([^)]*\))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m[1]) compound.universal = true
    else if (m[2]) compound.tag = m[2].toLowerCase()
    else if (m[3]) compound.id = m[3]
    else if (m[4]) compound.classes.push(m[4])
    else if (m[5]) {
      const [name, ...rest] = m[5].split('=')
      compound.attrs.push({ name: name.trim(), value: rest.join('=').replace(/["']/g, '').trim() || undefined })
    } else if (m[0]) {
      // pseudo-class：只支持 :not(tag) 的粗略匹配，其它忽略
      const not = m[0].match(/^:not\(([\w-]+)\)$/)
      if (not) compound.notTag = not[1]
    }
  }
  return compound
}

export function parseSelector(text: string): ParsedSelector | null {
  const src = text.trim()
  if (!src) return null
  const parts: SelectorPart[] = []
  let buf = ''
  let combinator: ' ' | '>' | '' = ''
  const flush = (comb: ' ' | '>' | '') => {
    const t = buf.trim()
    if (t) parts.push({ combinator: parts.length ? comb || ' ' : '', compound: parseCompound(t) })
    buf = ''
  }
  for (const ch of src) {
    if (ch === '>') {
      flush('>')
      combinator = '>'
    } else if (ch === '~' || ch === '+') {
      // 兄弟选择器作为后代近似
      flush(' ')
      combinator = ' '
    } else if (/\s/.test(ch)) {
      flush(combinator || ' ')
      combinator = ' '
    } else {
      buf += ch
    }
  }
  flush(combinator || ' ')
  if (!parts.length) return null
  let spec = 0
  parts.forEach((p) => {
    const c = p.compound
    spec += (c.id ? 100 : 0) + c.classes.length * 10 + (c.tag ? 1 : 0)
  })
  return { source: src, specificity: spec, parts }
}

function matchCompound(el: Element, c: Compound): boolean {
  if (c.universal) return true
  if (c.tag && el.tagName.toLowerCase() !== c.tag) return false
  if (c.notTag && el.tagName.toLowerCase() === c.notTag) return false
  if (c.id && el.getAttribute('id') !== c.id) return false
  if (c.classes.length) {
    const cls = (el.getAttribute('class') || '').split(/\s+/)
    if (!c.classes.every((k) => cls.includes(k))) return false
  }
  if (c.attrs.length) {
    for (const a of c.attrs) {
      const v = el.getAttribute(a.name)
      if (v === null) return false
      if (a.value !== undefined && v !== a.value) return false
    }
  }
  return true
}

export function matchesSelector(el: Element, sel: ParsedSelector): boolean {
  let idx = sel.parts.length - 1
  let node: Element | null = el
  if (!node || !matchCompound(node, sel.parts[idx].compound)) return false
  idx--
  while (idx >= 0) {
    const part = sel.parts[idx]
    const combinator = sel.parts[idx + 1].combinator
    if (combinator === '>') {
      node = node.parentElement
      if (!node || !matchCompound(node, part.compound)) return false
    } else {
      let found = false
      let cur: Element | null = node.parentElement
      while (cur) {
        if (matchCompound(cur, part.compound)) {
          found = true
          node = cur
          break
        }
        cur = cur.parentElement
      }
      if (!found) return false
    }
    idx--
  }
  return true
}

export function matchRules(el: Element, sheet: Stylesheet): Record<string, string> {
  const matched: { spec: number; order: number; decls: Record<string, string> }[] = []
  for (const rule of sheet.rules) {
    for (const sel of rule.selectors) {
      if (matchesSelector(el, sel)) {
        matched.push({ spec: sel.specificity, order: rule.order, decls: rule.decls })
        break
      }
    }
  }
  matched.sort((a, b) => a.spec - b.spec || a.order - b.order)
  const out: Record<string, string> = {}
  matched.forEach((m) => Object.assign(out, m.decls))
  return out
}

/** 自定义属性（--x）沿 DOM 向上查找 */
export function lookupVar(el: Element | null, name: string): string | undefined {
  let cur: Element | null = el
  while (cur) {
    const inline = cur.getAttribute('style')
    if (inline) {
      const m = inline.match(new RegExp(`${name}\\s*:\\s*([^;]+)`))
      if (m) return m[1].trim()
    }
    const attr = cur.getAttribute(name)
    if (attr) return attr.trim()
    cur = cur.parentElement
  }
  return undefined
}

/** 展开 var()，返回原始字符串 */
export function substituteVars(value: string, el: Element | null, depth = 0): string {
  if (!value || depth > 6 || !value.includes('var(')) return value
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]*))?\)/g, (_all, name: string, fallback?: string) => {
    const found = lookupVar(el, name)
    return substituteVars(found ?? fallback ?? '', el, depth + 1) || fallback || ''
  })
}

/** 求值时间表达式：0.5s / 300ms / calc(0.62s - var(--t,0s)) */
export function evalTimeExpr(raw: string | undefined, el: Element | null): number | null {
  if (!raw) return null
  let v = substituteVars(raw, el).trim()
  if (!v) return null
  const direct = parseTime(v)
  if (direct !== null) return direct
  if (/^-?[\d.]+(ms|s)$/.test(v)) return parseTime(v.replace(/^-/, ''))! * (v.startsWith('-') ? -1 : 1)
  const calc = v.match(/calc\((.*)\)/)
  if (calc) {
    const expr = calc[1]
    const tokens = expr.match(/[-+]?\s*[\d.]+(?:ms|s)/g)
    if (tokens) {
      let total = 0
      // 逐项求和，注意 "0.62s - 0.1s" 的符号
      const re = /([-+]?)\s*([\d.]+)(ms|s)/g
      let m: RegExpExecArray | null
      while ((m = re.exec(expr))) {
        const val = parseFloat(m[2]) * (m[3] === 'ms' ? 0.001 : 1)
        total += m[1] === '-' ? -val : val
      }
      return total
    }
    // calc 里只剩数字或 var 已展开失败的项
    const only = expr.match(/^([\d.]+)(ms|s)?$/)
    if (only) return parseFloat(only[1]) * (only[2] === 'ms' ? 0.001 : 1)
    return null
  }
  return null
}

export interface RGBA {
  r: number
  g: number
  b: number
  a: number
}

const NAMED: Record<string, string> = {
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  gray: '#808080',
  grey: '#808080',
  orange: '#ffa500',
  purple: '#800080',
  pink: '#ffc0cb',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  transparent: 'rgba(0,0,0,0)',
  gold: '#ffd700',
  silver: '#c0c0c0',
}

export function parseColor(input?: string, fallback = '#000000'): RGBA {
  if (!input) return parseColor(fallback)
  let v = input.trim().toLowerCase()
  if (v === 'currentcolor' || v === 'inherit' || v === 'none') return parseColor(fallback)
  if (NAMED[v]) v = NAMED[v]
  if (v.startsWith('#')) {
    let hex = v.slice(1)
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('')
    if (hex.length === 4) hex = hex.split('').map((c) => c + c).join('')
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      }
    }
    if (hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: parseInt(hex.slice(6, 8), 16) / 255,
      }
    }
  }
  const rgb = v.match(/rgba?\(([^)]+)\)/)
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean)
    const num = (s: string) => (s.endsWith('%') ? (parseFloat(s) / 100) * 255 : parseFloat(s))
    return {
      r: num(parts[0] || '0'),
      g: num(parts[1] || '0'),
      b: num(parts[2] || '0'),
      a: parts[3] !== undefined ? (parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])) : 1,
    }
  }
  const hsl = v.match(/hsla?\(([^)]+)\)/)
  if (hsl) {
    const parts = hsl[1].split(/[,\s/]+/).filter(Boolean)
    return hslToRgba(parseFloat(parts[0]), parseFloat(parts[1]) / 100, parseFloat(parts[2]) / 100, parts[3] ? parseFloat(parts[3]) : 1)
  }
  return parseColor(fallback)
}

export function hslToRgba(h: number, s: number, l: number, a = 1): RGBA {
  h = ((h % 360) + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0
  let g = 0
  let b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a }
}

export function toHex(c: RGBA): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${h(c.r)}${h(c.g)}${h(c.b)}`
}

export function rgbaString(c: RGBA): string {
  return c.a >= 1 ? toHex(c) : `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${+c.a.toFixed(3)})`
}

export function mixColor(a: RGBA, b: RGBA, t: number): RGBA {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
    a: a.a + (b.a - a.a) * t,
  }
}
