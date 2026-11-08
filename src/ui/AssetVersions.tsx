import { useCallback, useEffect, useState } from 'react'
import type { Asset } from '../types'
import { store, type AssetVersionRecord } from '../store'
import { Button } from './kit/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './kit/dialog'
import { Icon } from './Icon'

const stamp = (version: AssetVersionRecord) =>
  new Date(version.createdAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

/** 版本对比：左右各自选版本，默认最后一版对前一版，像文本 diff */
export default function AssetVersions({ asset }: { asset: Asset }) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<AssetVersionRecord[]>([])
  const [leftIndex, setLeftIndex] = useState(0)
  const [rightIndex, setRightIndex] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setVersions(await store.listVersions(asset.id))
  }, [asset.id])

  useEffect(() => {
    if (open) void reload()
  }, [open, reload, asset.revision?.index])

  const ordered = [...versions].sort((a, b) => a.index - b.index)

  useEffect(() => {
    const count = ordered.length
    if (!count) return
    setRightIndex(count - 1)
    setLeftIndex(Math.max(0, count - 2))
  }, [versions.length])

  const left = ordered[leftIndex]
  const right = ordered[rightIndex]

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
  ) => (
    <figure className="version-pane">
      <select
        className="qv-tool-select"
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
          <img
            src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(version.svg)}`}
            alt={`版本 ${version.index}`}
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
        <Button variant="outline" size="xs" title="对比这个素材的历史版本">
          <Icon name="history" size={12} /> 版本
        </Button>
      </DialogTrigger>
      <DialogContent className="asset-preview-dialog version-dialog">
        <DialogHeader className="history-header">
          <DialogTitle>版本对比</DialogTitle>
          <DialogDescription>
            {asset.name || '未命名素材'} · 共 {ordered.length} 个版本 · 左右各自选，默认最后一版对前一版
          </DialogDescription>
        </DialogHeader>

        {error && <p className="qv-note qv-err">{error}</p>}

        {ordered.length ? (
          <div className="version-compare">
            {pane(left, leftIndex, setLeftIndex, '左侧')}
            {pane(right, rightIndex, setRightIndex, '右侧')}
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
