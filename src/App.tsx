import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { store } from './store'
import { Studio } from './lib/studio'
import TopBar from './ui/TopBar'
import LeftPanel from './ui/LeftPanel'
import Inspector from './ui/Inspector'
import Timeline from './ui/Timeline'
import { Icon } from './ui/Icon'
import { runReviewAll } from './lib/review'
import { runReviewJob, type ReviewJob } from './lib/review/job'
import { findAsset } from './lib/project'
import { startBridgePublisher } from './lib/bridge'

export default function App() {
  useSyncExternalStore(store.subscribe, store.getSnapshot)
  const stageRef = useRef<HTMLDivElement>(null)
  const studioRef = useRef<Studio | null>(null)
  const [studioReady, setStudioReady] = useState(false)
  const [dropping, setDropping] = useState(false)
  const [toast, setToast] = useState('')
  const [projectLoad, setProjectLoad] = useState<{ loading: boolean; error?: string }>(() => ({
    loading: Boolean(new URLSearchParams(location.search).get('project')),
  }))

  useEffect(() => {
    if (!stageRef.current) return
    const studio = new Studio(stageRef.current, {
      onSelectionChange: (sel) => {
        store.updateSelection(sel)
      },
      onBoardMove: (id, x, y) => store.moveBoard(id, x, y),
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
    return () => {
      studio.destroy()
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

  useEffect(() => {
    if (!store.lastAddedId) return
    const id = store.lastAddedId
    // 等这一帧的 setAssets 把画板建出来，再聚焦过去
    const raf = requestAnimationFrame(() => studioRef.current?.focusBoard(id, true))
    return () => cancelAnimationFrame(raf)
  }, [store.lastAddedId])

  useEffect(() => {
    void store.init()
    const param = new URLSearchParams(location.search).get('project')
    if (!param) return
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch(param, { signal: controller.signal, cache: 'no-store' })
        if (!response.ok) throw new Error(`读取项目失败（HTTP ${response.status}）`)
        const data = await response.text()
        if (controller.signal.aborted) return
        if (store.projectVersion || store.projectDirty) throw new Error('当前项目已经切换或改动')
        await store.loadProjectJson(data, { fileName: param.split('/').pop(), url: param })
        if (!controller.signal.aborted) setProjectLoad({ loading: false })
      } catch (error) {
        if (controller.signal.aborted) return
        const message = (error as Error).message
        setProjectLoad({ loading: false, error: message })
        if (!new URLSearchParams(location.search).has('review')) setToast(message)
      }
    })()
    return () => controller.abort()
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = store.theme
    document.documentElement.classList.toggle('dark', store.theme === 'dark')
    studioRef.current?.setTheme(store.theme)
  }, [store.theme, studioReady])

  const signature = useMemo(
    () => store.assets.map((a) => `${a.id}:${Math.round(a.x)}:${Math.round(a.y)}`).join('|') + `|${store.grid}`,
    [store.version]
  )

  const renderedProject = useRef(0)
  useEffect(() => {
    const studio = studioRef.current
    if (!studio || !store.ready) return
    studio.setAssets(store.assets, renderedProject.current !== store.projectVersion)
    renderedProject.current = store.projectVersion
    studio.toggleGrid(store.grid)
    studio.setLoop(store.loop)
  }, [signature, store.projectVersion, store.ready, studioReady])

  useEffect(() => {
    const studio = studioRef.current
    if (!studio || !studioReady) return
    const cur = studio.selection
    if (cur.assetId === store.selection.assetId && cur.elementId === store.selection.elementId) return
    studio.select(store.selection, true)
  }, [store.selection, studioReady])

  // ?bridge=<port>：把当前选中项推给本地桥，Agent 才知道人在指着哪个元素
  useEffect(() => {
    if (!studioReady) return
    return startBridgePublisher(studioRef.current)
  }, [studioReady])

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const target = params.get('review')
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
      void runReviewJob(structuredClone(store.assets), target).then(
        (result) => { if (active) publish({ ok: true, result }) },
        (error) => { if (active) publish({ ok: false, error: (error as Error).message }) },
      )
      return () => { active = false }
    }

    store.setRightOpen(true)
    if (target === 'all') {
      void runReviewAll(store.assets).then((result) => { (window as any).__reviewAll = result })
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

  // 首次载入后自动适应画布
  const fitted = useRef(false)
  useEffect(() => {
    if (!studioReady || fitted.current || !store.ready || !store.assets.length) return
    fitted.current = true
    const studio = studioRef.current
    if (!studio) return
    studio.setAssets(store.assets)
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
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 's') {
        e.preventDefault()
        store.saveProject().catch((err) => {
          if (err?.name !== 'AbortError') alert('保存失败：' + (err?.message || err))
        })
        return
      }
      if (meta && e.key.toLowerCase() === 'o') {
        e.preventDefault()
        store.openProject().catch((err) => {
          if (err?.name !== 'AbortError') alert('打开失败：' + (err?.message || err))
        })
        return
      }
      if (typing) return
      if (meta && e.key.toLowerCase() === 'd') {
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
  }, [store.selection, store.grid])

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
      onDragOver={(e) => {
        e.preventDefault()
        setDropping(true)
      }}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
    >
      <TopBar studio={studioRef.current} />
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
                      accept=".svg,.png,.jpg,.jpeg,.webp,.gif,.avif,image/svg+xml,image/*"
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
            <Inspector studio={studioRef.current} />
          </div>
          {store.selectedAsset && store.selectedAsset.groups.length > 0 && <Timeline studio={studioRef.current} />}
        </div>
      </div>
    </div>
  )
}
