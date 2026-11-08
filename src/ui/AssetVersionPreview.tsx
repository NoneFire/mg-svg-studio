import { useEffect, useRef, useState } from 'react'
import { Box, Leafer } from 'leafer-ui'
import type { Asset } from '../types'
import { convertSvg } from '../lib/convert'
import { applyAssetLayouts } from '../lib/layout/apply'
import { AssetPlayer } from '../lib/runtime'
import { parseSvgDocument } from '../lib/svg-doc'
import { Icon } from './Icon'
import { Button } from './kit/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './kit/dialog'

export default function AssetVersionPreview({ asset, label, onRestore }: {
  asset: Asset
  label: string
  onRestore?: () => void
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs" className="btn ghost tiny">预览</Button>
      </DialogTrigger>
      <DialogContent className="asset-preview-dialog" data-asset-preview>
        <DialogHeader className="history-header">
          <DialogTitle>素材版本预览</DialogTitle>
          <DialogDescription>
            {asset.name || '未命名素材'} · {label} · {asset.width} × {asset.height}
          </DialogDescription>
        </DialogHeader>
        <AssetPreviewCanvas asset={asset} />
        {(asset.videoCopy?.trim() || asset.voiceoverAudio) && (
          <section className="asset-version-copy" aria-label="此版本的视频文案和录音">
            {asset.videoCopy?.trim() && <>
              <strong>视频文案</strong>
              <p>{asset.videoCopy}</p>
            </>}
            {asset.voiceoverAudio && <>
              <strong>录音</strong>
              <audio className="video-copy-audio" controls preload="metadata" src={asset.voiceoverAudio} aria-label="播放此版本的录音" />
            </>}
          </section>
        )}
        <div className="asset-preview-actions">
          <DialogClose asChild>
            <Button variant="ghost" size="sm" className="btn ghost small">关闭预览</Button>
          </DialogClose>
          {onRestore && (
            <DialogClose asChild>
              <Button size="sm" className="btn primary small" onClick={onRestore}>恢复此版本</Button>
            </DialogClose>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export interface LayoutPreviewReport {
  asset: Asset
  requiredWidth?: number
  clipsCanvas: boolean
}

export function AssetPreviewCanvas({ asset, layoutId, onLayoutPreview }: {
  asset: Asset
  layoutId?: string
  onLayoutPreview?: (report: LayoutPreviewReport | null) => void
}) {
  const view = useRef<HTMLDivElement>(null)
  const playback = useRef<{ player: AssetPlayer; draw: () => void } | null>(null)
  const [duration, setDuration] = useState(0)
  const [time, setTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const host = view.current
    if (!host) return
    const leafer = new Leafer({ view: host, width: host.clientWidth, height: host.clientHeight, hittable: false })
    try {
      const converted = convertSvg(parseSvgDocument(asset.svg), asset)
      const board = new Box({ width: Math.max(1, asset.width), height: Math.max(1, asset.height), overflow: 'hide' })
      leafer.add(board)
      board.add(converted.content)
      const player = new AssetPlayer(converted, asset)
      const layouts = applyAssetLayouts(converted, asset.layouts)
      if (layoutId) {
        const result = layouts.get(layoutId)
        const maxWidth = asset.layouts?.[layoutId]?.width
        const container = converted.elements.get(layoutId)
        leafer.updateLayout()
        const clipsCanvas = container?.children.some((child) => {
          const bounds = child.wrapper.getBounds('box', board)
          return bounds.x < -0.01 || bounds.y < -0.01 ||
            bounds.x + bounds.width > board.width + 0.01 || bounds.y + bounds.height > board.height + 0.01
        }) ?? false
        onLayoutPreview?.({
          asset,
          clipsCanvas,
          requiredWidth: result && maxWidth && result.width > maxWidth + 0.01 ? Math.ceil(result.width) : undefined,
        })
      } else {
        player.render(0)
      }
      const draw = () => leafer.forceRender(undefined, true)
      const resize = () => {
        const width = host.clientWidth
        const height = host.clientHeight
        if (!width || !height) return
        leafer.resize({ width, height })
        const scale = Math.min(width / board.width, height / board.height)
        board.set({ x: (width - board.width * scale) / 2, y: (height - board.height * scale) / 2, scaleX: scale, scaleY: scale })
        draw()
      }
      const observer = new ResizeObserver(resize)
      observer.observe(host)
      resize()
      playback.current = { player, draw }
      setDuration(!layoutId && player.groups.length ? player.lastFrameTime : 0)
      setTime(0)
      setPlaying(false)
      setFailed(false)
      return () => {
        observer.disconnect()
        playback.current = null
        leafer.destroy()
      }
    } catch (error) {
      leafer.destroy()
      console.error('无法预览素材版本', error)
      setFailed(true)
      onLayoutPreview?.(null)
    }
  }, [asset, layoutId, onLayoutPreview])

  useEffect(() => {
    const preview = playback.current
    if (!playing || !preview) return
    const { player, draw } = preview
    player.play()
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      player.tick((now - last) / 1000)
      last = now
      draw()
      setTime(player.time)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      player.pause()
    }
  }, [asset, playing])

  const seek = (position: number) => {
    const preview = playback.current
    if (!preview) return
    preview.player.seek(position)
    preview.draw()
    setTime(preview.player.time)
  }

  return (
    <>
      <div className="asset-preview-stage">
        <div ref={view} className="asset-preview-canvas" role="img" aria-label="此版本的素材画面" />
        {failed && <p role="status">无法显示此版本的预览。</p>}
      </div>
      {duration > 0 && !failed && (
        <div className="asset-preview-transport">
          <Button variant="outline" size="icon-sm" className="btn ghost small" onClick={() => setPlaying(!playing)}
            aria-label={playing ? '暂停预览' : '播放预览'} title={playing ? '暂停预览' : '播放预览'}>
            <Icon name={playing ? 'pause' : 'play'} size={14} />
          </Button>
          <input type="range" min={0} max={1000} step={1} value={Math.round(time / duration * 1000)}
            onChange={(event) => seek(event.currentTarget.valueAsNumber * duration / 1000)}
            aria-label="预览进度" aria-valuetext={`${time.toFixed(2)} 秒，共 ${duration.toFixed(2)} 秒`} />
          <span className="mono muted">{time.toFixed(2)} / {duration.toFixed(2)} s</span>
        </div>
      )}
    </>
  )
}
