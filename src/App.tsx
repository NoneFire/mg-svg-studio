import { lazy, Suspense, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { store } from './store'
import { isPlayable } from './lib/project'
import type { Studio } from './lib/studio'
import TopBar from './ui/TopBar'
import LeftPanel from './ui/LeftPanel'
import Timeline from './ui/Timeline'
import { Icon } from './ui/Icon'
import type { ReviewJob } from './lib/review/job'
import { findAsset } from './lib/project'
import { startBridgePublisher } from './lib/bridge'

const HistoryDialog = lazy(() => import('./ui/HistoryDialog'))
const Inspector = lazy(() => import('./ui/Inspector'))

export default function App() {
  useSyncExternalStore(store.subscribe, store.getSnapshot)
  const stageRef = useRef<HTMLDivElement>(null)
  const studioRef = useRef<Studio | null>(null)
  const [studioReady, setStudioReady] = useState(false)
  const inspectorWasOpened = useRef(store.rightOpen)
  if (store.rightOpen) inspectorWasOpened.current = true
  const [dropping, setDropping] = useState(false)
  const [toast, setToast] = useState('')
  const [projectLoad, setProjectLoad] = useState<{ loading: boolean; error?: string }>(() => ({
    loading: Boolean(new URLSearchParams(location.search).get('project')),
  }))

  useEffect(() => {
    if (!stageRef.current) return
    let active = true
    let studio: Studio | null = null
    void import('./lib/studio').then(({ Studio: StudioEngine }) => {
      if (!active || !stageRef.current) return
      studio = new StudioEngine(stageRef.current, {
        onSelectionChange: (sel, focusInspector) => {
          store.updateSelection(sel, focusInspector)
        },
        onBoardMove: (id, x, y) => store.moveBoard(id, x, y),
        onBoardDrop: (id, index) => store.reorderBoards(id, index),
        onZoom: (z) => store.setZoom(z),
        onPlaybackChange: () => store.emit(),
        // 点画布上的评审标注 → 面板聚焦到对应卡片
        onReviewMarkerClick: (ruleId) => store.focusReviewRule(ruleId),
      })
      studioRef.current = studio
      // 调试/自动化入口：CLI 与 Agent 通过它读画布状态
      ;(window as any).__studio = studio
      ;(window as any).__store = store
      setStudioReady(true)
    }).catch((error) => {
      if (active) setToast(`画布引擎加载失败：${(error as Error).message}`)
    })
    return () => {
      active = false
      studio?.destroy()
      studioRef.current = null
      setStudioReady(false)
    }
  }, [])

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const data = e.clipboardData
      if (!data) return
      const hasFiles = (data.files?.length || 0) > 0 || Array.from(data.items || []).some((i) => i.kind === 'file')
      const text = (data.getData('text/plain') || '').trim()
      if (!hasFiles && !/^(<svg|<\?xml|data:image\/)/i.test(text)) return
      e.preventDefault()
      store
        .pasteFromClipboard(data)
        .then((n) => setToast(n ? `已粘贴 ${n} 个素材` : '剪贴板里没有可用的 SVG / 图片'))
        .catch((err) => setToast('粘贴失败：' + (err?.message || err)))
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 1800)
    return () => clearTimeout(t)
  }, [toast])

  // 文件被外部改动、自动合并进来时给一条短提示（冲突会在文案里说清楚）
  useEffect(() => {
    if (!store.syncNoticeAt || !store.syncNotice) return
    setToast(store.syncNotice)
  }, [store.syncNoticeAt])

  useEffect(() => {
    if (!store.lastAddedId) return
    const id = store.lastAddedId
    // 等这一帧的 setAssets 把画板建出来，再聚焦过去
    const raf = requestAnimationFrame(() => studioRef.current?.focusBoard(id, true))
    return () => cancelAnimationFrame(raf)
  }, [store.lastAddedId])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const param = params.get('project')
    const automated = params.has('review-job')
    const controller = new AbortController()
    void (async () => {
      try {
        await store.init({ persistent: !automated })
        if (!param || controller.signal.aborted) return
        // 先恢复同一项目的本机草稿，干净的工作区可以读取 URL 上的新版本。
        if (store.projectUrl === param && store.projectDirty) {
          setProjectLoad({ loading: false })
          return
        }
        const response = await fetch(param, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error(`读取项目失败（HTTP ${response.status}）`)
        const data = await response.text()
        if (controller.signal.aborted) return
        if (store.projectVersion || store.projectDirty) throw new Error('当前项目已经切换或改动')
        await store.loadProjectJson(data, { fileName: param.split('/').pop(), url: param })
        if (!controller.signal.aborted) setProjectLoad({ loading: false })
      } catch (error) {
        if (controller.signal.aborted) return
        if (!automated && store.projectUrl === param && param) {
          setProjectLoad({ loading: false })
          return
        }
        const message = (error as Error).message
        setProjectLoad({ loading: false, error: message })
        if (!new URLSearchParams(location.search).has('review')) setToast(message)
      }
    })()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const flush = () => void store.flushWorkspace()
    const onVisibilityChange = () => { if (document.hidden) flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = store.theme
    document.documentElement.classList.toggle('dark', store.theme === 'dark')
    studioRef.current?.setTheme(store.theme)
  }, [store.theme, studioReady])

  useEffect(() => {
    const studio = studioRef.current
    if (!studio) return
    let assets: typeof store.assets | undefined
    let project = store.projectVersion
    const sync = () => {
      if (!store.ready || (assets === store.assets && project === store.projectVersion)) return
      const replace = project !== store.projectVersion
      assets = store.assets
      project = store.projectVersion
      studio.setAssets(assets, replace)
    }
    sync()
    return store.subscribe(sync)
  }, [studioReady])

  useEffect(() => {
    studioRef.current?.toggleGrid(store.grid)
  }, [store.grid, studioReady])

  // 画布格子设置：列数 / 间距 / 是否吸附，改了立刻生效
  useEffect(() => {
    studioRef.current?.setCanvasGrid(store.arrangeSettings)
  }, [store.arrangeSettings, studioReady])

  // 格子模式下画布位置由格子算出来：打开项目后先对齐一次，避免格子和卡片错开
  useEffect(() => {
    if (!store.ready) return
    store.ensureCanvasGrid()
  }, [store.ready, store.projectVersion, store.arrangeSettings])

  useEffect(() => {
    const studio = studioRef.current
    if (!studio || !studioReady) return
    const cur = studio.selection
    if (cur.assetId === store.selection.assetId && cur.elementId === store.selection.elementId) return
    studio.select(store.selection, true)
  }, [store.selection, studioReady])

  // 默认把当前选中项推给本机 7350 端口的桥，Agent 可读取并实时修改。
  useEffect(() => {
    if (!studioReady) return
    return startBridgePublisher(studioRef.current)
  }, [studioReady])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const target = params.get('review')
    const reviewMode = params.get('review-kind') === 'agent-prompt' ? 'agent-prompt' : 'rules'
    if (!target || projectLoad.loading) return
    const automated = params.has('review-job')
    const publish = (job: ReviewJob) => { (window as any).__mgsvgReviewJob = job }
    if (projectLoad.error || (automated && !params.get('project'))) {
      const error = projectLoad.error || '自动评审缺少项目地址'
      if (automated) publish({ ok: false, error })
      else setToast(error)
      return
    }
    if (!store.ready) return
    if (automated) {
      let active = true
      void import('./lib/review/job').then(({ runReviewJob }) => runReviewJob(structuredClone(store.assets), target, reviewMode)).then(
        (result) => { if (active) publish({ ok: true, result }) },
        (error) => { if (active) publish({ ok: false, error: (error as Error).message }) },
      )
      return () => { active = false }
    }

    store.setRightOpen(true)
    if (target === 'all') {
      void import('./lib/review').then(({ runReviewAll }) => runReviewAll(store.assets))
        .then((result) => { (window as any).__reviewAll = result })
      return
    }
    try {
      const asset = findAsset({ assets: store.assets }, target)
      store.selectAsset(asset.id)
      store.requestReview(asset.id)
    } catch (error) {
      setToast((error as Error).message)
    }
  }, [store.ready, projectLoad])

  // 浏览器重启后本地文件授权会退回未授予：第一次点击 / 按键时补一次，
  // 这样实时保存不用等用户去按 ⌘S 才生效。
  useEffect(() => {
    if (!studioReady) return
    const grant = () => {
      window.removeEventListener('pointerdown', grant)
      window.removeEventListener('keydown', grant)
      void store.requestFilePermission()
    }
    window.addEventListener('pointerdown', grant)
    window.addEventListener('keydown', grant)
    return () => {
      window.removeEventListener('pointerdown', grant)
      window.removeEventListener('keydown', grant)
    }
  }, [studioReady])

  // 左栏浮在画布上：适应画布时把它当成左侧留白，内容不会被面板盖住
  useEffect(() => {
    if (!studioReady) return
    const panel = document.getElementById('library')
    studioRef.current?.setViewInset({ left: store.leftOpen && panel ? panel.getBoundingClientRect().width : 0 })
  }, [store.leftOpen, studioReady])

  // 首次载入后自动适应画布
  const fitted = useRef(false)
  useEffect(() => {
    if (!studioReady || fitted.current || !store.ready || !store.assets.length) return
    fitted.current = true
    const studio = studioRef.current
    if (!studio) return
    const panel = document.getElementById('library')
    studio.setViewInset({ left: store.leftOpen && panel ? panel.getBoundingClientRect().width : 0 })
    studio.fitAll()
    if (store.selection.assetId) studio.select(store.selection, true)
    studio.play()
  }, [studioReady, store.ready, store.assets.length])

  // 打开/重新载入项目后重新构图
  useEffect(() => {
    if (!store.projectVersion || !studioRef.current) return
    studioRef.current.fitAll()
    studioRef.current.play()
  }, [store.projectVersion])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.closest?.('[data-asset-preview]')) return
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const meta = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (meta && key === 's') {
        e.preventDefault()
        store.saveProject().catch((err) => {
          if (err?.name !== 'AbortError') alert('保存失败：' + (err?.message || err))
        })
        return
      }
      if (meta && key === 'o') {
        e.preventDefault()
        store.openProject().catch((err) => {
          if (err?.name !== 'AbortError') alert('打开失败：' + (err?.message || err))
        })
        return
      }
      if (typing || e.defaultPrevented || e.isComposing) return
      if (meta && !e.altKey && (key === 'z' || (key === 'y' && !e.shiftKey))) {
        e.preventDefault()
        if (key === 'y' || e.shiftKey) store.redo()
        else store.undo()
        return
      }
      if (store.historyScope !== null) return
      if (meta && key === 'd') {
        e.preventDefault()
        if (store.selection.assetId) store.duplicateAsset(store.selection.assetId)
      } else if ((e.key === 'Backspace' || e.key === 'Delete') && store.selection.assetId && !store.selection.elementId) {
        e.preventDefault()
        const asset = store.selectedAsset
        if (asset && confirm(`删除素材「${asset.name}」？`)) store.removeAsset(asset.id)
      } else if (e.key.toLowerCase() === 'f' && !meta) {
        studioRef.current?.fitAll()
      } else if (e.key.toLowerCase() === 'g' && !meta) {
        store.setGrid(!store.grid)
      } else if (meta && e.key === '0') {
        e.preventDefault()
        studioRef.current?.fitAll()
      } else if (meta && e.key === '1') {
        e.preventDefault()
        studioRef.current?.setZoom(1)
      } else if (e.key === 'Escape') {
        if (store.selection.assetId) studioRef.current?.pause(store.selection.assetId)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropping(false)
    if (e.dataTransfer?.files?.length) {
      await store.importFiles(e.dataTransfer.files)
    }
  }

  return (
    <div
      className="app"
      onBlurCapture={() => store.endHistoryEdit()}
      onDragOver={(e) => {
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <TopBar studio={studioRef.current} />
      <Suspense fallback={null}>
        {store.historyScope !== null && <HistoryDialog />}
      </Suspense>
      {toast && <div className="toast">{toast}</div>}
      <div className="main">
        <LeftPanel studio={studioRef.current} />
        <div className="canvas-area">
          <div className="stage-wrap">
            <div className="stage" ref={stageRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden' }} />
            {store.ready && store.assets.length === 0 && (
              <div className="empty-state">
                <div className="empty-card">
                  <div className="empty-glyph">
                    <Icon name="sparkle" size={26} />
                  </div>
                  <h2>把 MG 素材拖进来 / 粘贴</h2>
                  <p>支持动画 / 静态 SVG，也支持直接 ⌘V 粘贴 SVG 代码、PNG/JPEG 截图。导入后可以无限平铺、抽取动画参数、改元素样式。</p>
                  <label className="btn primary">
                    选择 / 粘贴素材
                    <input
                      type="file"
                      accept=".svg,.json,.png,.jpg,.jpeg,.webp,.gif,.avif,image/svg+xml,application/json,image/*"
                      multiple
                      hidden
                      onChange={(e) => e.target.files && store.importFiles(e.target.files)}
                    />
                  </label>
                </div>
              </div>
            )}
            {dropping && (
              <div className="drop-overlay">
                <Icon name="upload" size={28} />
                <span>松开导入素材</span>
              </div>
            )}
            {inspectorWasOpened.current && (
              <Suspense fallback={null}>
                <Inspector studio={studioRef.current} />
              </Suspense>
            )}
          </div>
          {store.selectedAsset && isPlayable(store.selectedAsset) && <Timeline studio={studioRef.current} />}
        </div>
      </div>
    </div>
  )
}
