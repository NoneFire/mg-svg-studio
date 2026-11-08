import { Icon } from './Icon'

/** 播放 / 末帧 / 循环三个按钮：顶栏和版本对比共用一套，样式与文案不分叉 */
export default function PlaybackControls({
  playing,
  loop,
  disabled,
  onTogglePlay,
  onShowLastFrame,
  onToggleLoop,
  ariaLabel = '全局播放控制',
  noneReason = '没有可播放的动画',
}: {
  playing: boolean
  loop: boolean
  disabled: boolean
  onTogglePlay: () => void
  onShowLastFrame: () => void
  onToggleLoop: () => void
  ariaLabel?: string
  noneReason?: string
}) {
  return (
    <div className="segmented playback-controls" role="group" aria-label={ariaLabel}>
      <button
        className={`play-all ${playing ? 'active' : ''}`}
        onClick={onTogglePlay}
        disabled={disabled}
        aria-label={playing ? '暂停播放' : '播放全部'}
        aria-pressed={playing}
        title={disabled ? noneReason : playing ? '暂停全部动画' : '从头播放全部动画'}
      >
        <Icon name={playing ? 'pause' : 'play'} size={13} />
        <span>{playing ? '暂停' : '播放'}</span>
      </button>
      <button
        onClick={onShowLastFrame}
        disabled={disabled}
        aria-label="全部末帧"
        title={disabled ? noneReason : '暂停全部动画并查看各自的末帧'}
      >
        <Icon name="skipForward" size={14} />
        <span>末帧</span>
      </button>
      <button
        onClick={onToggleLoop}
        className={loop ? 'active' : ''}
        aria-pressed={loop}
        aria-label="循环播放"
        disabled={disabled}
        title={disabled ? noneReason : `循环播放已${loop ? '开启' : '关闭'}：${loop ? '播放结束后自动重播' : '播放结束后停止'}`}
      >
        <Icon name="loop" size={13} />
        <span>循环</span>
      </button>
    </div>
  )
}
