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

/** 版本对比：所有历史版本并排铺开，直接比差异，不用一版一版翻 */
export default function AssetVersions({ asset }: { asset: Asset }) {
  const [open, setOpen] = useState(false)
  const [versions, setVersions] = useState<AssetVersionRecord[]>([])
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')

  const reload = useCallback(async () => {
    setVersions(await store.listVersions(asset.id))
  }, [asset.id])

  useEffect(() => {
    if (open) void reload()
  }, [open, reload, asset.revision?.index])

  const restore = async (version: AssetVersionRecord) => {
    setBusyId(version.id)
    setError('')
    try {
      await store.restoreVersion(asset.id, version.id)
      await reload()
    } catch (err) {
      setError((err as Error)?.message || String(err))
    } finally {
      setBusyId('')
    }
  }

  const saveCurrent = async () => {
    await store.commitVersion(asset.id)
    await reload()
  }

  const ordered = [...versions].sort((a, b) => a.index - b.index)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="xs" title="并排对比这个素材的历史版本">
          <Icon name="history" size={12} /> 版本
        </Button>
      </DialogTrigger>
      <DialogContent className="asset-preview-dialog version-dialog">
        <DialogHeader className="history-header">
          <DialogTitle>版本对比</DialogTitle>
          <DialogDescription>
            {asset.name || '未命名素材'} · 共 {versions.length} 个版本，从左到右按时间排 · 点任意一版恢复
          </DialogDescription>
        </DialogHeader>

        {error && <p className="qv-note qv-err">{error}</p>}

        {ordered.length ? (
          <div className="version-grid">
            {ordered.map((version) => (
              <figure className="version-card" key={version.id}>
                <div className="version-shot">
                  <img
                    src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(version.svg)}`}
                    alt={`版本 ${version.index}`}
                    loading="lazy"
                  />
                </div>
                <figcaption>
                  <b>v{version.index}</b>
                  <span className="qv-mono">
                    {version.width}×{version.height}
                  </span>
                  <span className="version-time">
                    {new Date(version.createdAt).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </figcaption>
                {version.label && <p className="version-label">{version.label}</p>}
                <Button
                  variant="outline"
                  size="xs"
                  disabled={busyId === version.id}
                  onClick={() => void restore(version)}
                >
                  {busyId === version.id ? '恢复中…' : '恢复到此版本'}
                </Button>
              </figure>
            ))}
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
