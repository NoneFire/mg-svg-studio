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
import { AssetPreviewCanvas } from './AssetVersionPreview'
import { Icon } from './Icon'

/** 版本时间轴：最新在最左，左滑回看更早的版本 */
export default function AssetVersions({ asset }: { asset: Asset }) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<AssetVersionRecord[]>([])
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    const list = await store.listVersions(asset.id)
    setVersions(list)
    setCursor((current) => Math.min(current, Math.max(0, list.length - 1)))
  }, [asset.id])

  useEffect(() => {
    if (open) void reload()
  }, [open, reload, asset.revision?.index])

  const current = versions[cursor]
  const view: Asset = current
    ? { ...asset, svg: current.svg, width: current.width, height: current.height }
    : asset

  const step = (delta: number) =>
    setCursor((index) => Math.max(0, Math.min(versions.length - 1, index + delta)))

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      // 左箭头 = 更早的版本
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        step(1)
      } else if (event.key === 'ArrowRight') {
        event.preventDefault()
        step(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, versions.length])

  const restore = async () => {
    if (!current) return
    setBusy(true)
    setError('')
    try {
      await store.restoreVersion(asset.id, current.id)
      await reload()
      setCursor(0)
    } catch (err) {
      setError((err as Error)?.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  const saveCurrent = async () => {
    await store.commitVersion(asset.id)
    await reload()
    setCursor(0)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs" title="按时间回看这个素材的历史版本">
          <Icon name="history" size={12} /> 版本
        </Button>
      </DialogTrigger>
      <DialogContent className="asset-preview-dialog">
        <DialogHeader className="history-header">
          <DialogTitle>版本时间轴</DialogTitle>
          <DialogDescription>
            {asset.name || '未命名素材'} · 共 {versions.length} 个版本
            {current ? ` · 正在看 v${current.index}` : ''} · 左滑看更早
          </DialogDescription>
        </DialogHeader>

        <div className="version-stage">
          <button
            className="version-arrow"
            onClick={() => step(1)}
            disabled={cursor >= versions.length - 1}
            aria-label="更早的版本"
          >
            <Icon name="chevronLeft" size={16} />
          </button>
          <div className="version-canvas">
            <AssetPreviewCanvas asset={view} />
          </div>
          <button
            className="version-arrow"
            onClick={() => step(-1)}
            disabled={cursor <= 0}
            aria-label="更新的版本"
          >
            <Icon name="chevronRight" size={16} />
          </button>
        </div>

        <div className="version-strip" role="tablist" aria-label="版本列表">
          {versions.length ? (
            versions.map((version, index) => (
              <button
                key={version.id}
                role="tab"
                aria-selected={index === cursor}
                className={`version-chip ${index === cursor ? 'active' : ''}`}
                onClick={() => setCursor(index)}
                title={`v${version.index} · ${new Date(version.createdAt).toLocaleString()}`}
              >
                <b>v{version.index}</b>
                <span>{new Date(version.createdAt).toLocaleDateString()}</span>
              </button>
            ))
          ) : (
            <span className="qv-note">还没有保存过版本。点右下角「存为新版本」开始记录。</span>
          )}
        </div>

        <div className="asset-preview-actions">
          {error && <span className="qv-note qv-err">{error}</span>}
          <DialogClose asChild>
            <Button variant="ghost" size="sm" className="btn ghost small">
              关闭
            </Button>
          </DialogClose>
          <Button variant="outline" size="sm" className="btn ghost small" onClick={() => void saveCurrent()}>
            存为新版本
          </Button>
          <Button size="sm" className="btn primary small" disabled={!current || busy} onClick={() => void restore()}>
            {busy ? '恢复中…' : '恢复到此版本'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
