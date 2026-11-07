import { useCallback, useEffect, useMemo, useState } from 'react'
import { store } from '../store'
import type { Studio } from '../lib/studio'
import type { Asset } from '../types'
import { Icon } from './Icon'
import { SearchField } from './controls'

export default function LayersPanel({ asset, studio, onBrowse }: { asset?: Asset; studio: Studio | null; onBrowse: () => void }) {
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const revealSelected = useCallback((row: HTMLDivElement | null) => {
    if (store.leftOpen) row?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [store.leftOpen])
  const elements = asset ? studio?.getBoard(asset.id)?.content.elements : undefined
  const groups = asset?.groups
  const selectedId = store.selection.elementId
  const { list, byId, parentIds } = useMemo(() => {
    const animated = new Set(groups?.filter((group) => group.enabled !== false)
      .flatMap((group) => group.targetIds?.length ? group.targetIds : [group.targetId]))
    const parentIds = new Map<string, string>()
    const list = Array.from(elements?.values() ?? [], (element) => {
      const { id, label, depth, tag, kind } = element.el
      element.children.forEach((child) => parentIds.set(child.el.id, id))
      return { id, label, depth, tag, kind, count: element.children.length, animated: animated.has(id) }
    })
    return { list, byId: new Map(list.map((row) => [row.id, row])), parentIds }
  }, [elements, groups])
  const q = query.trim().toLowerCase()
  const multi = new Set(store.multiSelect.filter((id) => byId.has(id)))

  useEffect(() => {
    if (!selectedId) return
    const ancestors: string[] = []
    for (let id = parentIds.get(selectedId); id; id = parentIds.get(id)) ancestors.push(id)
    setExpanded((previous) => {
      if (ancestors.every((id) => previous[id] ?? byId.get(id)!.depth <= 1)) return previous
      const next = { ...previous }
      for (const id of ancestors) next[id] = true
      return next
    })
  }, [selectedId, byId, parentIds])

  if (!asset) {
    return (
      <div className="library-empty">
        <Icon name="layers" size={19} />
        <strong>未选中素材</strong>
        <p>选一张素材查看它的图层与元素。</p>
        <button className="btn ghost small" onClick={onBrowse}>打开素材列表</button>
      </div>
    )
  }

  const hidden = new Set<string>()
  const visible = list.filter((row) => {
    if (q) return [row.label, row.tag, row.id].some((value) => value.toLowerCase().includes(q))
    const parent = byId.get(parentIds.get(row.id) ?? '')
    if (!parent || (!hidden.has(parent.id) && (expanded[parent.id] ?? parent.depth <= 1))) return true
    hidden.add(row.id)
    return false
  })

  return (
    <>
      <div className="layers-head">
        <strong className="layers-title" title={asset.name}>{asset.name}</strong>
        <span className="layers-count">{list.length} 个元素</span>
      </div>
      <div className="library-search">
        <SearchField label="搜索图层或元素 ID" value={query} onChange={setQuery} />
        {q && <span className="library-result" role="status">{visible.length} / {list.length} 项</span>}
      </div>
      <div className="layers-body">
        {visible.map((row) => {
          const active = row.id === selectedId
          const picked = multi.has(row.id)
          const open = expanded[row.id] ?? row.depth <= 1
          return (
            <div
              key={row.id}
              ref={active ? revealSelected : undefined}
              className={`tree-row ${active ? 'active' : ''} ${picked ? 'multi' : ''}`}
              style={{ paddingLeft: 4 + (q ? 0 : Math.min(6, Math.max(0, row.depth - 1))) * 10 }}
            >
              {row.count > 0 && !q ? (
                <button
                  className="tree-disclosure"
                  aria-expanded={open}
                  aria-label={`${open ? '折叠' : '展开'} ${row.label}`}
                  onClick={() => setExpanded((previous) => ({ ...previous, [row.id]: !open }))}
                >
                  <Icon name={open ? 'chevronDown' : 'chevron'} size={13} />
                </button>
              ) : <span className="tree-indent" aria-hidden="true" />}
              <button
                className="tree-pick"
                title={`${row.label} · ${row.id}`}
                aria-pressed={multi.size ? picked : active}
                onClick={(event) => {
                  if (event.metaKey || event.ctrlKey || event.shiftKey) store.toggleMultiSelect(row.id)
                  else {
                    store.clearMultiSelect()
                    store.selectElement(asset.id, row.id)
                  }
                }}
              >
                <Icon name={row.kind === 'text' ? 'text' : row.kind === 'group' ? 'layers' : 'shape'} size={13} />
                <span className="tree-label">{row.label}</span>
                {row.animated && <span className="anim-mark" title="有启用的动画轨道" />}
                {row.count > 0 ? <span className="tree-tag" title={`${row.count} 个直接子元素`}>{row.count}</span> :
                  row.label !== row.tag && <span className="tree-tag mono">{row.tag}</span>}
              </button>
            </div>
          )
        })}
        {!visible.length && (
          <div className="library-empty">
            <Icon name={q ? 'search' : 'layers'} size={19} />
            <strong>{q ? '没有匹配的元素' : '没有可编辑的元素'}</strong>
            {q && <button className="btn ghost small" onClick={() => setQuery('')}>清除搜索</button>}
          </div>
        )}
      </div>
      <div className="panel-foot">
        {multi.size > 0 ? (
          <>
            <span role="status">已多选 {multi.size} 个元素</span>
            <button onClick={() => store.clearMultiSelect()}>清空多选</button>
          </>
        ) : <span>⌘ / Ctrl / Shift + 点击多选</span>}
      </div>
    </>
  )
}
