import { useEffect, useRef, useState } from 'react'
import type { Asset } from '../types'
import { store } from '../store'
import { Icon } from './Icon'

function formatElapsed(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000)
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function recordingFailure(error: unknown) {
  if (error instanceof DOMException && error.name === 'NotAllowedError') return '麦克风权限未开启，请允许此页面访问麦克风后重试。'
  if (error instanceof DOMException && error.name === 'NotFoundError') return '没有找到可用的麦克风。'
  return '录音失败，请检查麦克风后重试。'
}

export default function VideoCopyEditor({ asset }: { asset: Asset }) {
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])
  const startedAt = useRef(0)
  const mounted = useRef(false)
  const [recording, setRecording] = useState(false)
  const [saving, setSaving] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState('')
  const canRecord = typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (recorder.current?.state === 'recording') {
        try { recorder.current.stop() } catch {}
      }
      stream.current?.getTracks().forEach((track) => track.stop())
      stream.current = null
    }
  }, [])

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => setElapsed(performance.now() - startedAt.current), 250)
    return () => window.clearInterval(timer)
  }, [recording])

  const stopRecording = () => {
    if (recorder.current?.state !== 'recording') return
    try {
      recorder.current.stop()
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop())
      stream.current = null
      recorder.current = null
      setRecording(false)
      setError('无法停止录音，请重新尝试。')
    }
  }

  const startRecording = async () => {
    if (!canRecord || recording) return
    setError('')
    setElapsed(0)
    chunks.current = []
    try {
      const activeStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) {
        activeStream.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = activeStream
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
        .find((type) => MediaRecorder.isTypeSupported?.(type))
      const options: MediaRecorderOptions = { audioBitsPerSecond: 64_000 }
      if (mimeType) options.mimeType = mimeType
      const activeRecorder = new MediaRecorder(activeStream, options)
      recorder.current = activeRecorder
      activeRecorder.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data)
      }
      activeRecorder.onerror = () => {
        stream.current?.getTracks().forEach((track) => track.stop())
        stream.current = null
        if (mounted.current) {
          setRecording(false)
          setError('录音过程中出现问题，请再录一次。')
        }
      }
      activeRecorder.onstop = () => {
        const blob = new Blob(chunks.current, { type: activeRecorder.mimeType || mimeType || 'audio/webm' })
        chunks.current = []
        recorder.current = null
        stream.current?.getTracks().forEach((track) => track.stop())
        stream.current = null
        if (mounted.current) setRecording(false)
        if (!blob.size) {
          if (mounted.current) setError('没有录到音频，请再试一次。')
          return
        }
        if (mounted.current) setSaving(true)
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result === 'string') store.setVoiceoverAudio(asset.id, reader.result)
          else if (mounted.current) setError('录音保存失败，请再试一次。')
          if (mounted.current) setSaving(false)
        }
        reader.onerror = () => {
          if (mounted.current) {
            setSaving(false)
            setError('录音保存失败，请再试一次。')
          }
        }
        reader.readAsDataURL(blob)
      }
      startedAt.current = performance.now()
      activeRecorder.start()
      setRecording(true)
    } catch (cause) {
      stream.current?.getTracks().forEach((track) => track.stop())
      stream.current = null
      setError(recordingFailure(cause))
    }
  }

  return (
    <div className="field video-copy-field">
      <div className="video-copy-toolbar">
        <span className="field-label">视频文案</span>
        <button
          type="button"
          className={`video-copy-record${recording ? ' recording' : ''}`}
          aria-label={recording ? '停止录音' : asset.voiceoverAudio ? '重新录音' : '开始录音'}
          aria-pressed={recording}
          title={!canRecord ? '当前浏览器不支持录音' : saving ? '正在保存录音' : recording ? '停止录音' : asset.voiceoverAudio ? '重新录音' : '开始录音'}
          disabled={!canRecord || saving}
          onClick={recording ? stopRecording : startRecording}
        >
          <Icon name={recording ? 'stop' : 'mic'} size={13} />
          <span>{saving ? '保存中…' : recording ? `停止 · ${formatElapsed(elapsed)}` : asset.voiceoverAudio ? '重录' : '录音'}</span>
        </button>
      </div>
      <textarea
        className="video-copy-input"
        aria-label="视频文案"
        rows={5}
        placeholder="输入口播、字幕或发布文案…"
        value={asset.videoCopy ?? ''}
        onChange={(event) => store.setVideoCopy(asset.id, event.currentTarget.value)}
      />
      {asset.voiceoverAudio && (
        <div className="video-copy-audio-row">
          <audio key={asset.voiceoverAudio} className="video-copy-audio" controls preload="metadata" src={asset.voiceoverAudio} aria-label="播放录音" />
          <button
            type="button"
            className="video-copy-remove-audio"
            aria-label="删除录音"
            title="删除录音"
            onClick={() => store.setVoiceoverAudio(asset.id, undefined)}
          >
            <Icon name="trash" size={14} />
          </button>
        </div>
      )}
      {error && <p className="video-copy-error" role="alert">{error}</p>}
      <span className="field-hint">
        {!canRecord ? '当前浏览器不支持麦克风录音。' : '文案和录音会随素材一起保存。'}
      </span>
    </div>
  )
}
