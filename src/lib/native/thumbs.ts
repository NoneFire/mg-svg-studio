/**
 * 原生素材的缩略图。
 *
 * 素材列表的缩略图是一张静态图，但 Lottie / GSAP 的画面只存在于运行时里，
 * 所以这里在屏幕外单独起一个实例，跳到「中后段」定格，再把当时的 SVG 序列化下来缓存。
 * 一次导入只算一次，之后就是普通 <img>。
 */
import type { Asset } from '../../types'
import { createGsapRuntime, createLottieRuntime } from './runtime'

const cache = new Map<string, string>()
const pending = new Set<string>()
const listeners = new Set<() => void>()

export function isNativeAsset(asset: Asset): boolean {
  return asset.format === 'lottie' || asset.format === 'gsap'
}

export function nativeThumb(assetId: string): string | undefined {
  return cache.get(assetId)
}

export function onThumbReady(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** 定格取中后段，和其他素材的缩略图口径保持一致 */
function frameTime(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 0
  return Math.max(0.15, Math.min(3, duration * 0.82))
}

export function ensureNativeThumb(asset: Asset) {
  if (cache.has(asset.id) || pending.has(asset.id) || !isNativeAsset(asset)) return
  pending.add(asset.id)
  void build(asset)
    .catch(() => {
      /* 缩略图失败不影响使用，列表里显示占位 */
    })
    .finally(() => pending.delete(asset.id))
}

async function build(asset: Asset) {
  const host = document.createElement('div')
  host.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${asset.width}px;height:${asset.height}px;` +
    'pointer-events:none;opacity:0;overflow:hidden'
  document.body.appendChild(host)

  let runtime: Awaited<ReturnType<typeof createLottieRuntime>> | null = null
  try {
    runtime = asset.format === 'lottie'
      ? await createLottieRuntime(host, asset.payload || '')
      : await createGsapRuntime(host, asset.payload || '', { width: asset.width, height: asset.height })

    runtime.seek(frameTime(runtime.duration))
    // 等两帧，确保运行时把这一帧真的画进了 DOM
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))

    const svg = await runtime.snapshot()
    if (!svg) return
    cache.set(asset.id, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    listeners.forEach((fn) => fn())
  } finally {
    runtime?.destroy()
    host.remove()
  }
}
