import { useMemo } from 'react'
import { store } from '../store'
import { elementChangeDetail, sameAsset, sameElementProperties, type AssetVersion } from '../lib/history'
import type { Asset } from '../types'
import { Icon } from './Icon'
import { Button } from './kit/button'
import AssetVersionPreview from './AssetVersionPreview'

const timeFormat = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })

export default function InspectorHistory({ asset, elementId }: { asset: Asset; elementId?: string }) {
  const entries = store.historyEntries
  const rows = useMemo(() => entries.flatMap((entry) => {
    const change = entry.changes.find(({ id }) => id === asset.id)
    if (!change) return []
    const { before, after } = change
    if (!elementId) return [{ entry, before, after, detail: '' }]
    // 元素 ID 取决于源 SVG 的结构，换源后的相同 ID 可能是另一个元素。
    if (before?.asset.svg !== asset.svg || after?.asset.svg !== asset.svg) return []
    const detail = elementChangeDetail(before.asset, after.asset, elementId)
    return detail ? [{ entry, before, after, detail }] : []
  }), [asset.id, asset.svg, elementId, entries])
  const oldest = rows[0]?.before
  const label = elementId ? '元素历史' : '素材版本'

  const versionAction = (version: AssetVersion | undefined, versionLabel: string) => {
    if (!version) return null
    if (!elementId) {
      const current = sameAsset(asset, version.asset)
      const restore = current ? undefined : () => store.restoreAssetVersion(version)
      return (
        <div className="history-row-actions">
          <AssetVersionPreview asset={version.asset} label={versionLabel} onRestore={restore} />
          {current
            ? <span className="history-status">当前版本</span>
            : <Button variant="outline" size="xs" onClick={restore}>恢复此版本</Button>}
        </div>
      )
    }
    if (sameElementProperties(asset, version.asset, elementId)) return null
    return (
      <Button
        variant="outline"
        size="xs"
        onClick={() => store.restoreElementVersion(asset.id, elementId, version.asset)}
      >
        恢复样式和布局
      </Button>
    )
  }

  return (
    <details className="inspector-history">
      <summary>
        <Icon name="history" size={14} />
        <span>{label}</span>
        <span className="muted">{rows.length} 条</span>
        <Icon name="chevron" size={13} className="inspector-history-chevron" />
      </summary>
      {rows.length === 0 ? (
        <p className="history-empty">{elementId ? '此元素还没有修改记录。' : '此素材还没有版本记录。'}</p>
      ) : (
        <>
          {elementId && <p className="inspector-history-note">可单独恢复此元素的样式和布局。</p>}
          <ol className="history-list" aria-label={label}>
            {[...rows].reverse().map(({ entry, after, detail }) => {
              const status = store.undoEntries.includes(entry.id) ? '' : store.redoEntries.includes(entry.id) ? '已撤销' : '旧分支'
              return (
                <li key={entry.id} className="history-row">
                  <div className="history-row-info">
                    <strong>{entry.label}{status && <span className="history-status">{status}</span>}</strong>
                    {detail && <span className="history-meta">{detail}</span>}
                    <time className="history-meta" dateTime={new Date(entry.time).toISOString()}>{timeFormat.format(entry.time)}</time>
                  </div>
                  {versionAction(after, `${entry.label} · ${timeFormat.format(entry.time)}`)}
                </li>
              )
            })}
            {oldest && (
              <li className="history-row">
                <strong>最早保留版本</strong>
                {versionAction(oldest, '最早保留版本')}
              </li>
            )}
          </ol>
        </>
      )}
    </details>
  )
}
