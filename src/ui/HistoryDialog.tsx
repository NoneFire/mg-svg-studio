import { useRef } from 'react'
import { store } from '../store'
import { HISTORY_LIMIT, sameAsset, sameValue, type AssetChange, type HistorySnapshot } from '../lib/history'
import { Button } from './kit/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './kit/dialog'
import { Icon } from './Icon'
import AssetVersionPreview from './AssetVersionPreview'

const timeFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium' })

function changeDetail(change: AssetChange | undefined) {
  const before = change?.before?.asset
  const after = change?.after?.asset
  if (!before || !after) return null
  if (before.videoCopy !== after.videoCopy || before.voiceoverAudio !== after.voiceoverAudio) {
    return [before.videoCopy !== after.videoCopy && '视频文案', before.voiceoverAudio !== after.voiceoverAudio && '录音']
      .filter(Boolean).join('、')
  }
  if (before.x !== after.x || before.y !== after.y) {
    const point = (x: number, y: number) => `(${Math.round(x)}, ${Math.round(y)})`
    return `${point(before.x, before.y)} → ${point(after.x, after.y)}`
  }
  const touched = new Set([
    ...Object.keys(before.overrides), ...Object.keys(after.overrides),
    ...Object.keys(before.layouts ?? {}), ...Object.keys(after.layouts ?? {}),
  ])
  const elements = [...touched].filter((id) =>
    !sameValue(before.overrides[id], after.overrides[id]) || !sameValue(before.layouts?.[id], after.layouts?.[id]),
  )
  if (elements.length) {
    return elements.map((id) => after.elements?.find((element) => element.id === id)?.label ?? id).join('、')
  }
  if (!sameValue(before.groups, after.groups)) {
    const from = new Map(before.groups.map((group) => [group.id, group]))
    const to = new Map(after.groups.map((group) => [group.id, group]))
    const ids = new Set([...from.keys(), ...to.keys()])
    return [...ids].filter((id) => !sameValue(from.get(id), to.get(id)))
      .map((id) => (to.get(id) ?? from.get(id)).name).join('、')
  }
  return null
}


export default function HistoryDialog() {
  const scope = store.historyScope
  const returnFocus = useRef<HTMLElement | null>(null)
  if (scope === null) return null

  const names = new Map(store.assets.map((asset) => [asset.id, asset.name]))
  const entries = [...store.historyEntries].reverse()
  for (const { changes } of entries) {
    for (const { id, before, after } of changes) {
      if (!names.has(id)) names.set(id, after?.asset.name ?? before.asset.name)
    }
  }
  const asset = scope ? store.assets.find(({ id }) => id === scope) : undefined
  const scopedEntries = scope ? entries.filter(({ changes }) => changes.some(({ id }) => id === scope)) : entries
  const oldest = scopedEntries[scopedEntries.length - 1]?.changes.find(({ id }) => id === scope)?.before
  const applied = new Set(store.undoEntries)
  const redo = new Set(store.redoEntries)

  const versionAction = (version: HistorySnapshot | undefined, label: string) => {
    if (!version) return null
    const current = asset && sameAsset(version.asset, asset)
    const restore = current ? undefined : () => store.restoreAssetVersion(version)
    return (
      <div className="history-row-actions">
        <AssetVersionPreview asset={version.asset} label={label} onRestore={restore} />
        {current
          ? <span className="history-status">当前版本</span>
          : <Button variant="outline" size="xs" onClick={restore}>恢复此版本</Button>}
      </div>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) store.closeHistory() }}>
      <DialogContent
        className="history-dialog"
        onOpenAutoFocus={() => {
          const active = document.activeElement
          returnFocus.current = active instanceof HTMLElement &&
            active.matches('button, input, textarea, select, a[href], [tabindex]') &&
            !active.closest('[role="dialog"]') ? active : null
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const target = returnFocus.current?.isConnected ? returnFocus.current : document.getElementById('project-menu-trigger')
          target?.focus()
        }}
      >
        <DialogHeader className="history-header">
          <DialogTitle>历史记录</DialogTitle>
          <DialogDescription>查看画布操作，或恢复单个素材的旧版本。最近 {HISTORY_LIMIT} 条操作保存在本机。</DialogDescription>
        </DialogHeader>
        <div className="history-toolbar">
          <select className="select" aria-label="历史范围" value={scope} onChange={(event) => store.showHistory(event.target.value)}>
            <option value="">整个画布</option>
            {Array.from(names, ([id, name]) => (
              <option key={id} value={id}>{name || '未命名素材'}</option>
            ))}
          </select>
          <Button variant="outline" size="sm" title="撤销画布上的最近一步" disabled={!store.canUndo} onClick={() => store.undo()}>
            <Icon name="undo" size={14} /> 撤销
          </Button>
          <Button variant="outline" size="sm" title="重做画布上的最近一步" disabled={!store.canRedo} onClick={() => store.redo()}>
            <Icon name="redo" size={14} /> 重做
          </Button>
        </div>
        {store.workspaceSaveError && (
          <div role="status">
            <p className="history-error">{store.workspaceSaveError}</p>
            <Button variant="outline" size="xs" onClick={() => void store.flushWorkspace({ retry: true })}>重试保存</Button>
          </div>
        )}
        {scopedEntries.length ? (
          <ol className="history-list" aria-label={scope ? '素材版本' : '画布操作'}>
            {scopedEntries.map((entry) => {
              const change = scope ? entry.changes.find(({ id }) => id === scope) : undefined
              const affected = entry.changes.map(({ before, after }) => (after ?? before).asset.name || '未命名素材')
              const summary = change?.before && change.after && change.before.asset.name !== change.after.asset.name
                ? `${change.before.asset.name} → ${change.after.asset.name}`
                : change ? (change.after ?? change.before).asset.name
                : affected.length > 3 ? `${affected.slice(0, 3).join('、')} 等 ${affected.length} 个素材` : affected.join('、')
              const detail = changeDetail(change ?? (entry.changes.length === 1 ? entry.changes[0] : undefined))
              const status = applied.has(entry.id) ? '' : redo.has(entry.id) ? '已撤销' : '旧分支'
              return (
                <li key={entry.id} className="history-row">
                  <div className="history-row-info">
                    <strong>{entry.label}{status && <span className="history-status">{status}</span>}</strong>
                    <span className="history-meta" title={detail ? `${summary} · ${detail}` : summary}>
                      {summary}{detail && ` · ${detail}`}
                    </span>
                    <time dateTime={new Date(entry.time).toISOString()} className="history-meta">{timeFormat.format(entry.time)}</time>
                  </div>
                  {scope ? versionAction(change?.after, `${entry.label} · ${timeFormat.format(entry.time)}`) : entry.changes.length === 1 && (
                    <Button variant="ghost" size="xs" onClick={() => store.showHistory(entry.changes[0].id)}>查看素材版本</Button>
                  )}
                </li>
              )
            })}
            {oldest && (
              <li className="history-row">
                <div className="history-row-info">
                  <strong>最早可恢复版本</strong>
                  <span className="history-meta">{oldest.asset.name}</span>
                </div>
                {versionAction(oldest, '最早可恢复版本')}
              </li>
            )}
          </ol>
        ) : <p className="history-empty">{scope ? '此素材还没有版本记录。' : '画布还没有操作记录。'}</p>}
      </DialogContent>
    </Dialog>
  )
}
