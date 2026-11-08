import { store } from '../store'
import type { Studio } from './studio'
import type { BridgeCommand, BridgeResult, StudioContext } from './bridge-protocol'
import { parseStylePatch } from './style-patch'
import { reviewCache } from './review/cache'
import { reviewSnapshotOf } from './review/record'
import { reviewInputHash } from './review/hash'

/**
 * 浏览器侧：把「人此刻选了什么」推到本地桥（见 src/cli/bridge.ts）。
 * 默认连接本机选择桥（固定端口 7350），无需在 Studio URL 上添加参数。
 */

export function bridgePort(): number { return 7350 }

/** 一份「上下文包」：Agent 靠它知道自己被指着的是哪个元素、这一版有什么问题 */
function buildStudioContext(studio: Studio, sessionId: string): Omit<StudioContext, 'ts' | 'selectionId'> {
  const asset = store.selectedAsset
  const sel = store.selection
  const elementMeta = asset && sel.elementId ? (asset.elements || []).find((e) => e.id === sel.elementId) : undefined
  const converted = asset && sel.elementId ? studio.getBoard(asset.id)?.content.elements.get(sel.elementId) : undefined
  const snapshot = asset?.review
  const review = asset && snapshot?.inputHash === reviewInputHash(asset, snapshot?.options) ? snapshot : undefined
  const agentSnapshot = asset?.agentReview
  const agentReviewStatus = !agentSnapshot ? 'none' : asset && agentSnapshot.inputHash === reviewInputHash(asset, agentSnapshot.options) ? 'ok' : 'stale'

  const payload: Omit<StudioContext, 'ts' | 'selectionId'> = {
    sessionId,
    project: {
      name: store.projectName,
      file: store.projectFileName || store.projectUrl || null,
      dirty: store.projectDirty,
      linked: !!store.projectHandle,
    },
    selection: { assetId: sel.assetId, elementId: sel.elementId, groupId: store.selectedGroupId ?? sel.groupId },
    assets: store.assets.map((a) => ({ id: a.id, name: a.name })),
  }

  if (asset) {
    payload.asset = { id: asset.id, name: asset.name, width: asset.width, height: asset.height, kind: asset.kind }
  }
  if (asset && sel.elementId) {
    const overrides = (asset.overrides || {})[sel.elementId]
    const base = converted?.baseStyle
    payload.element = {
      id: sel.elementId,
      tag: elementMeta?.tag,
      kind: elementMeta?.kind,
      label: elementMeta?.label ?? converted?.el.label,
      depth: elementMeta?.depth,
      parentId: elementMeta?.parentId,
      rect: converted?.bbox
        ? { x: converted.bbox.x, y: converted.bbox.y, width: converted.bbox.width, height: converted.bbox.height }
        : undefined,
      style: base && {
        fill: typeof base.fill === 'string' ? base.fill : undefined,
        stroke: typeof base.stroke === 'string' ? base.stroke : undefined,
        strokeWidth: base.strokeWidth,
        opacity: base.opacity,
        fontSize: base.fontSize,
        letterSpacing: base.letterSpacing,
        width: base.width,
        height: base.height,
        ...overrides,
      },
      overrides,
      // 元素是文字时把内容带上：Agent 才知道这句写的是什么
      text: (overrides?.text ?? converted?.el.text)?.slice(0, 200),
    }
  }
  if (asset && review) {
    const mine = (review.findings || []).filter((f) => sel.elementId && f.element === sel.elementId)
    const cached = reviewCache.get(asset.id)
    payload.review = {
      assetId: asset.id,
      gate: review.gate,
      counts: review.counts,
      findingsForElement: mine,
      raster: cached?.inputHash === review.inputHash ? cached?.details.raster ?? undefined : undefined,
    }
  }
  if (asset) {
    payload.agentReview = {
      status: agentReviewStatus,
      generatedAt: agentSnapshot?.generatedAt,
      resultsForElement: agentReviewStatus === 'ok'
        ? (agentSnapshot?.results || []).filter((result) => result.elementId && result.elementId === sel.elementId)
        : [],
    }
  }
  return payload
}

function uniqueMatch<T extends { id: string }>(items: T[], key: string, label: (item: T) => string, kind: string): T {
  const exactId = items.find((item) => item.id === key)
  if (exactId) return exactId
  const matches = items.filter((item) => label(item) === key)
  if (matches.length === 1) return matches[0]
  if (matches.length > 1) throw new Error(`${kind}「${key}」有多条匹配，请使用 ID`)
  throw new Error(`找不到${kind}「${key}」`)
}

async function applyCommand(studio: Studio, command: BridgeCommand): Promise<unknown> {
  const { type, payload } = command
  // CLI 保存：有权限就直接写，不主动弹授权框；没权限时明确提示用户手动授权一次
  if (type === 'save') return store.saveProject({ linkedOnly: true, automatic: true, force: payload.force === true })
  if (type === 'asset.add') {
    if (!payload.svg?.trim() || !payload.name?.trim()) throw new Error('添加素材需要 SVG 源码和名称')
    await store.addSvgText(payload.svg, payload.name)
    const added = store.selectedAsset
    return { asset: added?.id, name: added?.name, width: added?.width, height: added?.height, dirty: store.projectDirty }
  }
  if (type === 'asset.versions') {
    const target = uniqueMatch(store.assets, payload.asset!, (entry) => entry.name, '素材')
    const list = await store.listVersions(target.id)
    return { asset: target.id, versions: list.map((v) => ({ id: v.id, index: v.index, createdAt: v.createdAt, label: v.label, bytes: v.svg.length })) }
  }
  if (type === 'asset.deleteVersions') {
    const target = uniqueMatch(store.assets, payload.asset!, (entry) => entry.name, '素材')
    const removed = await store.deleteVersions(target.id, payload.versionIds || [])
    return { asset: target.id, removed }
  }
  if (type === 'asset.restoreVersion') {
    const target = uniqueMatch(store.assets, payload.asset!, (entry) => entry.name, '素材')
    await store.restoreVersion(target.id, payload.versionId || '')
    const updated = store.assets.find((a) => a.id === target.id)
    return { asset: target.id, width: updated?.width, height: updated?.height }
  }
  if (type === 'asset.remove') {
    const target = uniqueMatch(store.assets, payload.asset!, (entry) => entry.name, '素材')
    await store.removeAsset(target.id)
    return { removed: target.id, name: target.name }
  }
  if (type === 'asset.replaceSvg') {
    if (!payload.svg?.trim()) throw new Error('替换素材需要 SVG 源码')
    const target = uniqueMatch(store.assets, payload.asset!, (entry) => entry.name, '素材')
    return store.replaceAssetSvg(target.id, payload.svg)
  }
  if (type === 'asset.mergeVersions') {
    const target = uniqueMatch(store.assets, payload.asset!, (entry) => entry.name, '素材')
    const result = await store.mergeAsVersions(target.id, payload.sources || [])
    return { asset: target.id, ...result }
  }
  if (type === 'project.reload') {
    if (store.projectDirty) throw new Error('Studio 有未保存改动，请先保存或导出副本再重新载入')
    if (!store.projectHandle && !store.projectUrl) throw new Error('当前 Studio 项目没有关联可重新载入的文件')
    const reloaded = await store.reloadProject()
    if (!reloaded) throw new Error('Studio 取消了重新载入')
    return { file: store.projectFileName || store.projectUrl, assets: store.assets.length, dirty: store.projectDirty }
  }

  const asset = uniqueMatch(store.assets, payload.asset!, (entry) => entry.name, '素材')
  if (type === 'review') {
    const [{ defaultReviewOptions }, { runReview }] = await Promise.all([
      import('./review/job'), import('./review/review'),
    ])
    const version = store.projectVersion
    const options = defaultReviewOptions(asset, payload.frame)
    const report = await runReview(structuredClone(asset), options)
    const current = store.assets.find((entry) => entry.id === asset.id)
    if (store.projectVersion !== version || !current || report.inputHash !== reviewInputHash(current, options)) {
      throw new Error('评审期间素材已改动，请对当前版本重新评审')
    }
    reviewCache.set(asset.id, report)
    store.setAssetReview(asset.id, reviewSnapshotOf(report, options))
    return report
  }

  const board = studio.getBoard(asset.id)
  if (!board?.ready) throw new Error('素材尚未渲染完成，请稍后重试')
  const elements = board.content.elements
  const element = payload.element
    ? elements.get(payload.element)?.el ??
      uniqueMatch(Array.from(elements.values(), ({ el }) => el), payload.element, (el) => el.label, '元素')
    : null

  if (type === 'select') {
    if (element) store.selectElement(asset.id, element.id)
    else store.selectAsset(asset.id)
    return { selection: store.selection, asset: { id: asset.id, name: asset.name } }
  }
  if (!element) throw new Error('请先选中元素，或提供元素 ID')
  if (type !== 'style.set' && type !== 'style.clear') throw new Error('不支持的命令')
  const patch = type === 'style.set' ? parseStylePatch(payload.patch) : null
  store.endHistoryEdit()
  if (patch) await store.updateElementStyle(asset.id, element.id, patch)
  else await store.resetElementStyle(asset.id, element.id)
  store.endHistoryEdit()
  const overrides = store.assets.find((item) => item.id === asset.id)?.overrides[element.id]
  return { asset: asset.id, element: element.id, label: element.label, overrides: overrides ?? null, dirty: store.projectDirty }
}

export function startBridgePublisher(studio: Studio | null): () => void {
  const port = bridgePort()
  if (!port || !studio) return () => {}
  const base = `http://127.0.0.1:${port}`
  const tabId = crypto.randomUUID()
  const session = () => `${tabId}:${store.projectVersion}`
  const controller = new AbortController()
  const request = (path: string, options?: RequestInit) =>
    fetch(base + path, { ...options, signal: controller.signal })
  const post = (path: string, body: unknown) => request(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  let timer = 0
  let last = ''
  let needsContext = true
  const unsubscribe = store.subscribe(() => { needsContext = true })
  const activate = () => {
    needsContext = true
    last = ''
  }
  window.addEventListener('focus', activate)

  const poll = async () => {
    if (controller.signal.aborted) return
    try {
      const sessionId = session()
      if (needsContext) {
        const context = buildStudioContext(studio, sessionId)
        const key = JSON.stringify(context)
        needsContext = false
        if (key !== last) {
          const published = await post('/context', { ...context, ts: new Date().toISOString() })
          if (!published.ok) throw new Error('无法发布 Studio 上下文')
          last = key
        }
      }
      const res = await request(`/command/next?session=${encodeURIComponent(sessionId)}`)
      if (res.status === 409) activate()
      if (res.status === 200) {
        const command: BridgeCommand = await res.json()
        let result: BridgeResult
        try {
          if (controller.signal.aborted) return
          if (command.sessionId !== session()) throw new Error('Studio 已切换项目，请重新读取选区')
          result = { ok: true, result: await applyCommand(studio, command) }
        } catch (error) {
          result = { ok: false, error: (error as Error).message || String(error) }
        }
        await post('/command/result', { id: command.id, sessionId, ...result })
      }
    } catch {
      // 桥可能晚于页面启动，下一轮重新注册会话。
      activate()
    }
    if (!controller.signal.aborted) timer = window.setTimeout(poll, 400)
  }
  void poll()

  return () => {
    controller.abort()
    clearTimeout(timer)
    window.removeEventListener('focus', activate)
    unsubscribe()
  }
}
