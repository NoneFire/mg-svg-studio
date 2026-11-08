import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import AssetVersions from './AssetVersions'
import { Tabs } from 'radix-ui'
import { store } from '../store'
import type { Studio } from '../lib/studio'
import type { AnimGroup, Asset, Keyframe, PropTrack, StylePatch } from '../types'
import { Icon } from './Icon'
import { Chip, ColorField, Field, IconButton, NumberInput, ResizeHandle, Select, TextInput } from './controls'
import { groupColor } from './Timeline'
import GroupLayout from './GroupLayout'
import VideoCopyEditor from './VideoCopyEditor'

const ReviewPanel = lazy(() => import('./ReviewPanel'))

const INSPECTOR_TABS = [
  { id: 'asset', label: '素材', icon: 'settings', Panel: AssetPanel },
  { id: 'anim', label: '动画', icon: 'animation', Panel: AnimPanel },
  { id: 'element', label: '元素', icon: 'shape', Panel: ElementPanel },
  { id: 'review', label: '评审', icon: 'sparkle', Panel: ReviewPanel },
] as const

type Tab = (typeof INSPECTOR_TABS)[number]['id']
const WIDTH_KEY = 'mg-inspector-width'
const MIN_WIDTH = 280
const MAX_WIDTH = 640

const EASES = [
  'linear',
  'ease',
  'ease-in',
  'ease-out',
  'ease-in-out',
  'power1.out',
  'power2.inOut',
  'power3.out',
  'expo.out',
  'back.out(1.7)',
  'elastic.out(1, 0.3)',
  'steps(6, end)',
]

const TRACK_PROPS = ['opacity', 'transform', 'letter-spacing', 'fill', 'stroke', 'stroke-width']

export default function Inspector({ studio }: { studio: Studio | null }) {
  const asset = store.selectedAsset
  const [tab, setTab] = useState<Tab>('asset')
  const panelRef = useRef<HTMLElement>(null)
  const [bounds, setBounds] = useState({ min: MIN_WIDTH, max: MAX_WIDTH, initial: 360 })
  const [preferredWidth, setPreferredWidth] = useState(() => {
    try {
      const width = Number(localStorage.getItem(WIDTH_KEY))
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) return width
    } catch {}
    return null
  })
  const clampWidth = (width: number) => Math.min(bounds.max, Math.max(bounds.min, Math.round(width)))
  const width = clampWidth(preferredWidth ?? bounds.initial)

  useEffect(() => {
    const stage = panelRef.current?.parentElement
    if (!stage) return
    const measure = () => {
      const compact = window.innerWidth <= 760
      const available = compact ? window.innerWidth : stage.clientWidth
      const min = Math.min(MIN_WIDTH, available)
      const max = Math.min(MAX_WIDTH, compact ? available : Math.max(min, available - 160))
      const initial = window.innerWidth > 1180 || compact ? 360 : 320
      setBounds((prev) => prev.min === min && prev.max === max && prev.initial === initial ? prev : { min, max, initial })
    }
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    window.addEventListener('resize', measure)
    measure()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // 外部请求（URL ?review= / CLI）直接切到评审页签
  useEffect(() => {
    if (store.reviewRequest) setTab('review')
  }, [store.reviewRequest])

  useEffect(() => {
    // 评审页签里点元素是为了定位证据，别把人弹走
    setTab((cur) => {
      if (cur === 'review') return cur
      if (store.selection.elementId) return 'element'
      if (store.inspectorFocusVersion && store.selection.assetId) return 'asset'
      return store.selection.assetId && cur === 'element' ? 'asset' : cur
    })
  }, [store.selection.elementId, store.selection.assetId, store.inspectorFocusVersion])

  return (
    <Tabs.Root value={tab} onValueChange={(value) => setTab(value as Tab)} asChild>
      <aside
        ref={panelRef}
        id="inspector"
        aria-label="检查器"
        className={`inspector ${store.rightOpen ? '' : 'closed'}`}
        style={{ width }}
      >
        <ResizeHandle
          axis="x"
          className="inspector-resize"
          label="检查器宽度"
          title="拖动调整宽度"
          controls="inspector"
          min={bounds.min}
          max={bounds.max}
          value={width}
          onResize={(next, commit) => {
            setPreferredWidth(next)
            if (commit) {
              try { localStorage.setItem(WIDTH_KEY, String(next)) } catch {}
            }
          }}
        />
        {asset && (
          <div className="inspector-head">
            <Tabs.List className="inspector-tabs" aria-label="检查器页签">
              {INSPECTOR_TABS.map(({ id, label, icon }) => (
                <Tabs.Trigger key={id} value={id}>
                  <Icon name={icon} size={14} /> {label}
                </Tabs.Trigger>
              ))}
            </Tabs.List>
          </div>
        )}
        {asset ? (
          INSPECTOR_TABS.map(({ id, Panel }) => (
            <Tabs.Content key={id} value={id} className="inspector-body">
              <Suspense fallback={<div className="inspector-empty" role="status">正在加载面板…</div>}>
                <Panel asset={asset} studio={studio} />
              </Suspense>
            </Tabs.Content>
          ))
        ) : (
          <div className="inspector-empty">
            <Icon name="shape" size={24} />
            <strong>未选中素材</strong>
            <p>在画布或左侧「素材」页中选择素材，即可编辑动画、元素和布局。</p>
          </div>
        )}
      </aside>
    </Tabs.Root>
  )
}

/* ------------------------------- 动画面板 ------------------------------- */

function AnimPanel({ asset, studio }: { asset: Asset; studio: Studio | null }) {
  const selectedId = asset.groups.some((g) => g.id === store.selectedGroupId)
    ? (store.selectedGroupId as string)
    : asset.groups[0]?.id
  const groupIndex = asset.groups.findIndex((g) => g.id === selectedId)
  const group = asset.groups[groupIndex]
  const [adding, setAdding] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const activeRow = useRef<HTMLDivElement>(null)
  const playing = studio?.isPlaying(asset.id)
  const canPlay = !!studio && asset.groups.some((track) => track.enabled !== false)

  useEffect(() => {
    const list = listRef.current
    const row = activeRow.current
    if (!list || !row) return
    if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop
    const bottom = row.offsetTop + row.offsetHeight
    if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
  }, [selectedId])

  const updateGroup = (patch: Partial<AnimGroup>, field = Object.keys(patch).join(',')) => {
    if (!group) return
    store.updateGroups(asset.id, asset.groups.map((g) => (g.id === group.id ? { ...g, ...patch } : g)), `${group.id}:${field}`)
  }

  const updateTrack = (trackId: string, keyframes: Keyframe[]) => {
    if (!group) return
    updateGroup({ tracks: group.tracks.map((t) => (t.id === trackId ? { ...t, keyframes } : t)) }, trackId)
  }

  return (
    <>
      {group && (
        <div className="transport-row">
          <button
            className="play-btn"
            title={playing ? '暂停预览' : '播放预览'}
            disabled={!playing && !canPlay}
            onClick={() => {
              if (playing) studio?.pause(asset.id)
              else studio?.play(asset.id)
            }}
          >
            <Icon name={playing ? 'pause' : 'play'} size={13} />
          </button>
          <span className="transport-label">预览 <span className="mono muted">{(studio?.getBoard(asset.id)?.player.duration ?? 0).toFixed(2)} s</span></span>
        </div>
      )}

      <header className="group-list-head">
        <span className="muted">{asset.groups.length} 条动画</span>
        <button className="btn ghost tiny" aria-expanded={adding} onClick={() => setAdding((v) => !v)}>
          <Icon name={adding ? 'close' : 'plus'} size={13} />
          {adding ? '收起表单' : '添加动画'}
        </button>
      </header>
      {group && (
        <div className="group-list" ref={listRef}>
          {asset.groups.map((g, i) => (
            <div
              key={g.id}
              ref={g.id === selectedId ? activeRow : undefined}
              className={`group-row ${g.id === selectedId ? 'active' : ''} ${g.enabled === false ? 'off' : ''}`}
            >
              <button className="group-pick" title={g.name} aria-pressed={g.id === selectedId} onClick={() => store.selectGroup(g.id)}>
                <span className="color-dot" style={{ background: groupColor(i) }} />
                <span className="group-main">
                  <span className="group-name">
                    <span className="group-title">{g.name}</span>
                    {(g.targetIds?.length || 1) > 1 && <span className="layer-pill">层 ×{g.targetIds!.length}</span>}
                  </span>
                  <span className="group-target">
                    {(g.targetIds?.length || 1) > 1 ? '交错动画' : targetLabel(asset, g.targetId, studio) || g.targetId}
                  </span>
                </span>
                <span className="group-meta mono">
                  {g.duration.toFixed(2)} s
                  {g.delay !== 0 && <small>{g.delay > 0 ? '+' : ''}{g.delay.toFixed(2)} s</small>}
                </span>
              </button>
              <button
                className="row-icon"
                title={g.enabled === false ? '启用' : '停用'}
                aria-label={`${g.enabled === false ? '启用' : '停用'} ${g.name}`}
                onClick={() => {
                  store.setGroupEnabled(asset.id, g.id, g.enabled === false)
                }}
              >
                <Icon name={g.enabled === false ? 'eyeOff' : 'eye'} size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
      {!group && (
        <div className="panel-note">
          <Icon name="animation" size={16} />
          <div>
            <strong>没有可编辑的动画轨道</strong>
            <p>可提取 SVG 中的 CSS keyframes 和 SMIL 动画。也可以用「添加动画」为指定元素设置关键帧。</p>
          </div>
        </div>
      )}
      {adding && <AddGroupForm key={asset.id} asset={asset} studio={studio} onDone={() => setAdding(false)} />}

      {group && (
        <div className="group-editor">
          <div className="editor-head">
            <span className="color-dot" style={{ background: groupColor(groupIndex) }} />
            <h3 title={group.name}>{group.name}</h3>
            <span className="track-origin mono">{group.origin.toUpperCase()}</span>
            <IconButton
              icon="trash"
              title="删除这条动画"
              size={13}
              danger
              onClick={() => {
                store.removeGroup(asset.id, group.id)
                store.selectGroup(null)
              }}
            />
          </div>

          <div className="grid-2">
            <Field label="时长">
              <NumberInput value={group.duration} step={0.05} min={0.05} suffix="s" onChange={(v) => updateGroup({ duration: v })} />
            </Field>
            <Field label="延迟">
              <NumberInput value={group.delay} step={0.05} suffix="s" onChange={(v) => updateGroup({ delay: v })} />
            </Field>
          </div>

          <Field label="缓动">
            <input
              className="text-input mono"
              list="ease-options"
              value={group.ease}
              onChange={(e) => updateGroup({ ease: e.target.value })}
            />
            <datalist id="ease-options">
              {EASES.map((e) => (
                <option key={e} value={e} />
              ))}
            </datalist>
          </Field>

          <div className="grid-2">
            <Field label="循环">
              <div className="row-inline">
                <NumberInput
                  value={group.iterations === 'infinite' ? 1 : group.iterations}
                  min={1}
                  step={1}
                  onChange={(v) => updateGroup({ iterations: v })}
                />
                <button
                  className={`mini-toggle ${group.iterations === 'infinite' ? 'on' : ''}`}
                  onClick={() => updateGroup({ iterations: group.iterations === 'infinite' ? 1 : 'infinite' })}
                  title="无限循环"
                  aria-pressed={group.iterations === 'infinite'}
                >
                  ∞
                </button>
              </div>
            </Field>
            <Field label="方向">
              <Select
                value={group.direction}
                onChange={(v) => updateGroup({ direction: v as AnimGroup['direction'] })}
                options={[
                  { value: 'normal', label: '正向' },
                  { value: 'reverse', label: '反向' },
                  { value: 'alternate', label: '往复' },
                  { value: 'alternate-reverse', label: '反向往复' },
                ]}
              />
            </Field>
          </div>

          <Field label="填充模式">
            <Select
              value={group.fillMode}
              onChange={(v) => updateGroup({ fillMode: v as AnimGroup['fillMode'] })}
              options={[
                { value: 'none', label: '不保持' },
                { value: 'forwards', label: '保持结束态' },
                { value: 'backwards', label: '提前应用起始态' },
                { value: 'both', label: '前后都保持' },
              ]}
            />
          </Field>

          {(group.targetIds?.length || 1) > 1 && (
            <>
              <Field label="交错延迟">
                <NumberInput
                  value={group.stagger || 0}
                  min={0}
                  step={0.01}
                  suffix="s"
                  onChange={(v) => updateGroup({ stagger: v })}
                />
              </Field>
              <div className="layer-targets">
                {group.targetIds!.slice(0, 14).map((id) => (
                  <span key={id} className="target-chip" title={id}>
                    {targetLabel(asset, id, studio)}
                  </span>
                ))}
                {group.targetIds!.length > 14 && <span className="target-chip">+{group.targetIds!.length - 14}</span>}
              </div>
            </>
          )}

          <div className="tracks">
            {group.tracks.map((track) => (
              <TrackEditor
                key={track.id}
                track={track}
                onChange={(keyframes) => updateTrack(track.id, keyframes)}
                onRemove={() => updateGroup({ tracks: group.tracks.filter((t) => t.id !== track.id) })}
              />
            ))}
            <AddTrack
              existing={group.tracks.map((t) => t.property)}
              onAdd={(property) => {
                const from = property === 'transform' ? 'translateY(20px)' : property === 'opacity' ? '0' : '0'
                const to = property === 'transform' ? 'translateY(0px)' : property === 'opacity' ? '1' : '1'
                updateGroup({ tracks: [...group.tracks, { id: `t${Date.now()}`, property, keyframes: [{ offset: 0, value: from }, { offset: 1, value: to }] }] })
              }}
            />
          </div>
        </div>
      )}

    </>
  )
}

function TrackEditor({
  track,
  onChange,
  onRemove,
}: {
  track: PropTrack
  onChange: (kf: Keyframe[]) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(track.keyframes.length <= 4)
  const isColor = track.property === 'fill' || track.property === 'stroke'
  const isNum = ['opacity', 'stroke-width', 'font-size', 'letter-spacing', 'width', 'height', 'stroke-dashoffset'].includes(track.property)
  return (
    <div className="track">
      <div className="track-head">
        <button className="track-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <Icon name={open ? 'chevronDown' : 'chevron'} size={13} />
          <span className="prop-name">{track.property}</span>
          <span className="mono muted">{track.keyframes.length} 帧</span>
        </button>
        <IconButton icon="trash" title="删除该属性轨道" size={12} danger onClick={onRemove} />
      </div>
      {open && (
        <div className="track-body">
          {track.keyframes.map((kf, i) => (
            <div className="kf-row" key={i}>
              <NumberInput
                value={Math.round(kf.offset * 100)}
                min={0}
                max={100}
                suffix="%"
                onChange={(v) => {
                  const next = [...track.keyframes]
                  next[i] = { ...kf, offset: Math.max(0, Math.min(1, v / 100)) }
                  next.sort((a, b) => a.offset - b.offset)
                  onChange(next)
                }}
              />
              {isColor ? (
                <ColorField value={kf.value} onChange={(v) => onChange(track.keyframes.map((k, j) => (j === i ? { ...k, value: v } : k)))} />
              ) : (
                <input
                  className="text-input mono"
                  value={kf.value}
                  onChange={(e) => onChange(track.keyframes.map((k, j) => (j === i ? { ...k, value: e.target.value } : k)))}
                />
              )}
              <IconButton
                icon="close"
                title="删除关键帧"
                size={11}
                danger
                onClick={() => onChange(track.keyframes.filter((_, j) => j !== i))}
              />
            </div>
          ))}
          <button
            className="btn ghost tiny"
            onClick={() => {
              const last = track.keyframes[track.keyframes.length - 1]
              onChange([...track.keyframes, { offset: Math.min(1, (last?.offset ?? 0) + 0.15), value: last?.value ?? (isNum ? '1' : '') }])
            }}
          >
            <Icon name="plus" size={11} /> 添加关键帧
          </button>
        </div>
      )}
    </div>
  )
}

function AddTrack({ existing, onAdd }: { existing: string[]; onAdd: (p: string) => void }) {
  const [prop, setProp] = useState('opacity')
  const options = TRACK_PROPS.filter((p) => !existing.includes(p)).map((p) => ({ value: p, label: p }))
  if (!options.length) return null
  const selected = options.some((option) => option.value === prop) ? prop : options[0].value
  return (
    <div className="add-track">
      <Select value={selected} onChange={setProp} options={options} />
      <button className="btn ghost small" onClick={() => onAdd(selected)}>
        <Icon name="plus" size={12} /> 添加属性
      </button>
    </div>
  )
}

function AddGroupForm({ asset, studio, onDone }: { asset: Asset; studio: Studio | null; onDone: () => void }) {
  const board = studio?.getBoard(asset.id)
  const elements = useMemo(() => {
    const list: { id: string; label: string; depth: number }[] = []
    board?.content.elements.forEach((c) => {
      if (c.el.kind === 'shape' || c.el.kind === 'text') list.push({ id: c.el.id, label: c.el.label, depth: c.el.depth })
    })
    return list
  }, [asset.id, board])
  const [target, setTarget] = useState(elements[0]?.id || '')
  const [property, setProperty] = useState('opacity')
  const [from, setFrom] = useState('0')
  const [to, setTo] = useState('1')
  const [duration, setDuration] = useState(0.6)
  const [delay, setDelay] = useState(0)
  const [ease, setEase] = useState('power2.out')

  return (
    <div className="add-form">
      <Field label="元素">
        <select className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
          {elements.map((el) => (
            <option key={el.id} value={el.id}>
              {'　'.repeat(Math.max(0, el.depth - 1))}
              {el.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="属性">
        <Select value={property} onChange={setProperty} options={TRACK_PROPS.map((p) => ({ value: p, label: p }))} />
      </Field>
      <div className="grid-2">
        <Field label="起始">
          <input className="text-input mono" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="结束">
          <input className="text-input mono" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="时长">
          <NumberInput value={duration} min={0.05} step={0.1} suffix="s" onChange={setDuration} />
        </Field>
        <Field label="延迟">
          <NumberInput value={delay} step={0.05} suffix="s" onChange={setDelay} />
        </Field>
      </div>
      <Field label="缓动">
        <input className="text-input mono" value={ease} onChange={(e) => setEase(e.target.value)} />
      </Field>
      <button
        className="btn primary small"
        disabled={!target}
        onClick={() => {
          const group: AnimGroup = {
            id: `g_manual_${Date.now()}`,
            name: `${property} 手动`,
            targetId: target,
            duration,
            delay,
            ease,
            iterations: 1,
            direction: 'normal',
            fillMode: 'both',
            tracks: [{ id: `t_${Date.now()}`, property, keyframes: [{ offset: 0, value: from }, { offset: 1, value: to }] }],
            origin: 'manual',
            originPoint: { x: 0.5, y: 0.5 },
            enabled: true,
          }
          store.addGroup(asset.id, group)
          store.selectGroup(group.id)
          onDone()
        }}
      >
        添加
      </button>
      <p className="hint">数值支持 px / em，transform 支持 translate / rotate / scale 组合。</p>
    </div>
  )
}

/* ------------------------------- 元素面板 ------------------------------- */

function ElementPanel({ asset, studio }: { asset: Asset; studio: Studio | null }) {
  const board = studio?.getBoard(asset.id)
  const elements = board?.content.elements
  const selectedId = store.selection.elementId
  const selected = selectedId ? elements?.get(selectedId) : undefined

  const apply = (patch: StylePatch) => {
    if (!selectedId) return
    store.updateElementStyle(asset.id, selectedId, patch)
  }


  const multi = store.multiSelect.filter((id) => elements?.has(id))
  return (
    <>
      {multi.length > 1 && <BatchAnim asset={asset} studio={studio} ids={multi} />}
      {selected && selected.el.kind === 'group' ? (
        <div className="element-form">
          <div className="element-head">
            <Chip tone="accent">GROUP</Chip>
            <span className="element-label" title={selected.el.label}>{selected.el.label}</span>
          </div>
          {(selected.children.length > 1 || asset.layouts?.[selected.el.id]) && (
            <GroupLayout key={`${asset.id}:${selected.el.id}`} asset={asset} id={selected.el.id}
              label={selected.el.label || '分组'} count={selected.children.length} />
          )}
          <p className="panel-note">
            <Icon name="layers" size={14} />
            <span>组本身支持整体透明度；填充/描边请选择内部的图形元素。</span>
          </p>
          <Field label="组不透明度">
            <NumberInput
              value={Number(selected.node.opacity ?? 1)}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => apply({ opacity: v })}
            />
          </Field>
        </div>
      ) : selected ? (
        <div className="element-form">
          <div className="element-head">
            <Chip tone="accent">{selected.el.tag}</Chip>
            <span className="element-label" title={selected.el.label}>{selected.el.label}</span>
            {asset.groups.some((g) => g.targetId === selectedId) && (
              <span className="anim-chip">{asset.groups.filter((g) => g.targetId === selectedId).length} 条动画</span>
            )}
            <span className="spacer" />
            <IconButton
              icon="reset"
              title="恢复原始样式"
              size={13}
              onClick={() => store.resetElementStyle(asset.id, selectedId!)}
            />
          </div>

          <div className="grid-2">
            <Field label="填充">
              <ColorField value={toColorValue(selected.node.fill)} onChange={(v) => apply({ fill: v })} />
            </Field>
            <Field label="描边">
              <ColorField value={toColorValue(selected.node.stroke)} onChange={(v) => apply({ stroke: v })} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="描边宽">
              <NumberInput value={Number(selected.node.strokeWidth ?? 0)} min={0} step={0.5} onChange={(v) => apply({ strokeWidth: v })} />
            </Field>
            <Field label="不透明度">
              <NumberInput value={Number(selected.node.opacity ?? 1)} min={0} max={1} step={0.05} onChange={(v) => apply({ opacity: v })} />
            </Field>
          </div>

          {selected.el.tag === 'text' && (
            <>
              <Field label="文本">
                <TextInput value={String((selected.node as any).text ?? '')} onChange={(v) => apply({ text: v })} />
              </Field>
              <div className="grid-2">
                <Field label="字号">
                  <NumberInput value={Number((selected.node as any).fontSize ?? 16)} min={1} step={1} onChange={(v) => apply({ fontSize: v })} />
                </Field>
                <Field label="字距">
                  <NumberInput value={Number((selected.node as any).letterSpacing ?? 0)} step={0.5} onChange={(v) => apply({ letterSpacing: v })} />
                </Field>
              </div>
              <Field label="字体">
                <span
                  className="element-readout"
                  title={String((selected.node as any).fontFamily ?? '')}
                >
                  {String((selected.node as any).fontFamily ?? '').split(',')[0].replace(/["']/g, '').trim() || '继承自样式表'}
                </span>
              </Field>
              <div className="grid-2">
                <Field label="字重">
                  <span className="element-readout">{Number((selected.node as any).fontWeight ?? 400)}</span>
                </Field>
                <Field label="行高">
                  <span className="element-readout">
                    {Number((selected.node as any).lineHeight ?? 0) || '按字号自动'}
                  </span>
                </Field>
              </div>
            </>
          )}

          {selected.el.tag === 'rect' && (
            <Field label="圆角">
              <NumberInput value={Number(selected.node.cornerRadius ?? 0)} min={0} step={1} onChange={(v) => apply({ cornerRadius: v })} />
            </Field>
          )}

          <div className="grid-2">
            <Field label="旋转">
              <NumberInput
                value={asset.overrides[selectedId!]?.rotation ?? 0}
                step={1}
                suffix="°"
                onChange={(v) => apply({ rotation: v })}
              />
            </Field>
            <Field label="缩放">
              <NumberInput
                value={asset.overrides[selectedId!]?.scale ?? 1}
                step={0.05}
                min={0.01}
                onChange={(v) => apply({ scale: v })}
              />
            </Field>
          </div>

          <div className="bbox mono muted">
            x {Math.round(selected.bbox.x)} · y {Math.round(selected.bbox.y)} · w {Math.round(selected.bbox.width)} · h{' '}
            {Math.round(selected.bbox.height)}
          </div>
        </div>
      ) : (
        <div className="panel-note">
          <Icon name="shape" size={16} />
          <div>
            <strong>未选中元素</strong>
            <p>点击画布上的图形，或从左侧「图层」列表中选择元素。</p>
          </div>
        </div>
      )}

    </>
  )
}

function toColorValue(v: any): string {
  if (!v) return 'none'
  if (typeof v === 'string') return v
  return 'gradient'
}

/* ------------------------------- 素材面板 ------------------------------- */

function AssetPanel({ asset, studio }: { asset: Asset; studio: Studio | null }) {
  const board = studio?.getBoard(asset.id)
  const [copied, setCopied] = useState(false)
  const duration = board?.player.duration ?? 0
  const elementCount = board?.content.elements.size ?? 0

  return (
    <>
      <Field label="名称">
        <TextInput value={asset.name} onChange={(v) => store.renameAsset(asset.id, v)} />
      </Field>

      <div className="stat-grid">
        <div className="stat">
          <span className="stat-label">画布尺寸</span>
          <span className="stat-value mono">
            {Math.round(asset.width)}×{Math.round(asset.height)}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">元素</span>
          <span className="stat-value mono">{elementCount}</span>
        </div>
        {asset.groups.length > 0 && (
          <div className="stat">
            <span className="stat-label">动画</span>
            <span className="stat-value mono">{asset.groups.length} 条</span>
          </div>
        )}
        {asset.groups.length > 0 && (
          <div className="stat">
            <span className="stat-label">时长</span>
            <span className="stat-value mono">{duration.toFixed(2)}s</span>
          </div>
        )}
      </div>

      <VideoCopyEditor key={asset.id} asset={asset} />

      {asset.warnings.length > 0 && (
        <div className="warnings" aria-label="降级提示">
          <ul>
            {asset.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="version-entry">
        <AssetVersions asset={asset} studio={studio} />
      </div>

      <div className="inspector-actions">
        <button
          className="btn ghost small"
          onClick={() => {
            const spec = store.exportSpec(asset.id)
            navigator.clipboard?.writeText(JSON.stringify(spec, null, 2))
            setCopied(true)
            setTimeout(() => setCopied(false), 1400)
          }}
        >
          <Icon name="code" size={13} />
          {copied ? '已复制配置' : '复制动画配置 JSON'}
        </button>
        <button
          className="btn ghost small"
          onClick={() => store.reextract(asset.id)}
        >
          <Icon name="animation" size={13} /> 重新提取动画
        </button>
        <button
          className="btn ghost small"
          onClick={() => store.duplicateAsset(asset.id)}
        >
          <Icon name="copy" size={13} /> 复制素材
        </button>
        <button
          className="btn danger small"
          onClick={() => {
            if (confirm(`删除素材「${asset.name}」？`)) store.removeAsset(asset.id)
          }}
        >
          <Icon name="trash" size={13} /> 删除素材
        </button>
      </div>
    </>
  )
}

function targetLabel(asset: Asset, targetId: string, studio: Studio | null) {
  const el = studio?.getBoard(asset.id)?.content.elements.get(targetId)
  return el ? el.el.label : ''
}

/* ------------------------------- 批量动画 ------------------------------- */

function BatchAnim({ asset, studio, ids }: { asset: Asset; studio: Studio | null; ids: string[] }) {
  const [open, setOpen] = useState(true)
  const [property, setProperty] = useState('opacity')
  const [from, setFrom] = useState('0')
  const [to, setTo] = useState('1')
  const [duration, setDuration] = useState(0.6)
  const [stagger, setStagger] = useState(0.06)
  const [ease, setEase] = useState('power2.out')
  const board = studio?.getBoard(asset.id)

  // 按 X 再按 Y 排序：一串文字会得到阅读顺序
  const ordered = useMemo(() => {
    return [...ids].sort((a, b) => {
      const ea = board?.content.elements.get(a)
      const eb = board?.content.elements.get(b)
      if (!ea || !eb) return 0
      const dx = ea.bbox.x - eb.bbox.x
      return Math.abs(dx) > 1 ? dx : ea.bbox.y - eb.bbox.y
    })
  }, [ids.join(','), board])

  return (
    <div className="batch-card">
      <div className="batch-head">
        <Icon name="layers" size={13} />
        <strong>已多选 {ids.length} 个元素</strong>
        <span className="spacer" />
        <button className="row-icon" onClick={() => setOpen((v) => !v)} title={open ? '收起' : '展开'}>
          <Icon name={open ? 'chevronDown' : 'chevron'} size={13} />
        </button>
        <button className="row-icon" onClick={() => store.clearMultiSelect()} title="清空多选">
          <Icon name="close" size={13} />
        </button>
      </div>
      {open && (
        <div className="batch-body">
          <div className="grid-2">
            <Field label="属性">
              <Select value={property} onChange={setProperty} options={TRACK_PROPS.map((p) => ({ value: p, label: p }))} />
            </Field>
            <Field label="交错">
              <NumberInput value={stagger} min={0} step={0.01} suffix="s" onChange={setStagger} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="起始">
              <input className="text-input mono" value={from} onChange={(e) => setFrom(e.target.value)} />
            </Field>
            <Field label="结束">
              <input className="text-input mono" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <div className="grid-2">
            <Field label="时长">
              <NumberInput value={duration} min={0.05} step={0.05} suffix="s" onChange={setDuration} />
            </Field>
            <Field label="缓动">
              <input className="text-input mono" value={ease} onChange={(e) => setEase(e.target.value)} />
            </Field>
          </div>
          <button
            className="btn primary small"
            onClick={() => {
              const group: AnimGroup = {
                id: `g_layer_${Date.now()}`,
                name: `${property} 层`,
                targetId: ordered[0],
                targetIds: ordered,
                stagger,
                duration,
                delay: 0,
                ease,
                iterations: 1,
                direction: 'normal',
                fillMode: 'both',
                tracks: [{ id: `t_${Date.now()}`, property, keyframes: [{ offset: 0, value: from }, { offset: 1, value: to }] }],
                origin: 'manual',
                originPoint: { x: 0.5, y: 0.5 },
                enabled: true,
              }
              store.addGroup(asset.id, group)
              store.selectGroup(group.id)
              store.clearMultiSelect()
            }}
          >
            <Icon name="layers" size={13} /> 合并为一条分层动画
          </button>
          <p className="hint">
            按 X 坐标排序后逐个错开 {stagger}s；之后改这条层的时长 / 缓动 / 关键帧，所有元素一起变。
          </p>
        </div>
      )}
    </div>
  )
}
