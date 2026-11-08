import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { store } from '../store'
import type { Asset } from '../types'
import ReviewAllModal from './ReviewAllModal'
import type { ReviewMarker, Studio } from '../lib/studio'
import { Icon } from './Icon'
import { Toggle } from './controls'
import {
  IMPACT_LABELS,
  IMPACT_ORDER,
  REVIEW_GROUPS,
  THRESHOLD_LABELS,
  groupDesc,
  groupLabel,
  groupOf,
  RULES,
  ruleset,
  runReview,
  reviewCache,
  runReviewAll,
  reviewSnapshotOf,
  reviewInputHash,
  type BatchResult,
  type CoverageRow,
  type ReviewCard,
  type ReviewOptions,
  type ReviewReport,
  type AgentReviewSnapshot,
} from '../lib/review'
import { agentReviewRules, type AgentReviewResult } from '../lib/review/agent'

const STATUS_LABEL: Record<CoverageRow['status'], string> = {
  measured: '已测',
  unmeasured: '未测',
  na: '不适用',
  human: '人审',
  not_implemented: '未实现',
  not_run: '没跑',
}

const STATUS_ORDER: CoverageRow['status'][] = ['measured', 'unmeasured', 'not_implemented', 'not_run', 'human', 'na']

/** 原则的释义来自规则库，面板里只做展示 */
const PRINCIPLE_DESC = ruleset.principles || {}

/** 网格试算的候选步长：都是设计里常见的格子，避免把坐标公约数当成网格 */
const GRID_CANDIDATES = [8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96, 120, 160]
/** 一条轴上超过这么多线就不画（与 Studio 的 MAX_GRID_LINES 对齐） */
const MAX_GRID_LINES = 160



export default function ReviewPanel({ asset, studio }: { asset: Asset; studio: Studio | null }) {
  const [report, setReport] = useState<ReviewReport | null>(null)
  const [busy, setBusy] = useState(false)
  const [batch, setBatch] = useState<BatchResult | null>(null)
  const [batchBusy, setBatchBusy] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showCoverage, setShowCoverage] = useState(false)
  const [filter, setFilter] = useState<'all' | CoverageRow['status']>('all')
  const [principle, setPrinciple] = useState<string | null>(null)
  const [reviewMode, setReviewMode] = useState<'rules' | 'agent'>('rules')
  const [agentResults, setAgentResults] = useState<AgentReviewResult[]>([])
  const [raster, setRaster] = useState<{ cols: number; gutter: number; margin: number }>(() => {
    try {
      const raw = localStorage.getItem('mg-raster')
      if (raw) {
        const p = JSON.parse(raw)
        return { cols: Number(p.cols) || 24, gutter: Number(p.gutter) || 24, margin: Number(p.margin) || 0 }
      }
    } catch {}
    return { cols: 24, gutter: 24, margin: 0 }
  })
  const [rasterTol, setRasterTol] = useState(1)
  const [copied, setCopied] = useState(false)
  const [options, setOptions] = useState<ReviewOptions>({
    medium: 'ui',
    displayWidth: Math.round(asset.width),
    frame: 1,
  })
  const lastAsset = useRef<string | null>(null)
  const runSeq = useRef(0)
  const panelRef = useRef<HTMLDivElement>(null)

  const runWith = useCallback(async (opts: ReviewOptions, target: Asset) => {
    const seq = ++runSeq.current
    setBusy(true)
    setError(null)
    try {
      const next = await runReview(target, opts)
      // 连点两个素材时，先发的可能后到：只认最后一次
      if (seq !== runSeq.current) return
      reviewCache.set(target.id, next)
      store.setAssetReview(target.id, reviewSnapshotOf(next, opts))
      setReport(next)
      // 与 window.__studio 同类的自动化入口：Agent 可以直接读这份报告
      ;(window as any).__review = next
    } catch (err) {
      setReport(null)
      setError((err as Error)?.message || String(err))
    } finally {
      setBusy(false)
    }
  }, [])

  const run = useCallback(() => runWith(options, asset), [runWith, options, asset])

  /** 批量：依次跑完所有素材，出一张总表。CLI 的 `--run` 走的是同一条路径 */
  const runAll = useCallback(async () => {
    setBatchBusy(true)
    setBatchProgress({ done: 0, total: store.assets.length })
    try {
      const result = await runReviewAll(store.assets, {}, (done, total) => setBatchProgress({ done, total }))
      setBatch(result)
      setShowAll(true)
      ;(window as any).__reviewAll = result
    } finally {
      setBatchBusy(false)
      setBatchProgress(null)
    }
  }, [])

  // 换素材：套用默认口径并自动跑一次；改选项只提示过期，避免每敲一个数字就重算整帧
  useEffect(() => {
    if (lastAsset.current === asset.id) return
    lastAsset.current = asset.id
    // 只审设计稿本身：固定屏幕口径、按画布 1:1 换算字号，不继承历史投放参数
    const opts: ReviewOptions = { medium: 'ui', displayWidth: Math.round(asset.width), frame: 1 }
    setOptions(opts)
    setPrinciple(null)
    setAgentResults([])
    store.setReviewFocus(null)
    const previous = reviewCache.get(asset.id)
    const cached = previous?.inputHash === reviewInputHash(asset, opts) ? previous : undefined
    setReport(cached || null)
    if (!cached) void runWith(opts, asset)
  }, [asset.id, asset.width, runWith, asset])

  const hash = reviewInputHash(asset, options)
  const stale = !!report && report.inputHash !== hash

  useEffect(() => {
    const saved = asset.agentReview
    setAgentResults(saved?.inputHash === hash ? saved.results : [])
  }, [asset.id, asset.agentReview, hash])

  const agentResultsStale = !!asset.agentReview && asset.agentReview.inputHash !== hash
  const saveAgentResults = useCallback((results: AgentReviewResult[]) => {
    setAgentResults(results)
    if (!results.length) {
      store.setAssetAgentReview(asset.id, undefined)
      return
    }
    const snapshot: AgentReviewSnapshot = {
      inputHash: hash,
      options: { ...options },
      generatedAt: new Date().toISOString(),
      results,
    }
    store.setAssetAgentReview(asset.id, snapshot)
  }, [asset.id, hash, options])

  const t = report
  const counts = t?.counts || { FAIL: 0, WARN: 0, PASS: 0, UNMEASURED: 0 }
  const coverage = t?.coverage
  const overlay = store.reviewOverlay
  const rasterOn = store.reviewRaster
  const focus = store.reviewFocus

  /** 栅格校验：按 Ant Design 的列栅格（列数 / 槽宽 / 边距）算元素边缘贴不贴列线 */
  const evalRaster = (colsIn: number, gutterIn: number, marginIn: number) => {
    if (!report) return null
    const W = report.canvas.width
    const H = report.canvas.height
    const cols = Math.max(1, Math.round(colsIn))
    const gutter = Math.max(0, gutterIn)
    const margin = Math.max(0, marginIn)
    const usable = Math.max(1, W - margin * 2 - gutter * (cols - 1))
    const colW = usable / cols
    const edges: number[] = []
    for (let i = 0; i < cols; i++) {
      const startX = margin + i * (colW + gutter)
      edges.push(startX, startX + colW)
    }
    const tol = Math.max(0.5, rasterTol)
    let aligned = 0
    let total = 0
    const off: string[] = []
    for (const [id, b] of Object.entries(report.boxes)) {
      if (b[2] * b[3] >= 0.9 * W * H) continue
      total++
      const left = b[0]
      const right = b[0] + b[2]
      const near = edges.some((e) => Math.abs(left - e) <= tol || Math.abs(right - e) <= tol)
      if (near) aligned++
      else off.push(id)
    }
    return { cols, gutter, margin, colW, edges, tol, aligned, total, share: total ? aligned / total : 0, off }
  }

  const rasterEval = evalRaster(raster.cols, raster.gutter, raster.margin)

  /** 内容的常见左边缘：拿来当「边距」的建议值（Ant Design 的 container padding） */
  const suggestedMargin = (() => {
    if (!report) return null
    const counts = new Map<number, number>()
    for (const [, b] of Object.entries(report.boxes)) {
      const left = Math.round(b[0])
      if (left <= 0 || left > report.canvas.width * 0.35) continue
      counts.set(left, (counts.get(left) || 0) + 1)
    }
    const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
    if (!best || best[1] < 3 || best[0] === raster.margin) return null
    return best[0]
  })()
  /** 三档常用列数各自贴多少：让人一眼看出这张图是按几列排的 */
  const rasterPresets = [12, 16, 24].map((cols) => ({
    cols,
    share: evalRaster(cols, raster.gutter, raster.margin)?.share ?? 0,
  }))

  useEffect(() => {
    if (!studio) return
    if (!rasterOn || !t) {
      studio.setReviewRaster(null, null)
      return
    }
    studio.setReviewRaster(asset.id, raster)
    return () => studio.setReviewRaster(null, null)
  }, [studio, t, rasterOn, raster.cols, raster.gutter, raster.margin, asset.id])

  useEffect(() => {
    try {
      localStorage.setItem('mg-raster', JSON.stringify(raster))
    } catch {}
  }, [raster])

  const markers = useMemo<ReviewMarker[]>(() => {
    if (!t) return []
    const severity: Record<ReviewMarker['level'], number> = { FAIL: 0, WARN: 1, UNMEASURED: 2, PASS: 3 }
    // 一个元素只出一个标注：取最严重的规则，其余条数并进标签
    const byElement = new Map<string, ReviewMarker>()
    const grouped = new Map<string, { ruleId: string; level: ReviewMarker['level']; bbox: ReviewMarker['bbox']; count: number }>()
    for (const f of t.findings) {
      if (f.level !== 'FAIL' && f.level !== 'WARN') continue
      const bbox = t.boxes[f.element]
      if (!bbox) {
        // 整页属性（字号档位、色彩预算等）没有元素框：贴到画布左上角，每条单独一个标签
        const title = RULES[f.ruleId]?.title ?? '评审'
        byElement.set(`canvas|${f.ruleId}`, {
          id: `canvas|${f.ruleId}`,
          ruleId: f.ruleId,
          label: title,
          level: f.level,
          bbox: [0, 0, 0, 0],
        })
        continue
      }
      const previous = grouped.get(f.element)
      if (!previous) {
        grouped.set(f.element, { ruleId: f.ruleId, level: f.level, bbox, count: 1 })
      } else {
        previous.count += 1
        if (severity[f.level] < severity[previous.level]) {
          previous.level = f.level
          previous.ruleId = f.ruleId
        }
      }
    }
    for (const [element, item] of grouped) {
      const title = RULES[item.ruleId]?.title ?? '评审'
      byElement.set(`el|${element}`, {
        id: `el|${element}`,
        ruleId: item.ruleId,
        label: item.count > 1 ? `${title} +${item.count - 1}` : title,
        level: item.level,
        bbox: item.bbox,
      })
    }
    for (const result of agentResults) {
      if (result.result !== 'negative') continue
      const bbox = result.bbox || (result.elementId ? t.boxes[result.elementId] : undefined)
      if (!bbox) continue
      byElement.set(`agent|${result.ruleId}`, {
        id: `agent|${result.ruleId}`,
        ruleId: result.ruleId,
        label: RULES[result.ruleId]?.title ?? '语义评审',
        level: result.result === 'negative' ? 'FAIL' : 'UNMEASURED',
        bbox,
      })
    }
    return [...byElement.values()]
  }, [t, agentResults])
  const canvasOnly = t ? t.findings.filter((f) => f.level !== 'PASS' && !t.boxes[f.element]).length : 0

  /* 标注口径：开着就全标；关掉时只标「当前选中那张卡」——选评审即上图 */
  const activeMarkers = useMemo(() => overlay ? markers : focus ? markers.filter((m) => m.ruleId === focus) : [], [overlay, markers, focus])

  useEffect(() => {
    if (!studio) return
    if (t?.assetId !== asset.id || stale || !activeMarkers.length) {
      studio.setReviewMarkers(null, [], null)
      return
    }
    const board = studio.getBoard(asset.id)
    if (board?.player.groups.length) studio.seek(asset.id, board.player.lastFrameTime)
    studio.setReviewMarkers(asset.id, activeMarkers, focus)
    return () => studio.setReviewMarkers(null, [], null)
  }, [studio, t, overlay, focus, asset.id, activeMarkers, stale])

  const focusRule = (ruleId: string) => {
    // 焦点落在被筛掉的那一类上时，先撤掉筛选，否则看不到卡
    if (principle) {
      const card = report?.view.sections.flatMap((s) => s.shown).find((c) => c.ruleId === ruleId)
      if (card && card.principle !== principle) setPrinciple(null)
    }
    store.focusReviewRule(ruleId)
    if (store.reviewFocus === ruleId) {
      const el = panelRef.current?.querySelector<HTMLElement>(`[data-qv-card="${CSS.escape(ruleId)}"]`)
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }

  /** 违反的原则：按条数排，点一下只看这一类 */
  const violated = (() => {
    if (!t) return [] as { name: string; count: number; level: 'FAIL' | 'WARN' }[]
    const map = new Map<string, { name: string; count: number; level: 'FAIL' | 'WARN' }>()
    for (const f of t.findings) {
      if (f.level !== 'FAIL' && f.level !== 'WARN') continue
      const hit = map.get(f.principle) || { name: f.principle, count: 0, level: 'WARN' as 'FAIL' | 'WARN' }
      hit.count++
      if (f.level === 'FAIL') hit.level = 'FAIL'
      map.set(f.principle, hit)
    }
    return [...map.values()].sort((a, b) => b.count - a.count)
  })()

  /** 按「修的时候一起改」的类别归并；影响程度退化成卡片上的徽标与组内排序 */
  const categoryGroups = (() => {
    if (!t) return [] as { gid: string; items: { card: ReviewCard; folded: boolean }[]; findings: number; worst: string }[]
    const entries: { card: ReviewCard; folded: boolean }[] = []
    for (const sec of t.view.sections) {
      for (const card of sec.shown) entries.push({ card, folded: false })
      for (const card of sec.hidden.items) entries.push({ card, folded: true })
    }
    const map = new Map<string, { card: ReviewCard; folded: boolean }[]>()
    for (const e of entries) {
      if (principle && e.card.principle !== principle) continue
      const gid = groupOf(e.card.ruleId, e.card.principle)
      const list = map.get(gid) || []
      list.push(e)
      map.set(gid, list)
    }
    const rank = (l: string) => ({ FAIL: 0, WARN: 1, UNMEASURED: 2, PASS: 3 } as Record<string, number>)[l] ?? 9
    const order = (gid: string) => {
      const i = REVIEW_GROUPS.findIndex((g) => g.id === gid)
      return i < 0 ? 99 : i
    }
    return [...map.entries()]
      .map(([gid, items]) => {
        items.sort(
          (a, b) =>
            rank(a.card.level) - rank(b.card.level) ||
            IMPACT_ORDER[a.card.impact] - IMPACT_ORDER[b.card.impact] ||
            b.card.count - a.card.count ||
            a.card.ruleId.localeCompare(b.card.ruleId)
        )
        const worst = items.reduce((w, e) => (rank(e.card.level) < rank(w) ? e.card.level : w), 'PASS')
        return { gid, items, findings: items.reduce((sum, e) => sum + e.card.count, 0), worst }
      })
      .sort((a, b) => rank(a.worst) - rank(b.worst) || b.findings - a.findings || order(a.gid) - order(b.gid))
  })()

  const semanticRules = agentReviewRules(ruleset.rules)

  const copyJson = async () => {
    if (!t) return
    const payload = {
      asset: t.assetName,
      inputHash: t.inputHash,
      libraryVersion: t.libraryVersion,
      canvas: t.canvas,
      medium: t.medium,
      displayWidth: t.displayWidth,
      frame: t.frame,
      counts: t.counts,
      gate: t.gate,
      grid: t.grid,
      raster: rasterEval
        ? { cols: rasterEval.cols, gutter: rasterEval.gutter, margin: rasterEval.margin, tolerance: rasterEval.tol,
            aligned: rasterEval.aligned, total: rasterEval.total, share: rasterEval.share, off: rasterEval.off }
        : null,
      boxes: t.boxes,
      unmeasured: t.unmeasured,
      coverage: { total: t.coverage.total, counts: t.coverage.counts, rules: t.coverage.rules },
      findings: t.findings.filter((f) => f.level !== 'PASS'),
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      setError('剪贴板不可用：浏览器拒绝了写入')
    }
  }

  const select = (elementId: string) => {
    if (!elementId || elementId === 'canvas' || elementId === 'spacing' || elementId === 'none') return
    store.selectElement(asset.id, elementId.split(',')[0].trim())
  }

  if (reviewMode === 'agent') {
    return (
      <div className="qv" ref={panelRef}>
        <div className="qv-mode-tabs" role="tablist" aria-label="评审方式">
          <button role="tab" aria-selected={false} onClick={() => setReviewMode('rules')}>规则评审</button>
          <button role="tab" aria-selected="true" className="active">Agent 评审 <span>{semanticRules.length}</span></button>
        </div>
        <div className="qv-tools">
          <Toggle checked={overlay} onChange={(v) => { store.setReviewOverlay(v) }} label="标注" />
          <span className="spacer" />
          <button className="qv-link" onClick={copyJson} disabled={!t} title="复制规则评审 JSON">
            <Icon name="copy" size={11} /> {copied ? '已复制' : 'JSON'}
          </button>
        </div>
        {t && !stale && overlay && <p className="qv-note qv-overlay-note">末帧显示 {markers.length} 处问题标注：红/橙为反例，紫为证据不足。</p>}
        <AgentReviewPanel
          asset={asset}
          rules={semanticRules}
          results={agentResults}
          staleResult={agentResultsStale}
          projectUrl={store.projectUrl}
        />
      </div>
    )
  }

  return (
    <div className="qv" ref={panelRef}>
      {showAll && batch && (
        <ReviewAllModal
          result={batch}
          currentAssetId={asset.id}
          onClose={() => setShowAll(false)}
          onPick={(id) => {
            setShowAll(false)
            store.selectAsset(id)
          }}
        />
      )}
      <div className="qv-mode-tabs" role="tablist" aria-label="评审方式">
        <button role="tab" aria-selected="true" className="active">规则评审 <span>{coverage?.measured || 0}</span></button>
        <button role="tab" aria-selected={false} onClick={() => setReviewMode('agent')}>Agent 评审 <span>{semanticRules.length}</span></button>
      </div>

      <div className="qv-actions">
        <button
          className={`qv-btn primary ${busy ? 'busy' : ''}`}
          onClick={run}
          disabled={busy || batchBusy}
          title="重跑全部数值规则"
        >
          <Icon name={busy ? 'loop' : 'sparkle'} size={12} />
          {busy ? '测量中' : t ? '重跑规则评审' : '评审当前素材'}
        </button>
        <button
          className={`qv-btn ${batchBusy ? 'busy' : ''}`}
          onClick={runAll}
          disabled={batchBusy || busy}
          title="依次评审所有素材"
        >
          <Icon name={batchBusy ? 'loop' : 'layers'} size={12} />
          {batchBusy && batchProgress ? `${batchProgress.done}/${batchProgress.total}` : '评审全部'}
        </button>
        {error && <span className="qv-note qv-err">评审失败：{error}</span>}
        {!error && stale && <span className="qv-note qv-warn">画面已更改，点「重跑规则评审」更新。</span>}
      </div>

      <div className="qv-tools">
        <Toggle checked={overlay} onChange={(v) => { store.setReviewOverlay(v) }} label="标注" />
        <Toggle checked={rasterOn} onChange={(v) => store.setReviewRaster(v)} label="栅格" />
        <span className="spacer" />
        <button className="qv-link" onClick={copyJson} disabled={!t} title="复制评审 JSON">
          <Icon name="copy" size={11} /> {copied ? '已复制' : 'JSON'}
        </button>
      </div>

      {t && !stale && (overlay || focus) && (
        <p className="qv-note qv-overlay-note">
          {overlay
            ? `末帧显示 ${markers.length} 处问题标注：红/橙为反例，紫为证据不足；点标注可定位`
            : `末帧标注选中的「${focus}」，开启标注可查看全部`}
          {canvasOnly > 0 ? `；${canvasOnly} 处是画面级判定，没有元素可标` : ''}
        </p>
      )}

      {rasterOn && t && (
        <div className="qv-grid">
          <div className="qv-grid-head">
            <span>栅格校验</span>
            <span className="spacer" />
            <span className="qv-mono">
              {raster.cols} 列 · 槽 {raster.gutter} · 边距 {raster.margin}
            </span>
          </div>
          <div className="qv-raster-presets">
            {rasterPresets.map((p) => (
              <button
                key={p.cols}
                className={`qv-grid-trial ${raster.cols === p.cols ? 'active' : ''}`}
                onClick={() => setRaster((r) => ({ ...r, cols: p.cols }))}
                title={`按 ${p.cols} 列排：${Math.round(p.share * 100)}% 的元素边缘贴列线`}
              >
                {p.cols} 列<span className="qv-grid-trial-share">{Math.round(p.share * 100)}%</span>
              </button>
            ))}
            <span className="qv-note qv-raster-hint">Ant Design 口径：列数 + 槽宽 + 边距</span>
          </div>
          <div className="qv-raster-fields">
            <label className="qv-grid-field">
              <span>列数</span>
              <input
                className="text-input mono"
                type="number"
                min={1}
                max={48}
                value={raster.cols}
                onChange={(e) => setRaster((r) => ({ ...r, cols: Math.max(1, Math.round(Number(e.target.value) || 1)) }))}
              />
            </label>
            <label className="qv-grid-field">
              <span>槽宽</span>
              <input
                className="text-input mono"
                type="number"
                min={0}
                step={4}
                value={raster.gutter}
                onChange={(e) => setRaster((r) => ({ ...r, gutter: Math.max(0, Number(e.target.value) || 0) }))}
              />
            </label>
            <label className="qv-grid-field">
              <span>边距{suggestedMargin ? <button className="qv-margin-hint" onClick={(e) => { e.preventDefault(); setRaster((r) => ({ ...r, margin: suggestedMargin })) }} title="按内容常见的左边缘对齐">用 {suggestedMargin}</button> : null}</span>
              <input
                className="text-input mono"
                type="number"
                min={0}
                step={8}
                value={raster.margin}
                onChange={(e) => setRaster((r) => ({ ...r, margin: Math.max(0, Number(e.target.value) || 0) }))}
              />
            </label>
            <label className="qv-grid-field">
              <span>容差</span>
              <input
                className="text-input mono"
                type="number"
                min={0.5}
                step={0.5}
                value={rasterTol}
                onChange={(e) => setRasterTol(Number(e.target.value) || 1)}
              />
            </label>
          </div>
          {rasterEval && (
            <>
              <p className="qv-grid-stat">
                <b>{Math.round(rasterEval.share * 100)}%</b> 的元素边缘贴着列线
                <span className="qv-mono">
                  {' '}
                  · {rasterEval.aligned}/{rasterEval.total}
                </span>
              </p>
              <p className="qv-note">
                列宽 {rasterEval.colW.toFixed(1)}，栅格从画板左右边缘起算。规则 GR-01 的「网格」量的是坐标公约数，
                这里按列栅格判对齐，两者不互相覆盖。
              </p>
              {rasterEval.off.length > 0 && (
                <div className="qv-grid-off">
                  <span className="qv-mono">离开栅格 {rasterEval.off.length} 处</span>
                  {rasterEval.off.slice(0, 6).map((id) => (
                    <button key={id} className="qv-el" onClick={() => select(id)} title="在画布上定位">
                      {id}
                    </button>
                  ))}
                  {rasterEval.off.length > 6 && <span className="qv-mono">+{rasterEval.off.length - 6}</span>}
                </div>
              )}
            </>
          )}
        </div>
      )}


      {t && violated.length > 0 && (
        <div className="qv-principles">
          <span className="qv-principles-label">违反的原则</span>
          <div className="qv-principles-list">
            {violated.map((p) => (
              <button
                key={p.name}
                className={`qv-principle ${p.level === 'FAIL' ? 'fail' : ''} ${principle === p.name ? 'active' : ''}`}
                title={PRINCIPLE_DESC[p.name] || p.name}
                onClick={() => setPrinciple(principle === p.name ? null : p.name)}
              >
                {p.name}
                <span className="qv-principle-count">{p.count}</span>
              </button>
            ))}
          </div>
          {principle && (
            <button className="qv-principles-clear" onClick={() => setPrinciple(null)}>
              只看「{principle}」· 清除
            </button>
          )}
        </div>
      )}

      {t && (
        <>
          <div className="qv-cats">
            {categoryGroups.map(({ gid, items, findings, worst }) => (
              <section className="qv-cat" key={gid} data-group={gid}>
                <header className={`qv-cat-head ${worst.toLowerCase()}`} title={groupDesc(gid as never)}>
                  <span className="qv-cat-name">{groupLabel(gid as never)}</span>
                  <span className="qv-mono">
                    {items.length} 类 · {findings} 处
                  </span>
                </header>
                {items.map(({ card, folded }) =>
                  folded ? (
                    <button
                      key={card.ruleId}
                      className="qv-compact"
                      onClick={() => focusRule(card.ruleId)}
                      title={`${card.violation}${card.fix ? ' / 改法：' + card.fix : ''}`}
                    >
                      <span className={`qv-level ${card.level.toLowerCase()}`}>{card.level}</span>
                      <span className="qv-compact-title">{card.title}</span>
                      <span className="qv-compact-principle">{card.principle}</span>
                      <span className="qv-mono">{card.count} 处</span>
                    </button>
                  ) : (
                    <Card
                      key={`${card.ruleId}-${card.title}`}
                      card={card}
                      focused={focus === card.ruleId}
                      onFocus={() => focusRule(card.ruleId)}
                      onSelect={select}
                    />
                  )
                )}
              </section>
            ))}
            {categoryGroups.length === 0 && principle && (
              <p className="qv-folded">「{principle}」这一类这一帧没有判出问题。</p>
            )}
            {categoryGroups.length === 0 && !principle && t.findings.filter((f) => f.level !== 'PASS').length === 0 && (
              <p className="qv-empty-note">这一帧没有判出问题。不等于没问题：先看下面的覆盖率。</p>
            )}
          </div>

          <div className="qv-foot">
            <button className="qv-link" onClick={() => setShowCoverage((v) => !v)}>
              <Icon name={showCoverage ? 'chevronDown' : 'chevron'} size={11} />
              覆盖率 {coverage?.measured}/{coverage?.total} 条 · 未测 {coverage?.counts.unmeasured || 0} · 未实现{' '}
              {(coverage?.counts.not_implemented || 0) + (coverage?.counts.not_run || 0)}
            </button>
            <p className="qv-note qv-mono">
              {t.details.elements} 元素 · {t.details.elapsedMs}ms · v{t.libraryVersion}
            </p>
          </div>

          {showCoverage && coverage && (
            <div className="qv-coverage">
              <div className="qv-filters">
                <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>
                  全部 {coverage.total}
                </button>
                {STATUS_ORDER.map((status) => (
                  <button
                    key={status}
                    className={filter === status ? 'active' : ''}
                    onClick={() => setFilter(status)}
                  >
                    {STATUS_LABEL[status]} {coverage.counts[status] || 0}
                  </button>
                ))}
              </div>
              <div className="qv-rule-list">
                {coverage.rules
                  .filter((row) => filter === 'all' || row.status === filter)
                  .map((row) => (
                    <div className={`qv-rule-row ${row.status}`} key={row.ruleId}>
                      <span className="qv-rule-title">{row.title}</span>
                      <span className={`qv-status ${row.level || ''}`}>{STATUS_LABEL[row.status]}</span>
                      {row.reason && <span className="qv-rule-reason">{row.reason}</span>}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

    </div>
  )
}

function Card({
  card,
  focused,
  onFocus,
  onSelect,
}: {
  card: ReviewCard
  focused: boolean
  onFocus: () => void
  onSelect: (id: string) => void
}) {
  const range =
    card.measuredRange.length === 2
      ? card.measuredRange[0] === card.measuredRange[1]
        ? String(card.measuredRange[0])
        : `${card.measuredRange[0]}–${card.measuredRange[1]}`
      : ''
  return (
    <article
      className={`qv-card ${card.level.toLowerCase()} ${focused ? 'focused' : ''}`}
      data-qv-card={card.ruleId}
      onClick={onFocus}
    >
      <button
        type="button"
        className="qv-card-head"
        aria-pressed={focused}
        onClick={(e) => {
          e.stopPropagation()
          onFocus()
        }}
        title={focused ? '取消高亮' : '高亮画布上的这一处'}
      >
        <span className={`qv-level ${card.level.toLowerCase()}`}>{card.level}</span>
        <strong>{card.title}</strong>
        <span className="spacer" />
        <span className="qv-impact-tag small">{IMPACT_LABELS[card.impact]}</span>
      </button>
      <p className="qv-principle-line">
        <span className="qv-principle-name" title={PRINCIPLE_DESC[card.principle] || card.principle}>
          原则 · {card.principle}
        </span>
      </p>
      <p className="qv-violation">{card.violation}</p>
      {card.note && <p className="qv-card-note">{card.note}</p>}
      <p className="qv-figure">
        {range && (
          <>
            <b>{range}</b> {card.unit}
          </>
        )}
        {card.count > 1 && <span className="qv-mono"> · {card.count} 处</span>}
        <span className={`qv-prov ${card.threshold}`}>{THRESHOLD_LABELS[card.threshold]}</span>
        <span className="qv-mono">{card.measure}</span>
      </p>
      <p className="qv-elements">
        {card.elementsSample.map((id) =>
          id === 'canvas' || id === 'spacing' || id === 'none' || !id ? (
            <span key={id} className="qv-el static">
              {id || 'canvas'}
            </span>
          ) : (
            <button
              key={id}
              className="qv-el"
              onClick={(e) => {
                e.stopPropagation()
                onSelect(id)
              }}
              title="在画布上定位"
            >
              {id}
            </button>
          )
        )}
        {card.elementCount > card.elementsSample.length && (
          <span className="qv-mono">+{card.elementCount - card.elementsSample.length}</span>
        )}
      </p>
      {card.fix && <p className="qv-fix">{card.fix}</p>}
    </article>
  )
}

function AgentReviewPanel({
  asset,
  rules,
  results,
  staleResult,
  projectUrl,
}: {
  asset: Asset
  rules: typeof ruleset.rules
  results: AgentReviewResult[]
  staleResult: boolean
  projectUrl: string | null
}) {
  const [copiedCli, setCopiedCli] = useState(false)

  useEffect(() => {
    setCopiedCli(false)
  }, [asset.id])

  const cliCommand = `mgsvg review ${projectUrl ? `"${projectUrl}"` : '<项目路径>'} --agent-prompt --asset ${asset.id}`

  const copyCli = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand)
      setCopiedCli(true)
      setTimeout(() => setCopiedCli(false), 1800)
    } catch {
      // 剪贴板不可用时命令可手动选中
    }
  }

  const statusLabel = (result: AgentReviewResult['result']) =>
    result === 'positive' ? '正例' : result === 'negative' ? '反例' : '未测'
  const resultById = new Map(results.map((result) => [result.ruleId, result]))

  return (
    <section className="qv-agent">
      <div className="qv-agent-head">
        <div>
          <h3>通过 mgsvg CLI 调用 Agent 评审</h3>
          <p>这 {rules.length} 条规则需要语义判断。执行下面的命令，Agent 会读取末帧画面与规则，把结论写回项目。</p>
        </div>
        <span className="qv-agent-count">
          {results.length}/{rules.length}
        </span>
      </div>
      {staleResult && <p className="qv-note qv-warn">已有结论对应旧画面，请重跑规则评审后再执行一次。</p>}

      <div className="qv-agent-rules">
        {rules.length ? (
          rules.map((rule) => {
            const result = resultById.get(rule.id)
            return (
              <div className="qv-agent-rule" key={rule.id}>
                <strong>{rule.title}</strong>
                {result && <span className={`qv-agent-result ${result.result}`}>{statusLabel(result.result)}</span>}
              </div>
            )
          })
        ) : (
          <p className="qv-note">当前规则库没有需要语义判断的规则。</p>
        )}
      </div>

      <div className="qv-agent-cli-row">
        <code className="qv-agent-cli" title="在项目根目录执行">{cliCommand}</code>
        <button className="qv-btn primary" onClick={copyCli} disabled={!rules.length}>
          <Icon name="copy" size={12} />
          {copiedCli ? '已复制' : '复制命令'}
        </button>
      </div>
      <p className="qv-note">
        Agent 执行后把结论写回项目，Studio 重新加载即可看到。回写参数：<code>--agent-result &lt;out.json&gt; --write</code>。
      </p>
    </section>
  )
}
