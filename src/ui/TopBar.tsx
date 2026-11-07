import { useState } from 'react'
import { store } from '../store'
import type { Studio } from '../lib/studio'
import { Icon } from './Icon'
import HelpModal from './HelpModal'
import ProjectMenu from './ProjectMenu'
import { Button } from './kit/button'
import CanvasViewControls from './CanvasViewControls'

export default function TopBar({ studio }: { studio: Studio | null }) {
  const [help, setHelp] = useState(false)
  const hasAnimations = !!studio && store.assets.some((asset) => asset.groups.some((group) => group.enabled !== false))

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M4 17V7l4 7 4-7 4 7 4-7v10" fill="none" stroke="white" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="brand-text">
          <strong>MG SVG Studio</strong>
        </div>
      </div>

      <div className="topbar-left-tools">
        <button
          id="library-toggle"
          className="tool-btn sidebar-toggle"
          aria-label="素材库"
          aria-controls="library"
          aria-expanded={store.leftOpen}
          onClick={() => store.setLeftOpen(!store.leftOpen)}
          title={store.leftOpen ? '收起素材库' : '展开素材库'}
        >
          <Icon name="panelLeft" size={15} />
          <span>素材库</span>
        </button>
        <ProjectMenu />
      </div>

      <div className="topbar-center">
        <div className="segmented" role="group" aria-label="全部动画">
          <button
            className="play-all"
            onClick={() => studio?.play(undefined, { restart: true })}
            disabled={!hasAnimations}
            aria-label="播放全部"
            title="从头播放全部动画"
          >
            <Icon name="play" size={13} />
            <span>播放全部</span>
          </button>
          <button onClick={() => studio?.showLastFrames()} disabled={!hasAnimations} aria-label="全部末帧" title="暂停全部动画并查看各自的末帧">
            <Icon name="skipForward" size={14} />
            <span>全部末帧</span>
          </button>
          <button
            onClick={() => {
              store.setLoop(!store.loop)
              studio?.setLoop(store.loop)
            }}
            className={store.loop ? 'active' : ''}
            aria-pressed={store.loop}
            title="全局循环播放"
          >
            <Icon name="loop" size={13} />
            <span>循环</span>
          </button>
        </div>
      </div>

      <div className="topbar-right">
        <CanvasViewControls studio={studio} />
        <Button className="topbar-arrange" variant="ghost" size="sm" onClick={() => store.relayout()} title="按网格重新排列素材">
          <Icon name="layers" size={14} />
          <span>整理</span>
        </Button>
        <div className="divider" />
        <Button
          variant="ghost"
          size="icon-sm"
          className="theme-toggle"
          onClick={() => store.setTheme(store.theme === 'dark' ? 'light' : 'dark')}
          title={store.theme === 'dark' ? '切换到浅色背景' : '切换到深色背景'}
        >
          <Icon name={store.theme === 'dark' ? 'sun' : 'moon'} size={14} />
        </Button>
        <Button variant="ghost" size="icon-sm" onClick={() => setHelp(true)} title="说明 / 快捷键">
          <Icon name="help" size={14} />
        </Button>
        <div className="divider" />
        <button
          id="inspector-toggle"
          className="tool-btn sidebar-toggle"
          aria-label="检查器"
          aria-controls="inspector"
          aria-expanded={store.rightOpen}
          onClick={() => store.setRightOpen(!store.rightOpen)}
          title={store.rightOpen ? '收起检查器' : '打开检查器'}
        >
          <Icon name="panelRight" size={15} />
          <span>检查器</span>
        </button>
      </div>
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </header>
  )
}
