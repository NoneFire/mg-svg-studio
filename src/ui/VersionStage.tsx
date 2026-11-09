import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { Box, Leafer } from 'leafer-ui'
import { store, type AssetVersionRecord } from '../store'
import { convertSvg } from '../lib/convert'
import { AssetPlayer } from '../lib/runtime'
import { parseSvgDocument } from '../lib/svg-doc'
import { fontsSettled, hasPendingFonts } from '../lib/fonts'

export interface VersionStageHandle {
  /** 暂停并定格到这一版自己的末帧 */
  showLastFrame: () => void
  isPlaying: () => boolean
}

interface Stage {
  player: AssetPlayer
  draw: () => void
}

/**
 * 版本对比的一侧画面。
 * 版本记录里只有 SVG，所以按这一版的 SVG 重新解析动画，播放的就是当时存下来的那条动效；
 * 读 SVG 自带的动画，而不是当前素材上改过的参数。
 */
const VersionStage = forwardRef<VersionStageHandle, {
  version: AssetVersionRecord
  playing: boolean
  loop: boolean
  onEnded?: () => void
  label: string
}>(function VersionStage({ version, playing, loop, onEnded, label }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<Stage | null>(null)
  const frame = useRef(0)
  const [failed, setFailed] = useState(false)
  const [fontRev, setFontRev] = useState(0)

  const latest = useRef({ playing, onEnded })
  latest.current = { playing, onEnded }

  const asset = useMemo(() => store.buildAsset(version.svg, '版本画面'), [version])

  const stop = () => {
    if (frame.current) cancelAnimationFrame(frame.current)
    frame.current = 0
  }

  /** 每帧推进播放器；播放器自己停下来（末帧且不循环）时循环自然退出 */
  const pump = () => {
    if (frame.current) return
    let last = performance.now()
    const tick = (now: number) => {
      const current = stage.current
      if (!current || !current.player.playing) {
        frame.current = 0
        return
      }
      current.player.tick((now - last) / 1000)
      last = now
      current.draw()
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }

  useImperativeHandle(ref, () => ({
    showLastFrame() {
      const current = stage.current
      if (!current) return
      current.player.pause()
      stop()
      current.player.seek(current.player.lastFrameTime)
      current.draw()
    },
    isPlaying: () => !!stage.current?.player.playing,
  }))

  useEffect(() => {
    const node = host.current
    if (!node) return
    const leafer = new Leafer({ view: node, width: Math.max(1, node.clientWidth), height: Math.max(1, node.clientHeight), hittable: false })
    let alive = true
    try {
      const converted = convertSvg(parseSvgDocument(asset.svg), asset)
      const board = new Box({ width: Math.max(1, asset.width), height: Math.max(1, asset.height), overflow: 'hide' })
      leafer.add(board)
      board.add(converted.content)
      const player = new AssetPlayer(converted, asset)
      player.loop = loop
      player.render(0)
      const draw = () => leafer.forceRender(undefined, true)
      player.onEnd = () => latest.current.onEnded?.()
      stage.current = { player, draw }

      const resize = () => {
        const width = node.clientWidth
        const height = node.clientHeight
        if (!width || !height) return
        leafer.resize({ width, height })
        const scale = Math.min(width / board.width, height / board.height)
        board.set({ x: (width - board.width * scale) / 2, y: (height - board.height * scale) / 2, scaleX: scale, scaleY: scale })
        draw()
      }
      const observer = new ResizeObserver(resize)
      observer.observe(node)
      resize()

      if (latest.current.playing) {
        player.play()
        pump()
      }
      setFailed(false)

      // 字体是异步加载的：先按回退字体排版，等 @font-face 就绪再重建一次
      if (hasPendingFonts()) {
        void fontsSettled().then(() => {
          if (alive) setFontRev((n) => n + 1)
        })
      }

      return () => {
        alive = false
        observer.disconnect()
        stop()
        stage.current = null
        leafer.destroy()
      }
    } catch (error) {
      alive = false
      console.error('无法预览这一版', error)
      setFailed(true)
      leafer.destroy()
      return () => stop()
    }
    // 这一版换了、或字体刚就绪时重建播放器
  }, [asset, fontRev])

  useEffect(() => {
    const current = stage.current
    if (!current) return
    if (playing) {
      current.player.play()
      pump()
    } else {
      current.player.pause()
      stop()
      current.draw()
    }
  }, [playing])

  useEffect(() => {
    if (stage.current) stage.current.player.loop = loop
  }, [loop])

  return (
    <div className="version-stage">
      <div ref={host} className="version-stage-canvas" role="img" aria-label={label} />
      {failed && <p className="version-empty">这一版无法预览</p>}
    </div>
  )
})

export default VersionStage
