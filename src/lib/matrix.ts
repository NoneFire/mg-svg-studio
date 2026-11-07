import type { Mat } from '../types'

export type { Mat }

export const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export function mul(m1: Mat, m2: Mat): Mat {
  // m1 * m2  (apply m2 first, then m1)
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  }
}

export function translate(tx: number, ty: number): Mat {
  return { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty }
}

export function scale(sx: number, sy = sx): Mat {
  return { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 }
}

export function rotate(deg: number): Mat {
  const r = (deg * Math.PI) / 180
  const cos = Math.cos(r)
  const sin = Math.sin(r)
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 }
}

export function skewX(deg: number): Mat {
  return { a: 1, b: 0, c: Math.tan((deg * Math.PI) / 180), d: 1, e: 0, f: 0 }
}

export function skewY(deg: number): Mat {
  return { a: 1, b: Math.tan((deg * Math.PI) / 180), c: 0, d: 1, e: 0, f: 0 }
}

export function apply(m: Mat, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }
}

export function invert(m: Mat): Mat {
  const det = m.a * m.d - m.b * m.c
  if (!det) return { ...IDENTITY }
  const id = 1 / det
  return {
    a: m.d * id,
    b: -m.b * id,
    c: -m.c * id,
    d: m.a * id,
    e: (m.c * m.f - m.d * m.e) * id,
    f: (m.b * m.e - m.a * m.f) * id,
  }
}

export function toArray(m: Mat): [number, number, number, number, number, number] {
  return [m.a, m.b, m.c, m.d, m.e, m.f]
}

export function isIdentity(m: Mat): boolean {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0
}

export function around(px: number, py: number): Mat {
  return translate(px, py)
}

/** 围绕某点的变换：T(p) * m * T(-p) */
export function pivotMatrix(m: Mat, px: number, py: number): Mat {
  return mul(mul(translate(px, py), m), translate(-px, -py))
}

const NUM = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?`

function parseArgs(str: string): number[] {
  return (str.match(new RegExp(NUM, 'g')) || []).map(Number)
}

/** 解析 SVG transform 属性 */
export function parseSvgTransform(value: string): Mat {
  let m: Mat = { ...IDENTITY }
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g
  let hit: RegExpExecArray | null
  while ((hit = re.exec(value))) {
    const fn = hit[1].toLowerCase()
    const a = parseArgs(hit[2])
    switch (fn) {
      case 'matrix':
        if (a.length >= 6) m = mul(m, { a: a[0], b: a[1], c: a[2], d: a[3], e: a[4], f: a[5] })
        break
      case 'translate':
        m = mul(m, translate(a[0] || 0, a[1] ?? 0))
        break
      case 'scale':
        m = mul(m, scale(a[0] ?? 1, a[1] ?? a[0] ?? 1))
        break
      case 'rotate':
        if (a.length >= 3) m = mul(m, pivotMatrix(rotate(a[0]), a[1], a[2]))
        else m = mul(m, rotate(a[0] || 0))
        break
      case 'skewx':
        m = mul(m, skewX(a[0] || 0))
        break
      case 'skewy':
        m = mul(m, skewY(a[0] || 0))
        break
    }
  }
  return m
}

/** 解析 CSS transform（支持 % 位移，按盒尺寸换算） */
export function parseCssTransform(value: string, boxW = 0, boxH = 0): Mat {
  let m: Mat = { ...IDENTITY }
  const re = /([a-zA-Z0-9]+)\s*\(([^)]*)\)/g
  let hit: RegExpExecArray | null
  while ((hit = re.exec(value))) {
    const fn = hit[1].toLowerCase()
    const raw = hit[2].split(/[,\s]+/).filter(Boolean)
    const nums = raw.map((v) => (v.endsWith('%') ? (parseFloat(v) / 100) * 1 : parseFloat(v)))
    const pct = raw.map((v) => v.endsWith('%'))
    switch (fn) {
      case 'translate':
        m = mul(m, translate((pct[0] ? nums[0] * boxW : nums[0]) || 0, (pct[1] ? nums[1] * boxH : nums[1]) || 0))
        break
      case 'translatex':
        m = mul(m, translate(pct[0] ? nums[0] * boxW : nums[0], 0))
        break
      case 'translatey':
        m = mul(m, translate(0, pct[0] ? nums[0] * boxH : nums[0]))
        break
      case 'translate3d':
        m = mul(m, translate((pct[0] ? nums[0] * boxW : nums[0]) || 0, (pct[1] ? nums[1] * boxH : nums[1]) || 0))
        break
      case 'scale':
        m = mul(m, scale(nums[0] ?? 1, nums[1] ?? nums[0] ?? 1))
        break
      case 'scalex':
        m = mul(m, scale(nums[0] ?? 1, 1))
        break
      case 'scaley':
        m = mul(m, scale(1, nums[0] ?? 1))
        break
      case 'scale3d':
        m = mul(m, scale(nums[0] ?? 1, nums[1] ?? nums[0] ?? 1))
        break
      case 'rotate':
      case 'rotatez':
        m = mul(m, rotate(nums[0] || 0))
        break
      case 'skewx':
        m = mul(m, skewX(nums[0] || 0))
        break
      case 'skewy':
        m = mul(m, skewY(nums[0] || 0))
        break
      case 'matrix':
        if (nums.length >= 6) m = mul(m, { a: nums[0], b: nums[1], c: nums[2], d: nums[3], e: nums[4], f: nums[5] })
        break
    }
  }
  return m
}
