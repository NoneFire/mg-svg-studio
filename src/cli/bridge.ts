import http, { type IncomingMessage } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { BridgeCommand, BridgeResult, StudioContext } from '../lib/bridge-protocol'
import { bridgeCommandTimeout } from '../lib/bridge-protocol'

const SESSION_TTL = 30_000
const RESULT_TTL = 30_000
const MAX_BODY = 10_000_000

type PendingCommand = {
  command: BridgeCommand
  expiresAt: number
  delivered: boolean
  result?: BridgeResult
}

class BridgeError extends Error {
  constructor(public code: string, message: string) { super(message) }
}

function localOrigin(origin: string) {
  try {
    const url = new URL(origin)
    return ['http:', 'https:'].includes(url.protocol) && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

async function readBody(request: IncomingMessage) {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('请求内容过大')
    chunks.push(chunk)
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('请求必须是 JSON 对象')
  return value
}

export async function startBridge(port = 7350) {
  const sessions = new Map<string, { context: StudioContext; seenAt: number }>()
  const pending = new Map<string, PendingCommand>()
  const allowedOrigins = (process.env.MGSVG_STUDIO_ORIGIN || '').split(',').map((origin) => origin.trim())

  const getContext = (sessionId?: string) => {
    const now = Date.now()
    const active = (entry: { seenAt: number }) => now - entry.seenAt < SESSION_TTL
    if (sessionId) {
      const entry = sessions.get(sessionId)
      return entry && active(entry) ? entry.context : null
    }
    // 每次发布都把会话移到末尾。心跳只更新存活时间，后台页不会抢走选区。
    return Array.from(sessions.values()).reverse().find(active)?.context ?? null
  }

  const enqueue = (type: BridgeCommand['type'], payload: BridgeCommand['payload'], sessionId?: string, current = false) => {
    if (Boolean(sessionId) === current) throw new BridgeError('TARGET_REQUIRED', '请指定会话 ID，或显式使用当前会话')
    const context = getContext(sessionId)
    if (!context) throw new BridgeError('SESSION_NOT_FOUND', 'Studio 会话已断开或已切换项目，请重新读取选区')
    if (sessionId && (type === 'style.set' || type === 'style.clear') && (!payload.asset || !payload.element)) {
      throw new Error('指定会话时，请同时提供读取选区时拿到的素材和元素 ID')
    }
    if (type === 'asset.add' && (typeof payload.svg !== 'string' || !payload.svg.trim() || typeof payload.name !== 'string' || !payload.name.trim())) {
      throw new Error('添加素材需要 SVG 源码和名称')
    }
    const noAsset = type === 'asset.add' || type === 'project.reload'
    const asset = noAsset ? undefined : payload.asset || context.selection.assetId
    const canUseSelection = !payload.asset || payload.asset === context.asset?.id || payload.asset === context.asset?.name
    const element = noAsset ? undefined : payload.element || (canUseSelection && type !== 'select' ? context.selection.elementId : undefined)
    if (type !== 'save' && !noAsset && !asset) throw new Error('请先选中素材，或提供素材 ID')
    if ((type === 'style.set' || type === 'style.clear') && !element) {
      throw new Error('请先选中元素，或提供素材和元素 ID')
    }
    if (!['style.set', 'style.clear', 'select', 'save', 'review', 'asset.add', 'asset.mergeVersions', 'asset.versions', 'project.reload'].includes(type)) throw new Error('不支持的实时命令')
    if (type === 'review' && payload.frame !== undefined && (
      typeof payload.frame !== 'number' || !Number.isFinite(payload.frame) || payload.frame < 0 || payload.frame > 1
    )) throw new Error('评审帧必须在 0 到 1 之间')

    const id = randomUUID()
    pending.set(id, {
      command: { id, sessionId: context.sessionId, type, payload: { ...payload, asset, element } },
      expiresAt: Date.now() + bridgeCommandTimeout(type),
      delivered: false,
    })
    return id
  }

  const getResult = (id: string): BridgeResult | undefined => {
    const item = pending.get(id)
    if (!item) return { ok: false, code: 'COMMAND_NOT_FOUND', error: '命令不存在或结果已过期' }
    if (item.result) return item.result
    if (Date.now() >= item.expiresAt) {
      return {
        ok: false,
        code: item.delivered ? 'COMMAND_UNCONFIRMED' : 'COMMAND_NOT_DELIVERED',
        error: item.delivered
          ? 'Studio 已接收命令但未及时回传结果，请先检查当前状态'
          : 'Studio 未领取命令，改动未应用。请确认页面仍开着',
      }
    }
  }

  const server = http.createServer(async (req, res) => {
    let url: URL
    try {
      url = new URL(req.url || '/', 'http://127.0.0.1')
    } catch {
      res.writeHead(400).end()
      return
    }
    const { pathname } = url
    const method = req.method === 'OPTIONS' ? req.headers['access-control-request-method'] : req.method
    const studioRoute = (
      (method === 'POST' && (pathname === '/context' || pathname === '/command/result')) ||
      (method === 'GET' && pathname === '/command/next')
    )
    const origin = req.headers.origin
    const send = (status: number, body?: unknown) => {
      res.statusCode = status
      if (body !== undefined) res.setHeader('content-type', 'application/json')
      res.end(body === undefined ? undefined : JSON.stringify(body))
    }
    if (!localOrigin(`http://${req.headers.host}`)) return send(403, { error: '只接受本地桥地址' })
    if (origin) {
      if (!studioRoute || (!localOrigin(origin) && !allowedOrigins.includes(origin))) {
        return send(403, { error: '此网页来源无权访问本地桥' })
      }
      res.setHeader('access-control-allow-origin', origin)
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS')
      res.setHeader('access-control-allow-headers', 'content-type')
      res.setHeader('vary', 'Origin')
    }
    res.setHeader('cache-control', 'no-store')
    if (req.method === 'OPTIONS') return send(204)

    const now = Date.now()
    for (const [id, entry] of sessions) if (now - entry.seenAt >= SESSION_TTL) sessions.delete(id)
    for (const [id, entry] of pending) if (now - entry.expiresAt >= RESULT_TTL) pending.delete(id)
    const sessionId = url.searchParams.get('session') || undefined
    const id = url.searchParams.get('id') || ''

    try {
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json')) {
          return send(415, { error: '需要 application/json 请求' })
        }
        if (pathname === '/context') {
          const context: Omit<StudioContext, 'selectionId'> = await readBody(req)
          if (typeof context.sessionId !== 'string' || !context.sessionId || !context.selection) {
            return send(400, { error: '缺少 Studio 会话或选区' })
          }
          const previous = sessions.get(context.sessionId)?.context
          const selection = context.selection
          const sameSelection = previous && previous.selection.assetId === selection.assetId &&
            previous.selection.elementId === selection.elementId && previous.selection.groupId === selection.groupId
          const selectionId = sameSelection ? previous.selectionId : randomUUID()
          const tabPrefix = context.sessionId.split(':')[0] + ':'
          for (const id of sessions.keys()) {
            if (id === context.sessionId || id.startsWith(tabPrefix)) sessions.delete(id)
          }
          sessions.set(context.sessionId, { context: { ...context, selectionId, ts: new Date().toISOString() }, seenAt: Date.now() })
          return send(204)
        }
        if (pathname === '/command') {
          const body = await readBody(req)
          return send(202, { id: enqueue(body.type, body.payload || {}, body.sessionId, body.current === true) })
        }
        if (pathname === '/command/result') {
          const body = await readBody(req)
          const item = pending.get(body.id)
          if (!item?.delivered || item.command.sessionId !== body.sessionId) return send(404)
          item.result ??= body.ok ? { ok: true, result: body.result } : {
            ok: false, error: String(body.error || '应用失败'), code: body.code || 'STUDIO_ERROR',
          }
          return send(204)
        }
      }
      if (req.method === 'GET') {
        if (pathname === '/command/next') {
          const session = sessions.get(sessionId)
          if (!session) return send(409)
          session.seenAt = now
          for (const item of pending.values()) {
            if (item.command.sessionId === sessionId && !item.delivered && now < item.expiresAt) {
              item.delivered = true
              return send(200, item.command)
            }
          }
          return send(204)
        }
        if (pathname === '/command/result') {
          const result = getResult(id)
          return result ? send(200, result) : send(204)
        }
        if (pathname === '/context' || pathname === '/health') {
          const context = getContext(sessionId)
          if (pathname === '/health') return send(200, { ok: true, hasContext: !!context, updatedAt: context?.ts ?? null })
          return context ? send(200, context) : send(204)
        }
      }
      send(404)
    } catch (error) {
      send(400, { code: error instanceof BridgeError ? error.code : 'INVALID_ARGUMENT', error: (error as Error).message })
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  }).catch((error) => {
    throw new Error(`无法启动本地桥 ${port}：${(error as Error).message}`)
  })

  return {
    port,
    getContext,
    async waitForContext(timeoutMs: number, { sessionId, after }: { sessionId?: string; after?: string } = {}) {
      const baseline = after ?? getContext(sessionId)?.selectionId
      const deadline = Date.now() + timeoutMs
      do {
        const context = getContext(sessionId)
        if (context && context.selectionId !== baseline) return context
        await new Promise((resolve) => setTimeout(resolve, 120))
      } while (Date.now() < deadline && server.listening)
      return null
    },
    async runCommand(type: BridgeCommand['type'], payload: BridgeCommand['payload'], sessionId?: string): Promise<BridgeResult> {
      const id = enqueue(type, payload, sessionId)
      while (server.listening) {
        const result = getResult(id)
        if (result) return result
        await new Promise((resolve) => setTimeout(resolve, 120))
      }
      return { ok: false, error: '本地桥已关闭' }
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}
