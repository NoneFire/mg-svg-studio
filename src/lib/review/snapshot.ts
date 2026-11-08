import type { Asset } from '../../types'

/**
 * 把一张素材定格成一帧可测的画面。
 *
 * 三条约束，缺一条测量就不可信：
 * 1. 隔离：SVG 挂在 shadow root 里，素材自带的 <style> 不会污染界面，界面样式也进不来。
 * 2. 定格：用 Web Animations API 暂停并把每条动画拨到同一时刻，同一份输入每次得到同一帧。
 * 3. 烘焙：把 computed style 写回内联样式，序列化成静态 SVG 再光栅化——对比度必须在像素上测，
 *    而带有动画的 SVG 光栅化出来是 t=0，量到的不是同一帧。
 */

export interface Snapshot {
  host: HTMLElement
  shadow: ShadowRoot
  svg: SVGSVGElement
  /** 画布用户单位尺寸 */
  width: number
  height: number
  /** 1 用户单位对应多少 CSS px */
  unitScale: number
  /** 动画总时长（秒，不含无限循环） */
  duration: number
  animationCount: number
  hasSmil: boolean
  /** 已经烘焙过的静态 SVG 文本 */
  staticSvg: string
  dispose: () => void
}

const DEFAULT_W = 1920
const DEFAULT_H = 1080

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

function ensureRootSize(svg: SVGSVGElement) {
  // 内联 SVG 没有 width/height 时会退到 300×150，量出来的坐标全是错的
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.style.width = '100%'
  svg.style.height = '100%'
  svg.style.display = 'block'
  svg.style.overflow = 'visible'
}

export async function mountSnapshot(asset: Pick<Asset, 'id' | 'svg' | 'width' | 'height'>): Promise<Snapshot> {
  const width = asset.width > 0 ? asset.width : DEFAULT_W
  const height = asset.height > 0 ? asset.height : DEFAULT_H

  const host = document.createElement('div')
  host.setAttribute('data-qv-host', '1')
  host.style.cssText = [
    'position:fixed',
    'left:-200000px',
    'top:0',
    `width:${width}px`,
    `height:${height}px`,
    'pointer-events:none',
    'opacity:0',
    'contain:layout style',
    'z-index:-1',
  ].join(';')

  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = asset.svg
  const svg = shadow.querySelector('svg') as SVGSVGElement | null
  if (!svg) {
    throw new Error('这不是可渲染的 SVG：找不到根 <svg>')
  }
  ensureRootSize(svg)
  document.body.appendChild(host)

  // 字体没加载完就量文本，宽度会偏
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      /* 字体接口失败不影响布局测量，继续 */
    }
  }
  await nextFrame()

  const animations = collectAnimations(svg, shadow)
  const finiteEnds = animations
    .map((a) => {
      const timing = a.effect?.getComputedTiming()
      if (!timing) return 0
      const delay = Number(timing.delay) || 0
      const dur = Number(timing.duration) || 0
      const iterations = timing.iterations === Infinity ? 1 : Number(timing.iterations) || 1
      return delay + dur * iterations
    })
    .filter((v) => Number.isFinite(v) && v > 0)
  const duration = finiteEnds.length ? Math.max(...finiteEnds) / 1000 : 0

  const hasSmil = !!svg.querySelector('animate, animateTransform, animateMotion, set')

  let unitScale = 1
  const rootRect = svg.getBoundingClientRect()
  const vb = svg.viewBox?.baseVal
  if (vb && vb.width > 0) unitScale = rootRect.width / vb.width
  if (!Number.isFinite(unitScale) || unitScale <= 0) unitScale = 1

  return {
    host,
    shadow,
    svg,
    width: vb && vb.width > 0 ? vb.width : width,
    height: vb && vb.height > 0 ? vb.height : height,
    unitScale,
    duration,
    animationCount: animations.length,
    hasSmil,
    staticSvg: '',
    dispose: () => {
      host.remove()
    },
  }
}

function collectAnimations(svg: SVGSVGElement, shadow: ShadowRoot): Animation[] {
  const out = new Set<Animation>()
  const push = (list: Animation[] | undefined) => {
    for (const a of list || []) out.add(a)
  }
  try {
    push(svg.getAnimations({ subtree: true }))
  } catch {
    /* 老浏览器没有 subtree 参数 */
  }
  try {
    push((shadow as unknown as { getAnimations?: () => Animation[] }).getAnimations?.())
  } catch {
    /* ShadowRoot.getAnimations 不存在时忽略 */
  }
  try {
    push(document.getAnimations?.().filter((animation) => {
      const target = (animation.effect as KeyframeEffect | null)?.target
      return target instanceof Element && svg.contains(target)
    }))
  } catch {
    /* 忽略 */
  }
  return [...out]
}

/** 把每条动画拨到同一时刻并暂停。t 的单位是秒。 */


/** computed style 里这些属性决定“画出来长什么样”，必须抄进静态副本。 */
const BAKE_PROPS = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-opacity',
  'stroke-width',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-dasharray',
  'stroke-dashoffset',
  'stroke-miterlimit',
  'opacity',
  'color',
  'display',
  'visibility',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant',
  'letter-spacing',
  'word-spacing',
  'text-anchor',
  'dominant-baseline',
  'paint-order',
  'mix-blend-mode',
  'filter',
  'clip-path',
  'stop-color',
  'stop-opacity',
  'transform',
  'transform-origin',
  'transform-box',
  'vector-effect',
]

/** 烘焙：computed style → 内联样式，并去掉 <style> 与动画声明，得到静态画面。 */
export function bakeStatic(snap: Snapshot): string {
  const clone = snap.svg.cloneNode(true) as SVGSVGElement
  const srcList = [snap.svg, ...Array.from(snap.svg.querySelectorAll('*'))]
  const dstList = [clone, ...Array.from(clone.querySelectorAll('*'))]
  const len = Math.min(srcList.length, dstList.length)

  for (let i = 0; i < len; i++) {
    const src = srcList[i] as Element
    const dst = dstList[i] as Element
    const computed = getComputedStyle(src)
    const parts: string[] = []
    for (const prop of BAKE_PROPS) {
      const value = computed.getPropertyValue(prop)
      if (!value) continue
      parts.push(`${prop}:${value}`)
    }
    // 动画属性留着会让静态副本继续跑 t=0
    parts.push('animation:none', 'transition:none')
    dst.setAttribute('style', parts.join(';'))
    dst.removeAttribute('class')
  }

  clone.querySelectorAll('style').forEach((s) => s.remove())
  clone.setAttribute('width', String(snap.width))
  clone.setAttribute('height', String(snap.height))
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  }
  return new XMLSerializer().serializeToString(clone)
}

export interface Raster {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  image: ImageData
  width: number
  height: number
  /** 像素 / 用户单位 */
  pixelScale: number
  /** 光栅化失败时的原因 */
  error?: string
}

const MAX_RASTER = 1920

/** 把静态 SVG 画到 canvas 上，返回可取样像素。 */
export async function rasterize(snap: Snapshot, staticSvg: string): Promise<Raster | null> {
  const scale = Math.min(1, MAX_RASTER / Math.max(snap.width, snap.height))
  const w = Math.max(2, Math.round(snap.width * scale))
  const h = Math.max(2, Math.round(snap.height * scale))
  const blob = new Blob([staticSvg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'sync'
    img.src = url
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, w, h)
    const data = ctx.getImageData(0, 0, w, h)
    return { canvas, ctx, image: data, width: w, height: h, pixelScale: w / snap.width }
  } catch (err) {
    return {
      canvas: null as unknown as HTMLCanvasElement,
      ctx: null as unknown as CanvasRenderingContext2D,
      image: null as unknown as ImageData,
      width: w,
      height: h,
      pixelScale: w / snap.width,
      error: (err as Error)?.message || '光栅化失败',
    }
  } finally {
    URL.revokeObjectURL(url)
  }
}
