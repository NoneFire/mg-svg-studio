import { store } from '../store'
import type { Studio } from './studio'
import type { BridgeCommand, BridgeResult, StudioContext } from './bridge-protocol'
import { parseStylePatch } from './style-patch'
import { reviewCache, reviewSnapshotOf } from './review/batch'
import { defaultReviewOptions } from './review/job'
import { reviewInputHash, runReview } from './review/review'

/**
 * 浏览器侧：把「人此刻选了什么」推到本地桥（见 src/cli/bridge.ts）。
 * 只在打开 ?bridge=<port> 时启用；端口记在 localStorage，刷新后仍然生效。
 */

export function bridgePort(): number | null {
  try {
    const param = new URLSearchParams(location.search).get('bridge')
    if (param) {
      const n = Number(param)
      if (Number.isInteger(n) && n > 0 && n <= 65535) {
        localStorage.setItem('mg-bridge', param)
        return n
      }
      localStorage.removeItem('mg-bridge')
      return null
    }
    const saved = localStorage.getItem('mg-bridge')
    const n = saved ? Number(saved) : NaN
    return Number.isInteger(n) && n > 0 && n <= 65535 ? n : null
  } catch {
    return null
  }
}

/** 一份「上下文包」：Agent 靠它知道自己被指着的是哪个元素、这一版有什么问题 */
function buildStudioContext(studio: Studio, sessionId: string): Omit<StudioContext, 'ts' | 'selectionId'> {
  const asset = store.selectedAsset
  const sel = store.selection
  const elementMeta = asset && sel.elementId ? (asset.elements || []).find((e) => e.id === sel.elementId) : undefined
  const converted = asset && sel.elementId ? studio.getBoard(asset.id)?.content.elements.get(sel.elementId) : undefined
  const snapshot = asset?.review
  const review = asset && snapshot?.inputHash === reviewInputHash(asset, snapshot?.options) ? snapshot : undefined

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
    const mine = (review.findings || []).filter(
      (f) => f.level !== 'PASS' && sel.elementId && f.element === sel.elementId
    )
    const cached = reviewCache.get(asset.id)
    payload.review = {
      assetId: asset.id,
      gate: review.gate,
      counts: review.counts,
      findingsForElement: mine,
      raster: cached?.inputHash === review.inputHash ? cached?.details.raster ?? undefined : undefined,
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
  if (type === 'save') return store.saveProject({ linkedOnly: true })

  const asset = uniqueMatch(store.assets, payload.asset, (entry) => entry.name, '素材')
  if (type === 'review') {
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
  store.editElementStyle(studio, asset, element.id, patch)
  return { asset: asset.id, element: element.id, label: element.label, overrides: asset.overrides[element.id] ?? null, dirty: store.projectDirty }
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
