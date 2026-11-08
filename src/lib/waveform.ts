export interface Waveform {
  /** 解码得到的真实时长（秒） */
  duration: number
  /** 归一化后的振幅包络（0–1），按时间均匀取样 */
  peaks: number[]
}

const BUCKETS = 200
const CACHE = new Map<string, Promise<Waveform | null>>()

/** 解码一次并缓存：同一段录音在重新选中素材时不重复解码 */
export function loadWaveform(src: string): Promise<Waveform | null> {
  let cached = CACHE.get(src)
  if (!cached) {
    cached = decodeWaveform(src).catch(() => null)
    CACHE.set(src, cached)
  }
  return cached
}

async function decodeWaveform(src: string): Promise<Waveform> {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) throw new Error('当前浏览器不支持 Web Audio')
  const context = new Ctor()
  try {
    const response = await fetch(src)
    const buffer = await context.decodeAudioData(await response.arrayBuffer())
    return { duration: buffer.duration, peaks: peaksOf(buffer) }
  } finally {
    void context.close?.()
  }
}

function peaksOf(buffer: AudioBuffer): number[] {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index))
  const bucket = Math.max(1, Math.floor(buffer.length / BUCKETS))
  const peaks: number[] = []
  for (let start = 0; start < buffer.length; start += bucket) {
    const end = Math.min(buffer.length, start + bucket)
    let peak = 0
    for (const channel of channels) {
      for (let i = start; i < end; i += 1) peak = Math.max(peak, Math.abs(channel[i]))
    }
    peaks.push(peak)
  }
  const max = Math.max(0.001, ...peaks)
  // 语音的安静段很多：开方后小音量也看得出形状，又不至于把底噪画成满格
  return peaks.map((peak) => Math.sqrt(peak / max))
}

/** 一条左右对称的波形面积，坐标系固定为 100×10，由 SVG 拉伸到轨道宽度 */
export function waveformPath(peaks: number[]) {
  if (!peaks.length) return ''
  const mid = 5
  const amp = 3.8
  const point = (index: number) => (peaks.length === 1 ? 50 : (index / (peaks.length - 1)) * 100)
  const top = peaks.map((peak, index) => `${point(index).toFixed(2)},${(mid - Math.max(0.05, peak) * amp).toFixed(2)}`)
  const bottom = peaks.map((peak, index) => `${point(index).toFixed(2)},${(mid + Math.max(0.05, peak) * amp).toFixed(2)}`).reverse()
  return `M${top.join('L')}L${bottom.join('L')}Z`
}
