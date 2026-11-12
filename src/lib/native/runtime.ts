/**
 * 原生素材运行时。
 *
 * 这两个格式不走 Studio 自己的解析：Lottie 交给 lottie-web 画，GSAP 的 SVG 交给真正的 gsap 在沙箱里跑。
 * 好处是保真——mask、trim path、路径变形、各种插件全都原样工作；
 * 代价是没有逐元素编辑和参数轨道，素材是只读的。
 */

export type NativeFormat = 'lottie' | 'gsap'

export interface NativeRuntime {
  /** 秒 */
  duration: number
  seek(t: number): void
  play(): void
  pause(): void
  destroy(): void
  /** 取当前时刻的静态 SVG，用来做缩略图 */
  snapshot(): Promise<string>
}

const base = () => (import.meta as any).env?.BASE_URL || '/'

/* ------------------------------- lottie -------------------------------- */

let lottiePromise: Promise<any> | null = null

function ensureLottie(): Promise<any> {
  if (lottiePromise) return lottiePromise
  lottiePromise = new Promise((resolve, reject) => {
    const w = window as any
    if (w.lottie) return resolve(w.lottie)
    const s = document.createElement('script')
    s.src = `${base()}vendor/lottie.min.js`
    s.async = true
    s.onload = () => (w.lottie ? resolve(w.lottie) : reject(new Error('lottie 载入后没有挂到 window')))
    s.onerror = () => reject(new Error('取不到 lottie 运行时'))
    document.head.appendChild(s)
  })
  return lottiePromise
}

export async function createLottieRuntime(container: HTMLElement, json: string): Promise<NativeRuntime> {
  const lottie = await ensureLottie()
  container.innerHTML = ''
  const holder = document.createElement('div')
  holder.style.cssText = 'width:100%;height:100%'
  container.appendChild(holder)

  const data = JSON.parse(json)
  const anim = lottie.loadAnimation({
    container: holder,
    renderer: 'svg',
    loop: false,
    autoplay: false,
    animationData: data,
    rendererSettings: { preserveAspectRatio: 'xMidYMid meet', progressiveLoad: false },
  })

  await new Promise<void>((resolve) => {
    anim.addEventListener('DOMLoaded', () => resolve())
    setTimeout(resolve, 2500)
  })

  const fr = Number(data.fr) || 30
  const ip = Number(data.ip) || 0
  const op = Number(data.op) || ip + 1
  const duration = Math.max(0.001, (op - ip) / fr)

  return {
    duration,
    seek(t: number) {
      const frame = ip + Math.max(0, Math.min(1, t / duration)) * (op - ip)
      anim.goToAndStop(frame, true)
    },
    play() {
      anim.play()
    },
    pause() {
      anim.pause()
    },
    destroy() {
      anim.destroy()
      container.innerHTML = ''
    },
    async snapshot() {
      const svg = holder.querySelector('svg')
      if (!svg) return ''
      const clone = svg.cloneNode(true) as SVGElement
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('width', String(data.w || 512))
      clone.setAttribute('height', String(data.h || 512))
      return new XMLSerializer().serializeToString(clone)
    },
  }
}

/* -------------------------------- gsap --------------------------------- */

const GSAP_CTRL = String.raw`
(function () {
  var sent = false;
  function say(msg) { parent.postMessage(msg, '*'); }
  function boot() {
    if (typeof gsap === 'undefined') { say({ __native: 'error', message: '页面里没有 gsap' }); return; }

    // 直接操控 globalTimeline 的每一根子树：作者的时间轴常常是 paused:true，
    // 靠父级推进不动它，只能各自 setTime。
    var root = gsap.globalTimeline;
    root.pause();
    var kids = root.getChildren(false, true, true) || [];

    var span = 0;
    kids.forEach(function (c) {
      var start = c.startTime ? c.startTime() : 0;
      // 带 repeat 的 tween 要用总时长，否则时间轴会提前结束
      var dur = c.totalDuration ? c.totalDuration() : c.duration ? c.duration() : 0;
      if (!isFinite(dur)) dur = c.duration ? c.duration() : 0;
      if (start + dur > span) span = start + dur;
    });

    function seekTo(t) {
      kids.forEach(function (c) {
        var start = c.startTime ? c.startTime() : 0;
        var local = Math.max(0, t - start);
        if (c.totalTime) c.totalTime(local);
        else if (c.time) c.time(local);
        else if (c.progress) c.progress(0);
      });
    }
    seekTo(0);

    if (!sent) {
      sent = true;
      say({ __native: 'ready', duration: span, children: kids.length });
    }

    addEventListener('message', function (e) {
      var d = e.data;
      if (!d || !d.__cmd) return;
      if (d.__cmd === 'seek') seekTo(d.t);
      else if (d.__cmd === 'snapshot') {
        var el = document.querySelector('svg');
        say({ __native: 'snapshot', svg: el ? el.outerHTML : '' });
      }
    });
  }
  if (document.readyState === 'complete') setTimeout(boot, 16);
  else addEventListener('load', function () { setTimeout(boot, 16); });
})();
`

let gsapText: string | null = null
async function loadGsap(): Promise<string> {
  if (gsapText) return gsapText
  const res = await fetch(`${base()}vendor/gsap.min.js`)
  if (!res.ok) throw new Error('取不到 gsap 运行时')
  gsapText = await res.text()
  return gsapText
}

/**
 * GSAP 素材跑在 sandbox iframe 里：要执行作者的脚本，就不能让它碰应用本身。
 * 父子之间只通过 postMessage 传「跳到哪里 / 播 / 停」。
 */
export async function createGsapRuntime(
  container: HTMLElement,
  svg: string,
  size: { width: number; height: number },
  timeoutMs = 4000
): Promise<NativeRuntime> {
  const gsapSource = await loadGsap()
  container.innerHTML = ''

  // 外链脚本加载不可靠（gsap 我们自己注入），CDATA 在 HTML 里会被当成文本吃掉，都要先处理
  const body = svg
    .replace(/<script\b[^>]*\bsrc\s*=[^>]*>\s*<\/script>/gi, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  const html =
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<style>html,body{margin:0;background:transparent;overflow:hidden}svg{display:block;width:100%;height:100%}</style>' +
    `<script>${gsapSource}<\/script></head><body>${body}` +
    `<script>${GSAP_CTRL}<\/script></body></html>`

  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-scripts')
  frame.setAttribute('scrolling', 'no')
  frame.style.cssText = `width:${size.width}px;height:${size.height}px;border:0;display:block;background:transparent`
  container.appendChild(frame)

  let pendingSnapshot: ((svg: string) => void) | null = null

  const onMessage = (ev: MessageEvent) => {
    const d = ev.data
    if (!d || ev.source !== frame.contentWindow) return
    if (d.__native === 'snapshot') {
      const done = pendingSnapshot
      pendingSnapshot = null
      done?.(String(d.svg || ''))
      return
    }
    if (d.__native === 'error') settleReady(null, new Error(d.message || 'GSAP 初始化失败'))
    else if (d.__native === 'ready') {
      const len = Number(d.duration) || 0
      if (len <= 0) {
        settleReady(null, new Error(`脚本跑完了但时间轴是空的（读到 ${Number(d.children) || 0} 个子时间轴）：确认动画用的是全局 gsap`))
      } else settleReady(len, null)
    }
  }
  window.addEventListener('message', onMessage)

  let settleReady: (len: number | null, err: Error | null) => void = () => {}
  const duration = await new Promise<number>((resolve, reject) => {
    let done = false
    settleReady = (len, err) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (err) reject(err)
      else resolve(len as number)
    }
    const timer = setTimeout(() => settleReady(null, new Error('GSAP 素材超时：脚本没有建出全局时间轴')), timeoutMs)
    frame.srcdoc = html
  })

  const post = (msg: Record<string, unknown>) => frame.contentWindow?.postMessage(msg, '*')

  return {
    duration: Math.max(0.001, duration),
    seek(t: number) {
      post({ __cmd: 'seek', t })
    },
    play() {
      post({ __cmd: 'play' })
    },
    pause() {
      post({ __cmd: 'pause' })
    },
    destroy() {
      window.removeEventListener('message', onMessage)
      frame.remove()
      container.innerHTML = ''
    },
    snapshot() {
      return new Promise<string>((resolve) => {
        pendingSnapshot = resolve
        post({ __cmd: 'snapshot' })
        setTimeout(() => {
          if (pendingSnapshot === resolve) {
            pendingSnapshot = null
            resolve('')
          }
        }, 1500)
      })
    },
  }
}

/* ------------------------------- 播放器 -------------------------------- */

/**
 * 和 AssetPlayer 同形：Studio 的时间轴、播放键、seek 都按这套接口走，
 * 只是这里把时间转给原生运行时，而不是自己算属性。
 */
export class NativePlayer {
  time = 0
  duration = 0
  speed = 1
  loop = false
  playing = false
  groups: never[] = []
  onTime?: (t: number, d: number) => void
  onEnd?: () => void

  private runtime: NativeRuntime | null = null
  private pushAt = -1

  attach(runtime: NativeRuntime) {
    this.runtime = runtime
    this.duration = runtime.duration
    runtime.seek(0)
  }

  get lastFrameTime() {
    return Math.max(0, this.duration - Math.min(0.000001, this.duration / 2))
  }

  seek(t: number) {
    this.time = Math.min(this.duration, Math.max(0, t))
    this.push(true)
    this.onTime?.(this.time, this.duration)
  }

  play() {
    if (this.playing) return
    if (this.time >= this.lastFrameTime) this.seek(0)
    this.playing = true
    this.runtime?.play()
  }

  pause() {
    this.playing = false
    this.runtime?.pause()
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
        this.runtime?.pause()
        this.onEnd?.()
      }
    }
    this.time = t
    this.push(false)
    this.onTime?.(t, this.duration)
  }

  /** 原生运行时有自己的时钟，这里只负责把「该到哪一帧」告诉它 */
  private push(force: boolean) {
    if (!this.runtime) return
    if (!force && Math.abs(this.time - this.pushAt) < 1e-4) return
    this.pushAt = this.time
    this.runtime.seek(this.time)
  }

  render(t: number) {
    this.seek(t)
  }

  reset() {
    this.seek(0)
  }

  invalidate() {}

  destroy() {
    this.runtime?.destroy()
    this.runtime = null
  }
}
