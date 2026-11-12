import { useEffect, useRef, useState } from 'react'
import { store } from '../store'
import { Icon } from './Icon'

function agoLabel(at: number | null) {
  if (!at) return '等待首次同步'
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000))
  if (seconds < 3) return '刚刚'
  if (seconds < 60) return `${seconds} 秒前`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} 分钟前`
  return `${Math.round(minutes / 60)} 小时前`
}

export default function ProjectMenu() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [, tick] = useState(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => tick((n) => n + 1), 1000)
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => {
      clearInterval(timer)
      window.removeEventListener('mousedown', onDown)
    }
  }, [open])

  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (busy) return
    setBusy(true)
    setNote('')
    try {
      if (await fn() === false) return
      setNote(label + ' ✓')
      setTimeout(() => setNote(''), 1600)
    } catch (err: any) {
      if (err?.name === 'AbortError') return
      setNote('失败：' + (err?.message || err))
    } finally {
      setBusy(false)
    }
  }

  const fileName = store.projectFileName
  const linked = Boolean(store.projectHandle || store.projectUrl)
  const live = store.liveSync && linked
  const status = !fileName
    ? '浏览器内存储 · 可另存为文件'
    : !linked
      ? '浏览器内存储 · 可另存为文件'
      : !store.liveSync
        ? store.projectDirty ? '有改动，写回文件已关' : '与文件一致（实时同步已关）'
        : store.syncError
          ? `同步出错：${store.syncError}`
          : store.projectDirty
            ? '有改动，正在写回文件…'
            : store.syncConflicts
              ? `已同步 · ${store.syncConflicts} 处按文件版本`
              : `实时同步 · ${agoLabel(store.syncAt)}`

  return (
    <div className="project-menu" ref={ref}>
      <button
        id="project-menu-trigger"
        aria-label="项目"
        aria-expanded={open}
        className={`tool-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={live ? `项目文件与实时同步（${status}）` : '项目文件与画布历史'}
      >
        <Icon name="folder" size={14} />
        <span className="project-label">{fileName || '项目'}</span>
        {store.projectDirty && <span className="dirty-dot" title="有未保存的修改" />}
        {live && !store.projectDirty && <span className="sync-dot" title="与文件实时同步" />}
      </button>
      {open && (
        <div className="project-pop">
          <div className="project-pop-head">
            <Icon name="folder" size={13} />
            <div>
              <strong>{fileName || '未链接文件'}</strong>
              <span>{status}</span>
            </div>
          </div>
          <button disabled={busy} onClick={() => run('已打开', () => store.openProject())}>
            <span>打开项目文件…</span>
            <em>⌘O</em>
          </button>
          <button disabled={busy} onClick={() => run('已保存', () => store.saveProject())}>
            <span>保存到文件</span>
            <em>⌘S</em>
          </button>
          <button
            onClick={() => run('已重新载入', () => store.reloadProject())}
            disabled={busy || !linked}
            title="不等轮询，立刻把文件里的版本合并进来"
          >
            <span>立即从文件重新载入</span>
            <em>合并本地改动</em>
          </button>
          <button
            className={store.liveSync ? 'checked' : undefined}
            disabled={!linked}
            onClick={() => store.setLiveSync(!store.liveSync)}
            title={linked ? '文件改动自动进来、界面改动自动写回' : '先打开一份本地 .mgsvg 文件'}
          >
            <span>实时同步</span>
            <em>{store.liveSync ? '开' : '关'}</em>
          </button>
          <button
            onClick={() => {
              const json = store.projectJson()
              const blob = new Blob([json], { type: 'application/json' })
              const a = document.createElement('a')
              a.href = URL.createObjectURL(blob)
              a.download = fileName || `${store.projectName}.mgsvg`
              a.click()
              URL.revokeObjectURL(a.href)
              setNote('已导出 ✓')
            }}
          >
            <span>导出 JSON 副本</span>
          </button>
          <button
            aria-haspopup="dialog"
            onClick={() => {
              setOpen(false)
              store.showHistory()
            }}
          >
            <span>画布历史</span>
            <Icon name="history" size={14} />
          </button>
          <div className="project-pop-tip">
            开着实时同步时，文件被外部改（Agent / 编辑器）会自动合并进来，界面上的改动也会自动写回文件；
            同一处两边都改过时按文件版本，并在上面标出条数。
          </div>
          {(busy || note) && <div className="project-note" role="status">{busy ? '处理中…' : note}</div>}
        </div>
      )}
    </div>
  )
}
