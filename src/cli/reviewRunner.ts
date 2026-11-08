import { spawn } from 'node:child_process'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ReviewJob, ReviewJobMode, ReviewJobResult } from '../lib/review/job'
import { CliError } from './args'

const CHROME_CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new CliError('REVIEW_TIMEOUT', message)), ms)
    void promise.then(resolve, reject).finally(() => clearTimeout(timer))
  })
}

export async function reviewInBrowser(opts: {
  appUrl: string
  projectUrl: string
  target: string
  mode?: ReviewJobMode
  timeoutMs?: number
}): Promise<ReviewJobResult> {
  const chrome = CHROME_CANDIDATES.find((candidate) => candidate && fs.existsSync(candidate))
  if (!chrome) throw new CliError('CHROME_NOT_FOUND', '找不到 Chrome/Chromium，请用 CHROME 指定可执行文件')
  if (typeof WebSocket !== 'function') throw new CliError('WEBSOCKET_UNAVAILABLE', '当前 Node 版本没有 WebSocket，请使用 Node 22 或以上')
  const url = new URL(opts.appUrl)
  url.searchParams.set('project', opts.projectUrl)
  url.searchParams.set('review', opts.target)
  url.searchParams.set('review-job', '1')
  if (opts.mode && opts.mode !== 'rules') url.searchParams.set('review-kind', opts.mode)
  const profile = fs.mkdtempSync(path.join(tmpdir(), 'mgsvg-review-'))
  const portFile = path.join(profile, 'DevToolsActivePort')
  const chromeProcess = spawn(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run',
    '--disable-extensions', '--remote-debugging-port=0', '--window-size=1600,1000',
    `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' })
  let launchError: Error | undefined
  chromeProcess.on('error', (error) => { launchError = error })
  const closed = new Promise<void>((resolve) => chromeProcess.once('close', () => resolve()))
  let ws: WebSocket | undefined

  try {
    let endpoint: string | undefined
    const startupDeadline = Date.now() + 10000
    while (!endpoint && Date.now() < startupDeadline && !launchError && chromeProcess.exitCode === null) {
      try {
        const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0])
        const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1000) })
        const pages = await response.json() as { type: string; webSocketDebuggerUrl?: string }[]
        endpoint = pages.find((page) => page.type === 'page')?.webSocketDebuggerUrl
      } catch {
        // Chrome creates the port file after the debugger starts.
      }
      if (!endpoint) await sleep(150)
    }
    if (!endpoint) throw new CliError('CHROME_START_FAILED', launchError?.message || 'Chrome 调试端口无响应')

    const socket = new WebSocket(endpoint)
    ws = socket
    await withTimeout(new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', () => reject(new CliError('CHROME_CONNECTION_FAILED', '无法连接 Chrome 调试端口')), { once: true })
    }), 5000, '连接 Chrome 超时')

    let seq = 0
    type Reply = { id: number; result?: any; error?: { message: string } }
    const pending = new Map<number, (reply: Reply) => void>()
    socket.addEventListener('message', (event) => {
      const reply = JSON.parse(String(event.data)) as Reply
      pending.get(reply.id)?.(reply)
    })
    const send = async (method: string, params: Record<string, unknown>) => {
      const id = ++seq
      try {
        const reply = await withTimeout(new Promise<Reply>((resolve) => {
          pending.set(id, resolve)
          socket.send(JSON.stringify({ id, method, params }))
        }), 5000, 'Chrome 调试请求超时')
        if (reply.error) throw new CliError('CHROME_CONNECTION_FAILED', reply.error.message)
        return reply.result
      } finally {
        pending.delete(id)
      }
    }

    const navigation = await send('Page.navigate', { url: url.href })
    if (navigation.errorText) throw new CliError('STUDIO_UNAVAILABLE', navigation.errorText)
    const deadline = Date.now() + (opts.timeoutMs ?? 45000)
    while (Date.now() < deadline) {
      await sleep(400)
      const reply = await send('Runtime.evaluate', {
        expression: 'JSON.stringify(window.__mgsvgReviewJob)',
        returnByValue: true,
      })
      const raw = reply?.result?.value
      if (!raw) continue
      const job = JSON.parse(raw) as ReviewJob
      if (job.ok === false) throw new CliError('REVIEW_FAILED', job.error)
      return job.result
    }
    throw new CliError('REVIEW_TIMEOUT', `等不到评审结果，请确认 ${opts.appUrl} 可打开且支持 CLI 评审`)
  } finally {
    ws?.close()
    chromeProcess.kill('SIGKILL')
    await Promise.race([closed, sleep(500)])
    try { fs.rmSync(profile, { recursive: true, force: true }) } catch { /* Chrome may still be releasing profile files. */ }
  }
}
