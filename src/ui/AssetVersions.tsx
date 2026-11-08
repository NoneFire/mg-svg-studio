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

/** 版本对比：左边上一版，右边选中版，一次看两版 */
export default function AssetVersions({ asset }: { asset: Asset }) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<AssetVersionRecord[]>([])
  const [cursor, setCursor] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    const list = await store.listVersions(asset.id)
    setVersions(list)
  }, [asset.id])

  useEffect(() => {
    if (open) void reload()
  }, [open, reload, asset.revision?.index])

  const ordered = [...versions].sort((a, b) => a.index - b.index)

  useEffect(() => {
    setCursor(Math.max(0, ordered.length - 1))
  }, [versions.length])

  const current = ordered[cursor]
  const previous = cursor > 0 ? ordered[cursor - 1] : null

  const restore = async () => {
    if (!current) return
    setBusy(true)
    setError('')
    try {
      await store.restoreVersion(asset.id, current.id)
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

  const shot = (version: AssetVersionRecord) => (
    <img
      src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(version.svg)}`}
      alt={`版本 ${version.index}`}
    />
  )

  const stamp = (version: AssetVersionRecord) =>
    new Date(version.createdAt).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

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
            {asset.name || '未命名素材'} · 共 {ordered.length} 个版本 · 左边是上一版，右边是选中的这版
          </DialogDescription>
        </DialogHeader>

        {error && <p className="qv-note qv-err">{error}</p>}

        {ordered.length ? (
          <>
            <div className="version-compare">
              <figure>
                <div className="version-shot">
                  {previous ? shot(previous) : <span className="version-empty">没有更早的版本</span>}
                </div>
                <figcaption>
                  {previous ? (
                    <>
                      <b>v{previous.index}</b>
                      <span className="qv-mono">{previous.width}×{previous.height}</span>
                      <span className="version-time">{stamp(previous)}</span>
                    </>
                  ) : (
                    <span className="qv-mono">—</span>
                  )}
                </figcaption>
              </figure>
              <figure>
                <div className="version-shot">{current ? shot(current) : null}</div>
                <figcaption>
                  <b>v{current?.index}</b>
                  <span className="qv-mono">{current?.width}×{current?.height}</span>
                  <span className="version-time">{current && stamp(current)}</span>
                </figcaption>
              </figure>
            </div>

            <div className="version-strip" role="tablist" aria-label="版本列表">
              {ordered.map((version, index) => (
                <button
                  key={version.id}
                  role="tab"
                  aria-selected={index === cursor}
                  className={`version-chip ${index === cursor ? 'active' : ''}`}
                  onClick={() => setCursor(index)}
                  title={`v${version.index} · ${stamp(version)}`}
                >
                  v{version.index}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="qv-note">还没有版本记录。点下面的「存为新版本」开始记录。</p>
        )}

        <div className="asset-preview-actions">
          {error && <span className="qv-note qv-err">{error}</span>}
          <DialogClose asChild>
            <Button variant="ghost" size="sm" className="btn ghost small">关闭</Button>
          </DialogClose>
          <Button variant="outline" size="sm" className="btn ghost small" onClick={() => void saveCurrent()}>
            存为新版本
          </Button>
          <Button
            size="sm"
            className="btn primary small"
            disabled={!current || busy}
            onClick={() => void restore()}
          >
            {busy ? '恢复中…' : `恢复到此版本 v${current?.index ?? ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
