import { useEffect, useRef, useState } from 'react'
import { Tabs } from 'radix-ui'
import { store } from '../store'
import type { Studio } from '../lib/studio'
import type { Asset } from '../types'
import { Icon } from './Icon'
import { SearchField } from './controls'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './kit/dropdown-menu'
import LayersPanel from './LayersPanel'
import AutoArrangeDialog from './AutoArrangeDialog'

const thumbs = new WeakMap<Asset, { svg: string; groups: Asset['groups']; url: string }>()

function thumbUrl(asset: Asset) {
  const cached = thumbs.get(asset)
  if (cached?.svg === asset.svg && cached.groups === asset.groups) return cached.url

  let markup = asset.svg
  if (asset.groups.length) {
    const doc = new DOMParser().parseFromString(asset.svg, 'image/svg+xml')
    const svg = doc.documentElement
    if (svg?.localName === 'svg') {
      const end = Math.max(...asset.groups.map((group) => group.delay + group.duration))
      const time = Math.max(0.6, Math.min(3, end * 0.82))
      const style = svg.getAttribute('style') || ''
      svg.setAttribute('style', `${style};--t:${time.toFixed(2)}s`)
      const pause = doc.createElementNS('http://www.w3.org/2000/svg', 'style')
      pause.textContent = '* { animation-play-state: paused !important; }'
      svg.prepend(pause)
      markup = new XMLSerializer().serializeToString(svg)
    }
  }

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
  thumbs.set(asset, { svg: asset.svg, groups: asset.groups, url })
  return url
}

export default function LeftPanel({ studio }: { studio: Studio | null }) {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState('assets')
  const importRef = useRef<HTMLInputElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)
  const assets = store.assets
  const q = query.trim().toLowerCase()
  const filtered = q ? assets.filter((asset) => asset.name.toLowerCase().includes(q)) : assets
  const activeId = store.selection.assetId
  const selectedAsset = store.selectedAsset

  useEffect(() => {
    if (store.leftOpen && tab === 'assets') {
      selectedRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }, [activeId, q, store.leftOpen, tab])

  const chooseFiles = () => importRef.current?.click()

  return (
    <Tabs.Root value={tab} onValueChange={setTab} asChild>
      <aside id="library" aria-label="素材与图层" className={`left-panel ${store.leftOpen ? '' : 'collapsed'}`}>
        <div className="panel-head">
          <Tabs.List className="library-tabs" aria-label="素材与图层页签">
            <Tabs.Trigger value="assets"><Icon name="shape" size={14} /> 素材</Tabs.Trigger>
            <Tabs.Trigger value="layers"><Icon name="layers" size={14} /> 图层</Tabs.Trigger>
          </Tabs.List>
        </div>

        <Tabs.Content value="assets" className="library-pane">
          <div className="library-search">
            <div className="library-search-row">
              <SearchField label="搜索素材" value={query} onChange={setQuery} />
              <button className="library-import" onClick={chooseFiles} title="导入 SVG 或图片" aria-label="导入 SVG 或图片">
                <Icon name="plus" size={15} />
              </button>
              <input
                ref={importRef}
                type="file"
                accept=".svg,.png,.jpg,.jpeg,.webp,.gif,.avif,image/svg+xml,image/*"
                multiple
                hidden
                onChange={(event) => {
                  if (event.target.files?.length) void store.importFiles(event.target.files)
                  event.target.value = ''
                }}
              />
            </div>
            {q && <span className="library-result" role="status">{filtered.length} / {assets.length} 项</span>}
          </div>
          <div className="asset-list">
            {filtered.map((asset) => {
              const animated = asset.groups.length > 0
              const enabled = asset.groups.filter((group) => group.enabled !== false).length
              const active = asset.id === activeId
              return (
                <div key={asset.id} className={`asset-item ${active ? 'active' : ''}`}>
                  <button
                    ref={active ? selectedRef : undefined}
                    className="asset-pick"
                    aria-pressed={active}
                    title={asset.name}
                    onClick={() => {
                      store.selectAsset(asset.id)
                      studio?.focusBoard(asset.id)
                    }}
                  >
                    <span className="thumb">
                      <img src={thumbUrl(asset)} alt="" loading="lazy" draggable={false} />
                    </span>
                    <span className="asset-meta">
                      <span className="asset-name">{asset.name}</span>
                      <span className="asset-sub">
                        <span className="mono">{Math.round(asset.width)}×{Math.round(asset.height)}</span>
                        <span>{animated ? `${enabled} 条动画` : '静态'}</span>
                      </span>
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="icon-btn asset-menu-trigger" title="素材操作" aria-label={`${asset.name}的操作`}>
                        <Icon name="more" size={15} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="library-menu">
                      <DropdownMenuItem onSelect={() => store.duplicateAsset(asset.id)}>
                        <Icon name="copy" size={14} /> 复制素材
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => store.saveVariant(asset)}>
                        <Icon name="copy" size={14} /> 另存为变体
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onSelect={() => {
                        if (confirm(`删除素材「${asset.name}」？`)) void store.removeAsset(asset.id)
                      }}>
                        <Icon name="trash" size={14} /> 删除素材
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
            {!filtered.length && (
              <div className="library-empty">
                <Icon name={q ? 'search' : 'shape'} size={19} />
                <strong>{q ? '没有匹配的素材' : '素材库为空'}</strong>
                <p>{q ? '换个关键词试试。' : '导入、拖入或粘贴 SVG 和图片。'}</p>
                <button className="btn ghost small" onClick={q ? () => setQuery('') : chooseFiles}>
                  {q ? '清除搜索' : '导入素材'}
                </button>
              </div>
            )}
          </div>
          <div className="panel-foot">
            <span><Icon name="upload" size={13} /> 拖入或粘贴</span>
            <AutoArrangeDialog />
          </div>
        </Tabs.Content>

        <Tabs.Content value="layers" className="library-pane">
          <LayersPanel key={selectedAsset?.id} asset={selectedAsset} studio={studio} onBrowse={() => setTab('assets')} />
        </Tabs.Content>
      </aside>
    </Tabs.Root>
  )
}
