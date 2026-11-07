import fs from 'node:fs'
import path from 'node:path'
import { readProject, readProjectFile, readStdin, writeProject } from './io'
import { applyOps, findAsset, findElement, outline, validateProject, type ProjectFile, type ProjectOp } from '../lib/project'
import { bridgeCommandTimeout, type BridgeCommand, type BridgeResult, type StudioContext } from '../lib/bridge-protocol'
import { NUMERIC_STYLE, parseStylePatch } from '../lib/style-patch'
import { parseAnimationPatch, parseLayoutPatch } from '../lib/project-schema'
import { reviewInputHash } from '../lib/review/review'
import { reviewProjectFile } from './projectReview'
import { CliError, num, parseArgv, portOf, str, usage, type Flags } from './args'

const HELP = `mgsvg — MG SVG Studio 项目文件工具（Agent 可直接改文件）

用法：
  mgsvg init    <project> [--name 名称] [--force]
  mgsvg outline <project> [--asset <id>] [--elements] [--json]
  mgsvg apply   <project> --ops <file|-> [--dry-run] [--json]
  mgsvg add     <project> --svg <file> --name <name> [--x 0] [--y 0] [--width 0] [--height 0]
  mgsvg style   <project> --asset <id> --element <id|label> --set fill=#f00 [--set opacity=0.5] [--clear]
  mgsvg anim    <project> --asset <id> --group <id|name> --set duration=1.2 [--set ease=power2.out]
  mgsvg layer   <project> --asset <id> --group <id|name> --targets a,b,c [--stagger 0.08]
  mgsvg layout  <project> --asset <id> --container <id|label> --mode row --gap 40 [--cols 3] [--padding 0]
  mgsvg review <project> [--asset <id|name>] [--json] [--run] [--write]
  mgsvg bridge  [--port 7350]                  开本地选择桥（Agent 用它看你在选什么）
  mgsvg context [--bridge 7350] [--session <id>] [--wait 30] [--after <selectionId>] [--json]
  mgsvg live    [--bridge 7350] (--session <id> | --current) [--asset <id>] [--element <id>]
                --set fill=#f00 | --clear | --select <id|label> | --save | --review [--frame 0..1]
  mgsvg validate <project> [--json]
  mgsvg mcp     [--project <project>] [--bridge <port>]   启动 MCP server（stdio，可带选择桥）

context / bridge：
  bridge  常驻开一个 http://127.0.0.1:7350 的桥；Studio 用 ?bridge=7350 打开后，
          你选中什么都会推到桥上，Agent 读 context 就能知道是哪个元素。
  context 读当前选区。--wait 等选区变化，--after 可指定之前的 selectionId。
  live    在 Studio 中即时应用；--save 保存已链接的 .mgsvg。--review 评审未保存的素材，默认末帧。

review：
  默认读项目文件里存着的评审快照（面板跑过、保存过就有），并标出过期。
  --run      起无头 Chrome 打开正在跑的 Studio 现算一次（需要 --app，默认 http://localhost:5188）
  --write    把 --run 的结果写回项目文件
  --app <url>        Studio 地址
  --project-url <p>  Studio 上项目文件的可访问路径（默认按当前目录推算）

通用：
  --help            显示帮助
  --json            stdout 输出一个对象，含 ok、status、result 或 code、error

项目文件是 JSON：{ format, version, name, assets:[...] }，assets 里就是 svg / groups / overrides / layouts。
所有写操作先完整校验、再原子替换原文件，失败不会留下半个文件。
`


function fmtContext(ctx: StudioContext, oneLine: boolean): string {
  const asset = ctx.asset ? `${ctx.asset.name} (${ctx.asset.id})` : '-'
  const el = ctx.element
  if (oneLine) {
    const desc = el
      ? `${el.id}${el.label ? ' ' + el.label : ''}${el.text ? ` “${String(el.text).slice(0, 14)}”` : ''}`
      : '（未选元素）'
    return `${new Date(ctx.ts).toLocaleTimeString()} · ${asset} · ${desc}`
  }
  const lines: string[] = []
  const file = ctx.project?.file || ''
  lines.push(`项目：${ctx.project?.name || '-'}${file ? ` (${file})` : ''}`)
  lines.push(`会话：${ctx.sessionId}`)
  lines.push(`选区版本：${ctx.selectionId}`)
  lines.push(`素材：${asset}`)
  if (el) {
    const kindLabel: Record<string, string> = { text: '文字', shape: '图形', group: '组', image: '图片' }
    const kind = kindLabel[el.kind || ''] || el.kind || el.tag || ''
    lines.push(`选中：${el.id}  ${kind}${el.label ? `  label=${el.label}` : ''}`)
    if (el.text) lines.push(`文字：${el.text}`)
    if (el.rect) {
      lines.push(`位置：${Math.round(el.rect.x)},${Math.round(el.rect.y)}  ${Math.round(el.rect.width)}×${Math.round(el.rect.height)}`)
    }
    const ov = el.overrides && Object.keys(el.overrides).length ? el.overrides : null
    if (ov) lines.push(`覆盖：${JSON.stringify(ov)}`)
  } else {
    lines.push('选中：（只选了素材，没选元素）')
  }
  if (ctx.review) {
    const c = ctx.review.counts || {}
    lines.push(`评审：${ctx.review.gate} · 硬伤 ${c.FAIL ?? 0} · 提示 ${c.WARN ?? 0}`)
    for (const f of (ctx.review.findingsForElement || []).slice(0, 6)) {
      lines.push(`  · ${f.ruleId} ${f.level} ${f.title || ''}  ${f.measured ?? ''}${f.unit || ''}`)
    }
  }
  return lines.join('\n')
}

const argv = process.argv.slice(2)
const jsonMode = argv.slice(0, argv.indexOf('--') === -1 ? argv.length : argv.indexOf('--'))
  .some((arg) => arg === '--json' || arg.startsWith('--json='))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function success(status: string, result: unknown, human: () => void) {
  if (jsonMode) console.log(JSON.stringify({ ok: true, status, result }, null, 2))
  else human()
}

function checkProject(project: ProjectFile) {
  const result = validateProject(project)
  if (!result.ok) throw new CliError('VALIDATION_FAILED', '项目校验未通过', result.problems)
}

function saveProject(file: string, project: ProjectFile, flags: Flags, snapshot?: string) {
  checkProject(project)
  if (flags['dry-run']) return { file: path.resolve(file), written: false }
  return { file: writeProject(file, project, snapshot), written: true }
}

function setPairs(flags: Flags, numeric: Set<string>, parseOther: (value: string) => unknown) {
  const entries = new Map<string, unknown>()
  for (const pair of (flags.set as string[] | undefined) ?? []) {
    const eq = pair.indexOf('=')
    const key = pair.slice(0, eq).trim()
    if (eq < 1 || !key) usage(`--set 需要 key=value，收到：${pair}`)
    if (entries.has(key)) usage(`--set 属性 ${key} 只能传一次`)
    const raw = pair.slice(eq + 1)
    if (numeric.has(key)) {
      const number = raw.trim() ? Number(raw) : NaN
      if (!Number.isFinite(number)) usage(`--set ${key} 需要有限数字`)
      entries.set(key, number)
    } else entries.set(key, parseOther(raw))
  }
  return Object.fromEntries(entries)
}

async function bridgeFetch(url: string, options?: RequestInit, commandId?: string) {
  try {
    return await fetch(url, { ...options, signal: AbortSignal.timeout(2000) })
  } catch {
    if (commandId) throw new CliError('COMMAND_UNCONFIRMED', '无法读取命令结果，请先检查 Studio 状态', { commandId })
    throw new CliError('BRIDGE_UNREACHABLE', `读不到本地桥（${new URL(url).origin}）`)
  }
}

async function readContext(flags: Flags) {
  const port = portOf(flags, 'bridge', 7350)
  const wait = num(flags, 'wait') ?? 0
  if (wait < 0 || wait > 600) usage('--wait 需要 0–600 秒')
  const session = str(flags, 'session')
  const after = str(flags, 'after')
  if (after && !wait) usage('--after 需要同时指定 --wait')
  const query = session ? `?session=${encodeURIComponent(session)}` : ''
  const read = async () => {
    const response = await bridgeFetch(`http://127.0.0.1:${port}/context${query}`)
    if (response.status === 204) return null
    if (!response.ok) throw new CliError('BRIDGE_ERROR', `读取选区失败（HTTP ${response.status}）`)
    return await response.json() as StudioContext
  }
  let context = await read()
  if (wait) {
    const baseline = after ?? context?.selectionId
    const deadline = Date.now() + wait * 1000
    while ((!context || context.selectionId === baseline) && Date.now() < deadline) {
      await sleep(Math.min(250, deadline - Date.now()))
      context = await read()
    }
    if (!context || context.selectionId === baseline) throw new CliError('NO_NEW_SELECTION', '等待超时，期间没有新选区')
  }
  if (!context) throw new CliError(session ? 'SESSION_NOT_FOUND' : 'NO_CONTEXT', `未收到 Studio 选区，请检查页面是否已连接 ?bridge=${port}`)
  success('read', context, () => console.log(fmtContext(context, false)))
}

async function runLive(flags: Flags) {
  const sessionId = str(flags, 'session')
  const current = flags.current === true
  if (Boolean(sessionId) === current) usage('请使用 --session <id> 锁定目标，或显式传 --current')
  const asset = str(flags, 'asset')
  const element = str(flags, 'element')
  const select = str(flags, 'select')
  const set = Boolean(flags.set)
  const clear = flags.clear === true
  const save = flags.save === true
  const review = flags.review === true
  if ([set, clear, save, review, Boolean(select)].filter(Boolean).length !== 1) {
    usage('请选择一种操作：--set、--clear、--select、--save 或 --review')
  }
  if (sessionId && (set || clear) && (!asset || !element)) usage('锁定实时修改时需要 --asset 和 --element')
  if ((save && (asset || element)) || ((review || select) && element)) usage('该操作不接受此素材或元素参数')
  const frame = num(flags, 'frame')
  if (frame !== undefined && (!review || frame < 0 || frame > 1)) usage('--frame 只用于 --review，范围为 0–1')
  const type: BridgeCommand['type'] = save ? 'save' : review ? 'review' : select ? 'select' : clear ? 'style.clear' : 'style.set'
  const payload: BridgeCommand['payload'] = { asset, element: select || element, frame }
  if (set) payload.patch = parseStylePatch(setPairs(flags, NUMERIC_STYLE, (value) => value))

  const port = portOf(flags, 'bridge', 7350)
  const base = `http://127.0.0.1:${port}`
  const queued = await bridgeFetch(`${base}/command`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type, payload, sessionId, current }),
  })
  const { id, code, error } = await queued.json().catch(() => ({})) as { id?: string; code?: string; error?: string }
  if (!queued.ok || !id) throw new CliError(code || 'BRIDGE_ERROR', error || `桥拒绝了这条命令（HTTP ${queued.status}）`)
  const deadline = Date.now() + bridgeCommandTimeout(type) + 1000
  while (Date.now() < deadline) {
    const response = await bridgeFetch(`${base}/command/result?id=${encodeURIComponent(id)}`, undefined, id)
    if (response.status === 200) {
      const outcome = await response.json() as BridgeResult
      if (outcome.ok === false) throw new CliError(outcome.code || 'STUDIO_ERROR', outcome.error, { commandId: id })
      const status = save ? 'written' : review ? 'reviewed' : select ? 'selected' : 'applied'
      success(status, outcome.result, () => {
        const data = outcome.result as Record<string, any>
        if (save) console.log(`✓ 已保存 ${data.file}${data.dirty ? '，保存期间有新的未保存改动' : ''}`)
        else if (review) console.log(`${data.assetName}：${data.gate} · ${data.counts.FAIL} 硬伤 / ${data.counts.WARN} 提示`)
        else if (select) console.log(`✓ 已选中 ${data.selection?.elementId || data.selection?.assetId || '素材'}`)
        else console.log(`✓ ${data.element} ← ${JSON.stringify(data.overrides ?? null)}`)
      })
      return
    }
    if (response.status !== 204) break
    await sleep(120)
  }
  throw new CliError('COMMAND_UNCONFIRMED', '未收到 Studio 的结果，请先检查当前状态', { commandId: id })
}

async function main() {
  const { cmd, flags, file } = parseArgv(argv)
  if (flags.help || cmd === 'help') {
    success('help', HELP, () => console.log(HELP))
    return
  }
  if (cmd === 'mcp') {
    const { startMcpServer } = await import('../mcp/server')
    await startMcpServer(str(flags, 'project') || file, portOf(flags, 'bridge'))
    return
  }
  if (cmd === 'bridge') {
    const { startBridge } = await import('./bridge')
    const port = portOf(flags, 'port', 7350)
    const bridge = await startBridge(port)
    console.log(`选择桥已开在 http://127.0.0.1:${port}
在 Studio 地址中添加 ?bridge=${port}`)
    console.log('选中元素时这里会打印一行；Ctrl-C 退出')
    let last = ''
    const timer = setInterval(() => {
      const context = bridge.getContext()
      if (!context || context.selectionId === last) return
      last = context.selectionId
      console.log(fmtContext(context, true))
    }, 300)
    const stop = async () => {
      clearInterval(timer)
      await bridge.close()
    }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    return
  }
  if (cmd === 'context') return readContext(flags)
  if (cmd === 'live') return runLive(flags)

  if (cmd === 'init') {
    const target = file || str(flags, 'project')
    if (!target) usage('缺少项目文件路径')
    const abs = path.resolve(target)
    if (fs.existsSync(abs) && !flags.force) throw new CliError('FILE_EXISTS', `文件已存在：${abs}（加 --force 覆盖）`)
    const project: ProjectFile = {
      format: 'mg-svg-studio/project', version: 1,
      name: str(flags, 'name') || path.basename(target).replace(/\.(mgsvg|json)$/i, ''),
      updatedAt: new Date().toISOString(), assets: [],
    }
    const outcome = saveProject(abs, project, flags)
    success('written', outcome, () => console.log(`✓ 已创建 ${path.relative(process.cwd(), outcome.file)}`))
    return
  }
  if (!file) usage('缺少项目文件路径')
  if (cmd === 'validate') {
    const project = readProject(file)
    checkProject(project)
    success('validated', { assets: project.assets.length, problems: [] }, () => console.log(`✓ ${project.assets.length} 个素材，校验通过`))
    return
  }
  if (cmd === 'outline') {
    const project = readProject(file)
    const assetId = str(flags, 'asset')
    const assets = assetId ? [findAsset(project, assetId)] : project.assets
    const rows = assets.map((a) => ({
      id: a.id, name: a.name, size: [a.width, a.height], position: [a.x, a.y], kind: a.kind,
      groups: a.groups, layouts: a.layouts, overrides: a.overrides, elements: flags.elements ? a.elements : undefined,
      warnings: a.warnings,
    }))
    success('read', rows, () => console.log(outline(project, { assetId, elements: !!flags.elements })))
    return
  }

  if (cmd === 'review') {
    const target = str(flags, 'asset')
    if (flags.run) {
      const result = await reviewProjectFile({ file, target, appUrl: str(flags, 'app'), projectUrl: str(flags, 'project-url'),
        write: !!flags.write, dryRun: !!flags['dry-run'] })
      success(result.written ? 'written' : flags['dry-run'] ? 'dry_run' : 'reviewed', result, () => {
        for (const row of result.rows) console.log(`${row.assetName}：${row.gate} · ${row.counts.FAIL} 硬伤 / ${row.counts.WARN} 提示`)
        if (result.written) console.log(`✓ 已写入 ${result.file}`)
      })
    } else {
      if (flags.write || flags.app || flags['project-url'] || flags['dry-run']) usage('这些选项需要 --run')
      const project = readProject(file)
      const rows = (target ? [findAsset(project, target)] : project.assets).map((asset) => {
        const snap = asset.review
        const status = !snap ? 'none' : snap.inputHash === reviewInputHash(asset, snap.options) ? 'ok' : 'stale'
        return {
          id: asset.id, name: asset.name, status, review: status === 'ok' ? snap : null,
          lastReview: snap ? { gate: snap.gate, counts: snap.counts, generatedAt: snap.generatedAt } : null,
        }
      })
      success('read', rows, () => {
        const labels = { ok: '已评审', stale: '已过期', none: '未评审' }
        for (const row of rows) console.log(`${row.name}：${labels[row.status]}${row.lastReview ? ` · ${row.lastReview.gate}` : ''}`)
      })
    }
    return
  }

  const { project, snapshot } = readProjectFile(file)
  const asset = str(flags, 'asset') || ''
  const group = str(flags, 'group') || ''
  const element = str(flags, 'element') || ''
  let ops: ProjectOp[]
  switch (cmd) {
    case 'apply': {
      const input = str(flags, 'ops') || '-'
      const raw = input === '-' ? await readStdin() : fs.readFileSync(path.resolve(input), 'utf8')
      const parsed = JSON.parse(raw)
      ops = Array.isArray(parsed) ? parsed : parsed?.ops
      if (!Array.isArray(ops) || !ops.length) usage('ops 必须是非空数组或 { "ops": [...] }')
      break
    }
    case 'add': {
      const svgFile = str(flags, 'svg')
      if (!svgFile) usage('add 需要 --svg <file>')
      const width = num(flags, 'width')
      const height = num(flags, 'height')
      if ((width ?? 0) < 0 || (height ?? 0) < 0) usage('宽高不能小于 0')
      ops = [{ op: 'asset.add', svg: fs.readFileSync(path.resolve(svgFile), 'utf8'),
        name: str(flags, 'name') || path.basename(svgFile, '.svg'), width, height, x: num(flags, 'x'), y: num(flags, 'y') }]
      break
    }
    case 'style':
      if (!!flags.clear === !!flags.set) usage('style 需要 --set key=value 或 --clear')
      ops = flags.clear ? [{ op: 'style.clear', asset, element }] :
        [{ op: 'style.set', asset, element, patch: parseStylePatch(setPairs(flags, NUMERIC_STYLE, (value) => value)) }]
      break
    case 'anim': {
      if (!flags.set) usage('anim 需要 --set key=value')
      const numbers = new Set(['duration', 'delay', 'stagger'])
      const patch = setPairs(flags, numbers, (value) => {
        const text = value.trim()
        if (text === 'true' || text === 'false') return text === 'true'
        return text && Number.isFinite(Number(text)) ? Number(text) : value
      })
      ops = [{ op: 'anim.update', asset, group, patch: parseAnimationPatch(patch) }]
      break
    }
    case 'layer': {
      const targets = (str(flags, 'targets') || '').split(',').map((value) => value.trim()).filter(Boolean)
      if (!targets.length) usage('layer 需要 --targets a,b,c')
      ops = [{ op: 'anim.layer', asset, group, targets, stagger: num(flags, 'stagger') }]
      break
    }
    case 'layout': {
      const container = findElement(findAsset(project, asset), str(flags, 'container') || '')
      const patch: Record<string, unknown> = {}
      for (const [flag, field] of Object.entries({ mode: 'mode', 'align-x': 'alignX', 'align-y': 'alignY', justify: 'justify' })) {
        if (flags[flag] !== undefined) patch[field] = str(flags, flag)
      }
      for (const [flag, field] of Object.entries({ gap: 'gap', 'row-gap': 'rowGap', padding: 'padding', cols: 'cols', width: 'width', 'max-width': 'maxWidth' })) {
        if (flags[flag] !== undefined) patch[field] = num(flags, flag)
      }
      if (flags.wrap && flags['no-wrap']) usage('--wrap 和 --no-wrap 只能选一个')
      if (flags.wrap || flags['no-wrap']) patch.wrap = Boolean(flags.wrap)
      if (!Object.keys(patch).length) usage('layout 至少需要一个布局参数')
      const before = findAsset(project, asset).layouts?.[container.id]
      ops = [{ op: 'layout.set', asset, container: container.id, spec: { ...before, ...parseLayoutPatch(patch) } }]
      break
    }
    default:
      usage(`未知命令：${cmd}`)
  }
  const { project: next, log } = applyOps(project, ops)
  const outcome = saveProject(file, next, flags, snapshot)
  success(outcome.written ? 'written' : 'dry_run', { ...outcome, log }, () => {
    for (const item of log) console.log(`  ${item.index}. ${item.op} → ${item.detail}`)
    console.log(outcome.written ? `✓ 已写入 ${outcome.file}` : '（dry-run，未写入）')
  })
}

main().catch((error) => {
  const message = (error as Error).message || String(error)
  const code = error instanceof CliError ? error.code : 'COMMAND_FAILED'
  const details = error instanceof CliError ? error.details : undefined
  if (jsonMode) console.log(JSON.stringify({ ok: false, status: 'failed', code, error: message, details }, null, 2))
  else {
    console.error('✗ ' + message)
    if (Array.isArray(details)) for (const detail of details) console.error('  - ' + detail)
  }
  process.exitCode = code === 'INVALID_ARGUMENT' ? 2 : 1
})
