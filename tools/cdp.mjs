import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'

const URL = process.argv[2] || 'http://localhost:4179/'
const EXPR = process.argv[3] || 'window.__state'
const OUT = process.argv[4] || '/tmp/cdp-shot.png'
const WAIT = Number(process.argv[5] || 3500)
const W = Number(process.env.VW || 1600)
const H = Number(process.env.VH || 1000)
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9333 + Math.floor(Math.random() * 300)
const userDir = process.env.UD || `/tmp/chrome-cdp-${port}-${Date.now()}`

const proc = spawn(chrome, [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--hide-scrollbars',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDir}`,
  `--window-size=${W},${H}`,
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  let list = null
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`)
      list = await res.json()
      if (list?.length) break
    } catch {}
    await sleep(150)
  }
  const page = list.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  let id = 0
  const pending = new Map()
  const logs = []
  const reqs = new Map()
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg)
      pending.delete(msg.id)
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push(`[console.${msg.params.type}] ` + msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '))
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('[exception] ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text))
    } else if (msg.method === 'Network.requestWillBeSent') {
      reqs.set(msg.params.requestId, msg.params.request.url)
    } else if (msg.method === 'Network.loadingFailed') {
      logs.push(`[net-failed] ${msg.params.errorText} ${msg.params.type} ${reqs.get(msg.params.requestId) || ''}`)
    } else if (msg.method === 'Log.entryAdded') {
      logs.push(`[log.${msg.params.entry.level}] ${msg.params.entry.text}`)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const mid = ++id
      pending.set(mid, resolve)
      ws.send(JSON.stringify({ id: mid, method, params }))
    })
  await new Promise((r) => (ws.onopen = r))
  await send('Runtime.enable')
  if (process.env.NET) await send('Network.enable')
  await send('Log.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: URL })
  await sleep(WAIT)
  if (process.env.PRECMD) {
    try {
      execSync(process.env.PRECMD, { cwd: process.cwd(), stdio: 'inherit' })
    } catch (err) {
      console.error('PRECMD failed', err.message)
    }
  }
  const evalRes = await send('Runtime.evaluate', { expression: EXPR, returnByValue: true, awaitPromise: true })
  if (process.env.RELOAD) {
    await send('Page.reload', { ignoreCache: false })
    await sleep(2500)
    const second = await send('Runtime.evaluate', { expression: process.env.EXPR2 || EXPR, returnByValue: true, awaitPromise: true })
    console.log('--- after reload ---')
    console.log(JSON.stringify(second.result?.value ?? second.result?.description ?? second, null, 1))
  }
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  if (shot.result?.data) fs.writeFileSync(OUT, Buffer.from(shot.result.data, 'base64'))
  console.log(JSON.stringify(evalRes.result?.value ?? evalRes.result?.description ?? evalRes, null, 1))
  if (logs.length) console.log('--- logs ---\n' + logs.join('\n'))
  ws.close()
  proc.kill('SIGKILL')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  proc.kill('SIGKILL')
  process.exit(1)
})
