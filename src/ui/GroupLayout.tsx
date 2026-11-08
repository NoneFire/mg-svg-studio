import { useMemo, useState } from 'react'
import type { Asset } from '../types'
import { DEFAULT_LAYOUT, type Align, type Justify, type LayoutSpec } from '../lib/layout/types'
import { sameValue } from '../lib/history'
import { store } from '../store'
import { AssetPreviewCanvas, type LayoutPreviewReport } from './AssetVersionPreview'
import { Field, NumberInput, Select } from './controls'
import { Icon } from './Icon'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from './kit/dialog'

const modes = [
  { label: '横排', value: 'row' },
  { label: '竖排', value: 'column' },
  { label: '网格', value: 'grid' },
] as const

export default function GroupLayout({ asset, id, label, count }: {
  asset: Asset
  id: string
  label: string
  count: number
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="btn ghost small">
          <Icon name="grid" size={14} /> 重排子元素
        </button>
      </DialogTrigger>
      <DialogContent className="asset-preview-dialog group-layout-dialog" data-asset-preview>
        <DialogHeader className="history-header">
          <DialogTitle>重排子元素</DialogTitle>
          <DialogDescription>{label} · {count} 个直接子元素 · 静态构图预览</DialogDescription>
        </DialogHeader>
        <LayoutDraft asset={asset} id={id} />
      </DialogContent>
    </Dialog>
  )
}

function LayoutDraft({ asset, id }: { asset: Asset; id: string }) {
  const saved = asset.layouts?.[id] ?? null
  const [draft, setDraft] = useState<LayoutSpec | null>(() => saved ?? { ...DEFAULT_LAYOUT })
  const [report, setReport] = useState<LayoutPreviewReport | null>(null)
  const previewAsset = useMemo(() => {
    const layouts = { ...asset.layouts }
    if (draft) layouts[id] = draft
    else delete layouts[id]
    return { ...asset, layouts }
  }, [asset, id, draft])
  const currentReport = report?.asset === previewAsset ? report : null
  const canApply = currentReport && !sameValue(draft, saved)
  const update = (patch: Partial<LayoutSpec>) => {
    setDraft((previous) => {
      const next = { ...DEFAULT_LAYOUT, ...previous, ...patch }
      return sameValue(previous, next) ? previous : next
    })
  }
  const mode = draft?.mode

  return (
    <>
      <div className="group-layout-body">
        <div className="group-layout-preview">
          <AssetPreviewCanvas asset={previewAsset} layoutId={id} onLayoutPreview={setReport} />
          {(currentReport?.requiredWidth || currentReport?.clipsCanvas) && (
            <p className="group-layout-warning" role="status">
              {currentReport.requiredWidth && `按当前尺寸和间距，至少需要 ${currentReport.requiredWidth} px 宽。`}
              {currentReport.clipsCanvas && ' 有子元素超出素材边界，超出部分会被裁切。'}
            </p>
          )}
        </div>
        <div className="group-layout-controls">
          <div className="preset-row" role="group" aria-label="排布方式">
            {modes.map(({ label, value }) => (
              <button key={value} type="button" className={`mini-btn${mode === value ? ' on' : ''}`}
                aria-pressed={mode === value} onClick={() => update({ mode: value })}>
                {label}
              </button>
            ))}
          </div>
          {draft && mode !== 'free' ? (
            <>
              <div className="grid-2">
                <Field label="间距">
                  <NumberInput value={draft.gap} min={0} step={2} onChange={(gap) => update({ gap, rowGap: gap })} />
                </Field>
                <Field label="内边距">
                  <NumberInput value={draft.padding} min={0} step={2} onChange={(padding) => update({ padding })} />
                </Field>
              </div>
              {mode === 'grid' && (
                <Field label="列数">
                  <NumberInput value={draft.cols} min={1} max={12} step={1} onChange={(cols) => update({ cols: Math.round(cols) })} />
                </Field>
              )}
              {mode !== 'row' && (
                <Field label="水平对齐">
                  <Select value={draft.alignX} onChange={(alignX) => update({ alignX: alignX as Align })}
                    options={[{ value: 'start', label: '靠左' }, { value: 'center', label: '居中' }, { value: 'end', label: '靠右' }]} />
                </Field>
              )}
              {mode !== 'column' && (
                <Field label="垂直对齐">
                  <Select value={draft.alignY} onChange={(alignY) => update({ alignY: alignY as Align })}
                    options={[{ value: 'start', label: '靠上' }, { value: 'center', label: '居中' }, { value: 'end', label: '靠下' }]} />
                </Field>
              )}
              <Field label="容器宽度（0 为自动）">
                <NumberInput value={draft.width ?? 0} min={0} step={10} suffix="px"
                  onChange={(width) => update({ width: width || null })} />
              </Field>
              {mode === 'row' && !!draft.width && (
                <>
                  <Field label="水平分布">
                    <Select value={draft.justify} onChange={(justify) => update({ justify: justify as Justify })}
                      options={[{ value: 'start', label: '靠左' }, { value: 'center', label: '居中' },
                        { value: 'end', label: '靠右' }, { value: 'between', label: '两端对齐' }]} />
                  </Field>
                  <label className="group-layout-wrap">
                    <input type="checkbox" checked={draft.wrap} onChange={(event) => update({ wrap: event.target.checked })} />
                    自动换行
                  </label>
                </>
              )}
            </>
          ) : (
            <p className="muted">按原始位置显示子元素。</p>
          )}
          {saved && draft && (
            <button type="button" className="btn ghost small" onClick={() => setDraft(null)}>清除此组布局</button>
          )}
        </div>
      </div>
      <div className="asset-preview-actions">
        <DialogClose asChild><button type="button" className="btn ghost small">取消</button></DialogClose>
        <DialogClose asChild>
          <button type="button" className="btn primary small" disabled={!canApply}
            onClick={() => void store.setLayout(asset.id, id, draft)}>
            应用布局
          </button>
        </DialogClose>
      </div>
    </>
  )
}
