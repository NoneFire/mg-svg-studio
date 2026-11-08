import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import { store } from '../store'
import type { Studio } from '../lib/studio'
import { loadWaveform, waveformPath, type Waveform } from '../lib/waveform'
import { Icon } from './Icon'
import { ResizeHandle } from './controls'

const GROUP_COLORS = ['#5eead4', '#93c5fd', '#fca5a5', '#fcd34d', '#c4b5fd', '#f9a8d4', '#86efac']
const HEIGHT_KEY = 'mg-timeline-height'
const MIN_TRACK_HEIGHT = 56

export function groupColor(index: number) {
  return GROUP_COLORS[index % GROUP_COLORS.length]
}

export default function Timeline({ studio }: { studio: Studio | null }) {
  const asset = store.selectedAsset
  const assetId = asset?.id
  const player = assetId ? studio?.getBoard(assetId)?.player : undefined
  const total = player?.duration || 1
  const panelRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const rulerRef = useRef<HTMLDivElement>(null)
  const timeRef = useRef<HTMLSpanElement>(null)
  const selectedLane = useRef<HTMLDivElement>(null)
  const dragPointer = useRef<number | null>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const mutedRef = useRef(false)
  // 只有用户按时间轴的播放键之后才让语音出声：打开项目时的自动播放保持安静
  const audioArmed = useRef(false)
  const [rulerWidth, setRulerWidth] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [muted, setMuted] = useState(false)
  const [voice, setVoice] = useState<Waveform | null>(null)
  const [voiceFailed, setVoiceFailed] = useState(false)
  const [workspaceHeight, setWorkspaceHeight] = useState(() => window.innerHeight - 48)
  const [preferredHeight, setPreferredHeight] = useState<number | null>(() => {
    try {
      const height = Number(localStorage.getItem(HEIGHT_KEY))
      if (Number.isFinite(height) && height >= MIN_TRACK_HEIGHT) return height
    } catch {}
    return null
  })

  const groups = asset?.groups ?? []
  const voiceSrc = asset?.voiceoverAudio
  const playing = player?.playing ?? false
  const canPlay = !!player && groups.some((group) => group.enabled !== false)
  // 为画布留出可操作空间，同时扣除时间轴标题、把手和边距。
  const maxHeight = Math.max(MIN_TRACK_HEIGHT, workspaceHeight - 220)
  const rowCount = groups.length + (voiceSrc ? 1 : 0)
  const defaultHeight = Math.max(MIN_TRACK_HEIGHT, Math.min(178 + (voiceSrc ? 26 : 0), 29 + rowCount * 26))
  const trackHeight = Math.min(maxHeight, preferredHeight ?? defaultHeight)
  const selectedId = groups.find((group) => group.id === store.selectedGroupId)?.id ?? groups[0]?.id
  const step = rulerStep(total, rulerWidth)
  const stepPercent = step / total * 100
  const ticks = Array.from({ length: Math.floor(total / step + 1e-8) + 1 }, (_, i) => i * step)
  const voiceDuration = voice?.duration ?? 0
  const voiceWidth = voiceDuration > 0 ? Math.min(1, voiceDuration / total) * 100 : 100
  const voiceWavePath = useMemo(() => waveformPath(voice?.peaks ?? []), [voice])

  useEffect(() => {
    let active = true
    setVoice(null)
    setVoiceFailed(false)
    if (!voiceSrc) return
    void loadWaveform(voiceSrc).then((result) => {
      if (!active) return
      setVoice(result)
      setVoiceFailed(!result)
    })
    return () => { active = false }
  }, [voiceSrc])

  useEffect(() => {
    audioArmed.current = false
    setMuted(false)
  }, [assetId])

  useEffect(() => {
    mutedRef.current = muted
  }, [muted])

  useEffect(() => {
    const workspace = panelRef.current?.parentElement
    if (!workspace) return
    const measure = () => setWorkspaceHeight(workspace.clientHeight)
    const observer = new ResizeObserver(measure)
    observer.observe(workspace)
    measure()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const ruler = rulerRef.current
    if (!ruler) return
    const measure = () => setRulerWidth(ruler.clientWidth)
    const observer = new ResizeObserver(measure)
    observer.observe(ruler)
    measure()
    return () => observer.disconnect()
  }, [collapsed])

  useEffect(() => {
    if (!assetId || !studio) return
    let raf = 0
    let lastTime = NaN
    let lastDuration = NaN
    const sync = () => {
      const current = studio.getBoard(assetId)?.player
      if (current) {
        const { time, duration } = current
        syncVoiceAudio(audioRef.current, time, current.playing, audioArmed, mutedRef)
        if (lastTime !== time || lastDuration !== duration) {
          const timecode = time.toFixed(2)
          if (timeRef.current) timeRef.current.textContent = timecode
          bodyRef.current?.style.setProperty('--timeline-progress', String(time / duration))
          rulerRef.current?.setAttribute('aria-valuenow', String(time))
          rulerRef.current?.setAttribute('aria-valuetext', `${timecode} 秒`)
          lastTime = time
          lastDuration = duration
        }
      }
      raf = requestAnimationFrame(sync)
    }
    sync()
    return () => {
      cancelAnimationFrame(raf)
      audioRef.current?.pause()
    }
  }, [assetId, collapsed, studio, voiceSrc])

  useEffect(() => {
    const body = bodyRef.current
    const lane = selectedLane.current
    if (!body || !lane) return
    const top = lane.offsetTop
    const bottom = top + lane.offsetHeight + (rulerRef.current?.offsetHeight ?? 0)
    if (top < body.scrollTop) body.scrollTop = top
    if (bottom > body.scrollTop + body.clientHeight) body.scrollTop = bottom - body.clientHeight
  }, [collapsed, selectedId])

  if (!asset || !assetId) return null

  const seek = (time: number) => {
    studio?.seek(assetId, time)
  }

  const scrub = (event: PointerEvent<HTMLDivElement>) => {
    const ruler = rulerRef.current?.getBoundingClientRect()
    if (!ruler?.width) return
    const ratio = Math.min(1, Math.max(0, (event.clientX - ruler.left) / ruler.width))
    seek(ratio * total)
  }

  return (
    <section ref={panelRef} className="timeline" aria-label="动画时间轴">
      {voiceSrc && <audio ref={audioRef} className="timeline-audio" src={voiceSrc} preload="auto" />}
      {!collapsed && (
        <ResizeHandle
          axis="y"
          className="timeline-resize"
          label="时间轴高度"
          title="拖动调整时间轴高度"
          controls="timeline-tracks"
          min={MIN_TRACK_HEIGHT}
          max={maxHeight}
          value={trackHeight}
          onResize={(height, commit) => {
            setPreferredHeight(height)
            if (commit) {
              try { localStorage.setItem(HEIGHT_KEY, String(height)) } catch {}
            }
          }}
        />
      )}
      <header className="timeline-head">
        <div className="timeline-transport">
          <button className="row-icon timeline-rewind" title="回到起点" onClick={() => seek(0)}>
            <Icon name="skipBack" size={14} />
          </button>
          <button
            className="play-btn"
            title={playing ? '暂停素材' : '播放素材'}
            disabled={!playing && !canPlay}
            onClick={() => {
              if (studio?.isPlaying(assetId)) {
                audioArmed.current = false
                studio.pause(assetId)
              } else {
                // 从这里起播才带上语音；打开项目时的自动播放保持安静
                audioArmed.current = true
                studio?.play(assetId)
              }
            }}
          >
            <Icon name={playing ? 'pause' : 'play'} size={14} />
          </button>
          <button
            className="row-icon timeline-forward"
            title="跳到末帧"
            aria-label="跳到末帧"
            disabled={!canPlay}
            onClick={() => seek(player?.lastFrameTime ?? total)}
          >
            <Icon name="skipForward" size={14} />
          </button>
        </div>
        <div className="timeline-time mono">
          <span ref={timeRef}>{(player?.time ?? 0).toFixed(2)}</span>
          <span className="timeline-total">/ {total.toFixed(2)} s</span>
        </div>
        <div className="timeline-title">
          <h2>时间轴</h2>
          <span className="timeline-asset" title={asset.name}>{asset.name}</span>
        </div>
        <span className="timeline-count">{groups.length} 条轨道{voiceSrc ? ' · 语音' : ''}</span>
        <button
          className="row-icon"
          title={collapsed ? '展开时间轴' : '收起时间轴'}
          aria-expanded={!collapsed}
          aria-controls="timeline-tracks"
          onClick={() => {
            dragPointer.current = null
            setCollapsed((value) => !value)
          }}
        >
          <Icon name={collapsed ? 'chevronUp' : 'chevronDown'} size={15} />
        </button>
      </header>

      {!collapsed && (
        <div
          id="timeline-tracks"
          className="timeline-body"
          ref={bodyRef}
          style={{ height: trackHeight, '--timeline-tick': `${stepPercent}%` } as CSSProperties}
          onPointerDown={(event) => {
            if (event.button !== 0 || !event.isPrimary || dragPointer.current !== null) return
            const target = event.target as Element
            if (target.closest('button') || !target.closest('.timeline-ruler, .timeline-lane-plot')) return
            if (event.pointerType !== 'mouse' && !target.closest('.timeline-ruler')) return
            dragPointer.current = event.pointerId
            event.currentTarget.setPointerCapture(event.pointerId)
            scrub(event)
          }}
          onPointerMove={(event) => {
            if (dragPointer.current === event.pointerId) scrub(event)
          }}
          onLostPointerCapture={(event) => {
            if (dragPointer.current === event.pointerId) dragPointer.current = null
          }}
        >
          <div className="timeline-scale">
            <span className="timeline-scale-label">轨道</span>
            <div
              className="timeline-ruler"
              ref={rulerRef}
              role="slider"
              tabIndex={0}
              aria-label="播放位置"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={player?.time ?? 0}
              title="点击或拖动定位，方向键微调"
              onKeyDown={(event) => {
                const time = player?.time ?? 0
                const increment = event.shiftKey ? 1 : 0.1
                const positions: Record<string, number> = {
                  ArrowLeft: time - increment,
                  ArrowDown: time - increment,
                  ArrowRight: time + increment,
                  ArrowUp: time + increment,
                  Home: 0,
                  End: total,
                }
                if (positions[event.key] === undefined) return
                event.preventDefault()
                seek(positions[event.key])
              }}
            >
              {ticks.map((tick, index) => (
                <span className="timeline-tick" key={index} style={{ left: `${index * stepPercent}%` }} aria-hidden="true">
                  {(index === 0 || rulerWidth * (1 - tick / total) >= 44) && (
                    <span>{Number(tick.toPrecision(7))} s</span>
                  )}
                </span>
              ))}
              <span className="timeline-caret" aria-hidden="true" />
            </div>
          </div>

          <div className="timeline-rows">
            {voiceSrc && (
              <div className="timeline-lane timeline-voice">
                <div className="timeline-lane-label timeline-voice-label">
                  <Icon name="mic" size={11} />
                  <span className="timeline-lane-name">语音</span>
                  {voiceDuration > 0 && (
                    <span className="timeline-lane-detail">{formatSeconds(voiceDuration)}</span>
                  )}
                  <button
                    className="timeline-voice-mute"
                    aria-pressed={muted}
                    aria-label={muted ? '取消语音静音' : '语音静音'}
                    title={muted ? '取消静音' : '静音'}
                    onClick={() => setMuted((value) => !value)}
                  >
                    <Icon name={muted ? 'volumeOff' : 'volume'} size={12} />
                  </button>
                </div>
                <div
                  className="timeline-lane-plot"
                  title={`语音 ${voiceDuration > 0 ? formatSeconds(voiceDuration) : voiceFailed ? '波形不可用' : '解析中'} · 点击定位；按上面的播放键会与动画一起播放`}
                >
                  <div
                    className={`timeline-voice-clip${voiceWavePath ? '' : ' pending'}`}
                    style={{ width: `${voiceWidth}%` }}
                    aria-hidden="true"
                  >
                    {voiceWavePath
                      ? (
                        <svg className="timeline-voice-wave" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
                          <path d={voiceWavePath} />
                        </svg>
                      )
                      : <span />}
                  </div>
                  {voiceDuration > total + 0.02 && (
                    <span
                      className="timeline-voice-out"
                      title={`语音比动画长 ${(voiceDuration - total).toFixed(1)} 秒，波形在动画结束处截断`}
                    >
                      +{(voiceDuration - total).toFixed(1)}s
                    </span>
                  )}
                </div>
              </div>
            )}
            {groups.map((group, index) => {
              const count = group.targetIds?.length || 1
              const iterations = group.iterations
              const repeats = iterations === 'infinite'
              const start = Math.max(0, group.delay)
              const end = repeats ? total : Math.min(total,
                group.delay + group.duration * Math.max(1, iterations || 1) + (count - 1) * Math.max(0, group.stagger || 0),
              )
              const active = group.id === selectedId
              const disabled = group.enabled === false
              const info = `${group.name} · ${group.delay.toFixed(2)} s 开始 · ${group.duration.toFixed(2)} s / 次`
              const select = () => store.selectGroup(group.id)
              return (
                <div
                  key={group.id}
                  ref={active ? selectedLane : undefined}
                  className={`timeline-lane ${active ? 'active' : ''} ${disabled ? 'off' : ''}`}
                  style={{ '--lane-color': groupColor(index) } as CSSProperties}
                >
                  <button
                    className="timeline-lane-label"
                    title={disabled ? `${info} · 已停用` : info}
                    aria-pressed={active}
                    onClick={select}
                  >
                    <span className="color-dot" />
                    <span className="timeline-lane-name">{group.name}</span>
                    {count > 1 && <span className="timeline-lane-detail">×{count}</span>}
                    {repeats && <span className="timeline-lane-detail" aria-label="无限循环">∞</span>}
                    {disabled && <Icon name="eyeOff" size={12} />}
                  </button>
                  <div className="timeline-lane-plot">
                    {end > start ? (
                      <button
                        className="timeline-clip"
                        tabIndex={-1}
                        aria-pressed={active}
                        title={info}
                        style={{ left: `${start / total * 100}%`, width: `${(end - start) / total * 100}%` }}
                        onClick={select}
                      >
                        <span>{group.name}</span>
                      </button>
                    ) : <span className="timeline-outside">预览范围外</span>}
                  </div>
                </div>
              )
            })}
            <div className="timeline-playhead" aria-hidden="true" />
          </div>
        </div>
      )}
    </section>
  )
}

function rulerStep(total: number, width: number) {
  const target = total / Math.max(2, Math.min(12, Math.floor(width / 70)))
  const scale = 10 ** Math.floor(Math.log10(target))
  const step = [1, 2, 2.5, 5, 10].find((value) => value * scale >= target) ?? 10
  return step * scale
}

/** 语音跟随时间轴播放器：起播、暂停、拖动定位都保持同一时刻 */
function syncVoiceAudio(
  element: HTMLAudioElement | null,
  time: number,
  playing: boolean,
  armed: { current: boolean },
  muted: { current: boolean },
) {
  if (!element) return
  element.muted = muted.current
  const duration = element.duration
  const known = Number.isFinite(duration) && duration > 0
  const target = known ? Math.min(time, duration) : time
  const shouldPlay = playing && armed.current && known
  if (shouldPlay) {
    // ended 也要对齐：循环播放时动画回到 0，语音得跟着从头开始
    if (element.ended || Math.abs(element.currentTime - target) > (element.paused ? 0.02 : 0.16)) {
      element.currentTime = target
    }
    if (element.paused) {
      // 浏览器可能拒绝自动出声：失败就退回静默，等用户下一次显式播放
      void element.play().catch(() => { armed.current = false })
    }
    return
  }
  if (!element.paused) element.pause()
  if (!playing && known && Math.abs(element.currentTime - target) > 0.03) element.currentTime = target
}

function formatSeconds(seconds: number) {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}
