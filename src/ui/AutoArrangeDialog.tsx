import { useState } from 'react'
import { store, type ArrangeSettings } from '../store'
import { Field, NumberInput, Select } from './controls'
import { Icon } from './Icon'
import {
  Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from './kit/dialog'

const orderOptions = [
  { value: 'nearby', label: '按当前位置邻近' },
  { value: 'top-left', label: '从左上到右下' },
  { value: 'created', label: '按创建时间' },
]

const modeOptions = [
  { value: 'grid', label: '网格' },
  { value: 'row', label: '横排' },
  { value: 'column', label: '竖排' },
]

export default function AutoArrangeDialog() {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<ArrangeSettings>({ ...store.arrangeSettings })
  const update = (patch: Partial<ArrangeSettings>) => setDraft((current) => ({ ...current, ...patch }))

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (next) setDraft({ ...store.arrangeSettings })
      setOpen(next)
    }}>
      <DialogTrigger asChild>
        <button disabled={!store.assets.length} title="设置排序方式和排列样式">
          <Icon name="grid" size={13} /> 自动排列
        </button>
      </DialogTrigger>
      <DialogContent className="asset-preview-dialog auto-arrange-dialog">
        <DialogHeader className="history-header">
          <DialogTitle>自动排列</DialogTitle>
          <DialogDescription>按素材当前位置排序，再按所选样式放入画布。</DialogDescription>
        </DialogHeader>
        <div className="group-layout-controls">
          <Field label="排序顺序">
            <Select value={draft.order} onChange={(order) => update({ order: order as ArrangeSettings['order'] })} options={orderOptions} />
          </Field>
          <Field label="排列样式">
            <Select value={draft.mode} onChange={(mode) => update({ mode: mode as ArrangeSettings['mode'] })} options={modeOptions} />
          </Field>
          {draft.mode === 'grid' && (
            <Field label="列数">
              <NumberInput value={draft.cols} min={1} max={12} step={1} onChange={(cols) => update({ cols: Math.round(cols) })} />
            </Field>
          )}
          <Field label="素材间距">
            <NumberInput value={draft.gap} min={0} max={500} step={10} suffix="px" onChange={(gap) => update({ gap })} />
          </Field>
        </div>
        <DialogFooter>
          <DialogClose asChild><button className="btn ghost small">取消</button></DialogClose>
          <DialogClose asChild>
            <button className="btn primary small" onClick={() => store.relayout(draft)}>
              <Icon name="grid" size={14} /> 应用排列
            </button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
