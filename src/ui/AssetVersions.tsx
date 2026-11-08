import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { Asset } from '../types'
import type { Studio } from '../lib/studio'
import { store, type AssetVersionRecord } from '../store'
import { Button } from './kit/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './kit/dialog'
import { Icon } from './Icon'
import PlaybackControls from './PlaybackControls'
import VersionStage, { type VersionStageHandle } from './VersionStage'

const stamp = (version: AssetVersionRecord) =>
  new Date(version.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/** 版本对比：左右各自选版本，默认最后一版对前一版，像文本 diff */
export default function AssetVersions({ asset, studio }: { asset: Asset; studio?: Studio | null }) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<AssetVersionRecord[]>([])
  const [leftIndex, setLeftIndex] = useState(0)
  const [rightIndex, setRightIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const leftStage = useRef<VersionStageHandle>(null)
  const rightStage = useRef<VersionStageHandle>(null)

  const reload = useCallback(async () => {
    setVersions(await store.listVersions(asset.id))
  }, [asset.id])

  useEffect(() => {
    void reload()
  }, [reload, asset.revision?.index])

  const ordered = [...versions].sort((a, b) => a.index - b.index)

  useEffect(() => {
    const count = ordered.length
    if (!count) return
    setRightIndex(count - 1)
    setLeftIndex(Math.max(0, count - 2))
  }, [versions.length])

  const left = ordered[leftIndex]
  const right = ordered[rightIndex]

  const stages = () => [leftStage.current, rightStage.current]

  useEffect(() => {
    if (!open || !ordered.length) {
      setPlaying(false)
      return
    }
    // 打开就开始播：和以前预览里动画自动跑起来一致
    setPlaying(true)
  }, [open, ordered.length])

  const showLastFrame = () => {
    stages().forEach((stage) => stage?.showLastFrame())
    setPlaying(false)
  }

  /** 一侧播完不代表另一侧播完，都不播了才把按钮切回「播放」 */
  const handleEnded = () => {
    if (!stages().some((stage) => stage?.isPlaying())) setPlaying(false)
  }

  const toggleLoop = () => {
    const next = !store.loop
    store.setLoop(next)
    studio?.setLoop(next)
  }

  const restore = async (target: AssetVersionRecord | undefined) => {
    if (!target) return
    setBusy(true)
    setError('')
    try {
      await store.restoreVersion(asset.id, target.id)
      await reload()
    } catch (err) {
      setError((err as Error)?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  const saveCurrent = async () => {
    await store.commitVersion(asset.id)
    await reload()
  }

  const pane = (
    version: AssetVersionRecord | undefined,
    index: number,
    onPick: (value: number) => void,
    side: string,
    ref: RefObject<VersionStageHandle | null>,
  ) => (
    <figure className="version-pane">
      <select
        className="select"
        aria-label={`${side}版本`}
        value={index}
        onChange={(event) => onPick(Number(event.target.value))}
      >
        {ordered.map((item, i) => (
          <option key={item.id} value={i}>
            v{item.index} · {item.width}×{item.height} · {stamp(item)}
          </option>
        ))}
      </select>
      <div className="version-shot">
        {version ? (
          <VersionStage
            key={version.id}
            ref={ref}
            version={version}
            playing={playing}
            loop={store.loop}
            onEnded={handleEnded}
            label={`${side}版本 v${version.index} 的画面`}
          />
        ) : (
          <span className="version-empty">没有版本</span>
        )}
      </div>
    </figure>
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button type="button" className="version-entry-card" title="对比这个素材的历史版本">
          <Icon name="history" size={16} />
          <span className="version-entry-text">
            <strong>版本历史</strong>
            <span>
              {versions.length
                ? `${versions.length} 个版本 · 点这里并排对比，可恢复任意一版`
                : '还没有记录，点这里查看'}
            </span>
          </span>
          <Icon name="chevronRight" size={14} />
        </button>
      </DialogTrigger>
      <DialogContent className="asset-preview-dialog version-dialog" aria-describedby={undefined}>
        <DialogHeader className="history-header version-header">
          <DialogTitle>版本对比</DialogTitle>
          <PlaybackControls
            playing={playing}
            loop={store.loop}
            disabled={!ordered.length}
            ariaLabel="版本对比播放控制"
            noneReason="还没有版本可播放"
            onTogglePlay={() => setPlaying(!playing)}
            onShowLastFrame={showLastFrame}
            onToggleLoop={toggleLoop}
          />
        </DialogHeader>

        {error && <p className="qv-note qv-err">{error}</p>}

        {ordered.length ? (
          <div className="version-compare">
            {pane(left, leftIndex, setLeftIndex, '左侧', leftStage)}
            {pane(right, rightIndex, setRightIndex, '右侧', rightStage)}
          </div>
        ) : (
          <p className="qv-note">还没有版本记录。点下面的「存为新版本」开始记录。</p>
        )}

        <div className="asset-preview-actions">
          <DialogClose asChild>
            <Button variant="ghost" size="sm" className="btn ghost small">关闭</Button>
          </DialogClose>
          <Button variant="outline" size="sm" className="btn ghost small" onClick={() => void saveCurrent()}>
            存为新版本
          </Button>
          <Button
            size="sm"
            className="btn primary small"
            disabled={!right || busy}
            onClick={() => void restore(right)}
          >
            {busy ? '恢复中…' : `恢复到 v${right?.index ?? ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
