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
  const playing = studio?.isAnyPlaying() ?? false

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
          aria-label={store.leftOpen ? '收起素材与图层' : '展开素材与图层'}
          aria-controls="library"
          aria-expanded={store.leftOpen}
          onClick={() => store.setLeftOpen(!store.leftOpen)}
          title={store.leftOpen ? '收起素材与图层' : '展开素材与图层'}
        >
          <Icon name="panelLeft" size={15} />
          <span>素材</span>
        </button>
        <ProjectMenu />
      </div>

      <div className="topbar-center">
        <div className="segmented playback-controls" role="group" aria-label="全局播放控制">
          <button
            className={`play-all ${playing ? 'active' : ''}`}
            onClick={() => {
              if (playing) studio?.pause()
              else studio?.play(undefined, { restart: true })
            }}
            disabled={!hasAnimations}
            aria-label={playing ? '暂停播放' : '播放全部'}
            aria-pressed={playing}
            title={playing ? '暂停全部动画' : '从头播放全部动画'}
          >
            <Icon name={playing ? 'pause' : 'play'} size={13} />
            <span>{playing ? '暂停' : '播放'}</span>
          </button>
          <button onClick={() => studio?.showLastFrames()} disabled={!hasAnimations} aria-label="全部末帧" title="暂停全部动画并查看各自的末帧">
            <Icon name="skipForward" size={14} />
            <span>末帧</span>
          </button>
          <button
            onClick={() => {
              const nextLoop = !store.loop
              store.setLoop(nextLoop)
              studio?.setLoop(nextLoop)
            }}
            className={store.loop ? 'active' : ''}
            aria-pressed={store.loop}
            aria-label="循环播放"
            disabled={!hasAnimations}
            title={hasAnimations ? `循环播放已${store.loop ? '开启' : '关闭'}：${store.loop ? '播放结束后自动重播' : '播放结束后停止'}` : '没有可播放的动画'}
          >
            <Icon name="loop" size={13} />
            <span>循环</span>
          </button>
        </div>
      </div>

      <div className="topbar-right">
        <CanvasViewControls studio={studio} />
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
          aria-controls="inspector"
          aria-expanded={store.rightOpen}
          aria-label={store.rightOpen ? '收起检查器' : '打开检查器'}
          onClick={() => store.setRightOpen(!store.rightOpen)}
          title={store.rightOpen ? '收起检查器' : '打开检查器'}
        >
          <Icon name="panelRight" size={15} />
        </button>
      </div>
      {help && <HelpModal onClose={() => setHelp(false)} />}
    </header>
  )
}
