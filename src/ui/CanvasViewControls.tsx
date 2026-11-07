import { store } from '../store'
import type { Studio } from '../lib/studio'
import { Icon } from './Icon'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from './kit/dropdown-menu'

export default function CanvasViewControls({ studio }: { studio: Studio | null }) {
  const zoom = `${Math.round((store.zoom || 1) * 100)}%`
  const zoomActions = [
    { label: '缩小', icon: 'minus', run: () => studio?.zoomBy(1 / 1.25) },
    { label: '重置为 100%', icon: 'reset', readout: zoom, run: () => studio?.setZoom(1) },
    { label: '放大', icon: 'plus', run: () => studio?.zoomBy(1.25) },
  ]
  const fit = () => studio?.fitAll()

  return (
    <>
      <div className="canvas-view" role="group" aria-label="画布视图">
        {zoomActions.map(({ label, icon, readout, run }) => (
          <button key={label} onClick={run} title={label} aria-label={label} disabled={!studio}
            className={readout ? 'canvas-zoom-value' : undefined}>
            {readout ?? <Icon name={icon} size={14} />}
          </button>
        ))}
        <span className="canvas-view-separator" />
        <button onClick={fit} title="适应画布" disabled={!studio}>
          <Icon name="fit" size={15} />
        </button>
        <button onClick={() => store.setGrid(!store.grid)} title="网格" aria-pressed={store.grid}>
          <Icon name="grid" size={14} />
        </button>
      </div>
      <div className="canvas-view-compact">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="tool-btn canvas-view-trigger" title={`画布视图（${zoom}）`} aria-label={`画布视图（${zoom}）`}>
              <Icon name="fit" size={14} className="canvas-view-trigger-icon" />
              <span className="canvas-zoom-value">{zoom}</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="library-menu canvas-view-menu">
            {zoomActions.map(({ label, icon, run }) => (
              <DropdownMenuItem key={label} onSelect={run} disabled={!studio}>
                <Icon name={icon} size={14} /> {label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onSelect={fit} disabled={!studio}>
              <Icon name="fit" size={14} /> 适应画布
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={store.grid} onCheckedChange={(value) => store.setGrid(value)}>
              显示网格
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem className="canvas-menu-arrange" onSelect={() => store.relayout()}>
              <Icon name="layers" size={14} /> 整理素材
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  )
}
