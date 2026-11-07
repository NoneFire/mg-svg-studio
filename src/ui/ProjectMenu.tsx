import { useEffect, useRef, useState } from 'react'
import { store } from '../store'
import { Icon } from './Icon'

export default function ProjectMenu() {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
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

  return (
    <div className="project-menu" ref={ref}>
      <button
        className={`tool-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="项目文件：open / save / reload"
      >
        <Icon name="folder" size={14} />
        <span className="project-label">{fileName || '项目'}</span>
        {store.projectDirty && <span className="dirty-dot" title="有未保存的修改" />}
      </button>
      {open && (
        <div className="project-pop">
          <div className="project-pop-head">
            <Icon name="folder" size={13} />
            <div>
              <strong>{fileName || '未链接文件'}</strong>
              <span>
                {fileName
                  ? store.projectDirty
                    ? store.projectHandle ? '有改动，⌘S 写回文件' : '有改动，⌘S 保存到本地'
                    : store.projectUrl
                    ? '来自 URL · 重新载入读取最新'
                    : '与文件同步'
                  : '浏览器内存储 · 可另存为文件'}
              </span>
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
            disabled={busy || (!store.projectHandle && !store.projectUrl)}
          >
            <span>从文件重新载入</span>
            <em>Agent 改完后用</em>
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
          <div className="project-pop-tip">
            本地桥送来的 Agent 改动会与界面改动一起保存。文件被外部改动时，可先导出当前副本，再重新载入。
          </div>
          {(busy || note) && <div className="project-note" role="status">{busy ? '处理中…' : note}</div>}
        </div>
      )}
    </div>
  )
}
