import fs from 'node:fs'
import path from 'node:path'
import { readProject, readProjectFile, readStdin, writeProject } from './io'
import { applyOps, findAsset, findElement, outline, validateProject, type ProjectFile, type ProjectOp } from '../lib/project'
import { bridgeCommandTimeout, type BridgeCommand, type BridgeResult, type StudioContext } from '../lib/bridge-protocol'
import { NUMERIC_STYLE, parseStylePatch } from '../lib/style-patch'
import { parseAnimationPatch, parseLayoutPatch } from '../lib/project-schema'
import { looksLikeGsapSvg, looksLikeLottie } from '../lib/native/detect'
import { reviewInputHash } from '../lib/review/review'
import { agentPromptForProject, reviewProjectFile, saveAgentReviewResult } from './projectReview'
import { CliError, num, parseArgv, portOf, str, usage, type Flags } from './args'

const HELP = `mgsvg — MG SVG Studio 项目文件工具（Agent 可直接改文件）

用法：
  mgsvg init    <project> [--name 名称] [--force]
  mgsvg outline <project> [--asset <id>] [--elements] [--json]
  mgsvg apply   <project> --ops <file|-> [--dry-run] [--json]
  mgsvg add     <project> --svg <file> --name <name> [--x 0] [--y 0] [--width 0] [--height 0] [--dry-run]
  mgsvg replace <project> --asset <id> --svg <file> [--dry-run]
  mgsvg style   <project> --asset <id> --element <id|label> --set fill=#f00 [--set opacity=0.5] [--clear]
  mgsvg anim    <project> --asset <id> --group <id|name> --set duration=1.2 [--set ease=power2.out]
  mgsvg layer   <project> --asset <id> --group <id|name> --targets a,b,c [--stagger 0.08]
  mgsvg layout  <project> --asset <id> --container <id|label> --mode row --gap 40 [--cols 3] [--padding 0]
  mgsvg review <project> [--asset <id|name>] [--json] [--run] [--write]
  mgsvg review <project> --agent-prompt --asset <id|name> [--app <url>] [--project-url <path>]
  mgsvg review <project> --agent-result <file|-> --asset <id|name> (--write | --dry-run)
  mgsvg version list|restore|delete --asset <id> (--session <id> | --current) [--id v] [--ids v,v]
  mgsvg bridge  [--port 7350]                  开本地选择桥（Agent 用它看你在选什么）
  mgsvg context [--bridge 7350] [--session <id>] [--wait 30] [--after <selectionId>] [--json]
  mgsvg live    [--bridge 7350] (--session <id> | --current) [--asset <id>] [--element <id>]
                --set fill=#f00 | --clear | --select <id|label> | --add <svg> [--name 名称] | --asset <id> --replace <svg文件>（原地替换） | --asset <id> --remove（删除） | --asset <目标> --merge <素材id,...> | --asset <id> --restore <版本id> | --save [--force] | --reload | --review [--frame 0..1]
  mgsvg validate <project> [--json]
  mgsvg mcp     [--project <project>] [--bridge <port>]   启动 MCP server（stdio，可带选择桥）

context / bridge：
  bridge  常驻开一个 http://127.0.0.1:7350 的桥；Studio 默认连接此端口，
          你选中什么都会推到桥上，Agent 读 context 就能知道是哪个元素。
  context 读当前选区。--wait 等选区变化，--after 可指定之前的 selectionId。
  live    在 Studio 中即时应用；--add 直接加入当前素材库并自动排布。--save 保存已链接的 .mgsvg。
          --reload 从已链接文件重新载入；--review 评审未保存的素材，默认末帧。
          多个页面连接同一桥时优先用 --session 锁定目标。

review：
  默认读项目文件里存着的评审快照（面板跑过、保存过就有），并标出过期。
  --run      起无头 Chrome 打开正在跑的 Studio 现算一次（需要 --app，默认 http://localhost:5188）
  --write    把 --run 的结果写回项目文件
  --agent-prompt 生成带当前末帧 SVG 和规则指纹的 Agent 语义评审提示词
  --agent-result  导入 Agent 返回的 JSON；--write 保存，--dry-run 只校验，路径为 - 时从 stdin 读取
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
  if (!context) throw new CliError(session ? 'SESSION_NOT_FOUND' : 'NO_CONTEXT', `未收到 Studio 选区，请确认本机 7350 端口的桥已启动，并刷新 Studio 页面`)
  success('read', context, () => console.log(fmtContext(context, false)))
}

async function runLive(flags: Flags) {
  const sessionId = str(flags, 'session')
  const current = flags.current === true
  if (Boolean(sessionId) === current) usage('请使用 --session <id> 锁定目标，或显式传 --current')
  const batchAssets = (str(flags, 'assets') || '').split(',').map((v) => v.trim()).filter(Boolean)
  const asset = str(flags, 'asset') || batchAssets[0]
  const element = str(flags, 'element')
  const select = str(flags, 'select')
  const set = Boolean(flags.set)
  const clear = flags.clear === true
  const save = flags.save === true
  const reload = flags.reload === true
  const review = flags.review === true
  const add = str(flags, 'add')
  const merge = str(flags, 'merge')
  const replace = str(flags, 'replace')
  const remove = !!flags.remove
  const listVersions = !!flags.versions
  const restoreVersion = str(flags, 'restore')
  const deleteVersions = str(flags, 'delete-versions')
  if (merge && (!asset || add)) usage('--merge 需要 --asset 指定目标素材')
  const name = str(flags, 'name')
  if ([set, clear, save, reload, review, Boolean(select), Boolean(add), Boolean(merge), Boolean(replace), Boolean(remove), Boolean(listVersions && asset), Boolean(restoreVersion && asset), Boolean(deleteVersions && asset)].filter(Boolean).length !== 1) {
    usage('请选择一种操作：--set、--clear、--select、--add、--save、--reload 或 --review')
  }
  if (sessionId && (set || clear) && (!asset || !element)) usage('锁定实时修改时需要 --asset 和 --element')
  if (((save || reload) && (asset || element)) || ((review || select) && element) || (add && (asset || element || select))) usage('该操作不接受此素材或元素参数')
  if (name && !add) usage('--name 只用于 --add')
  const frame = num(flags, 'frame')
  if (frame !== undefined && (!review || frame < 0 || frame > 1)) usage('--frame 只用于 --review，范围为 0–1')
  const type: BridgeCommand['type'] = save
    ? 'save'
    : reload
      ? 'project.reload'
      : review
        ? 'review'
        : select
          ? 'select'
          : add
            ? 'asset.add'
            : merge && asset
              ? 'asset.mergeVersions'
              : replace && asset
                ? 'asset.replaceSvg'
                : remove && asset
                  ? 'asset.remove'
              : listVersions && asset
                ? 'asset.versions'
                : restoreVersion && asset
                  ? 'asset.restoreVersion'
                  : deleteVersions && asset
                    ? 'asset.deleteVersions'
              : clear
                ? 'style.clear'
                : 'style.set'
  const payload: BridgeCommand['payload'] = { asset, element: select || element, frame }
  if (set) payload.patch = parseStylePatch(setPairs(flags, NUMERIC_STYLE, (value) => value))
  if (merge) payload.sources = merge.split(',').map((v) => v.trim()).filter(Boolean)
  if (replace) payload.svg = fs.readFileSync(path.resolve(replace), 'utf8')
  if (restoreVersion) payload.versionId = restoreVersion
  if (deleteVersions) payload.versionIds = deleteVersions.split(',').map((v) => v.trim()).filter(Boolean)
  if (save && flags.force) payload.force = true
  if (add) {
    payload.svg = fs.readFileSync(path.resolve(add), 'utf8')
    payload.name = name || path.basename(add, path.extname(add))
  }

  const port = portOf(flags, 'bridge', 7350)
  const base = `http://127.0.0.1:${port}`
  const multi = (str(flags, 'assets') || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)
  const targets = multi.length ? multi : (asset ? [asset] : [])
  if (!targets.length) {
    const result = await sendLiveCommand(base, type, payload, sessionId, current)
    if (flags.json) console.log(JSON.stringify(result, null, 2))
    else console.log(describeLiveResult(type, result, { add, replace, remove, merge, restoreVersion, deleteVersions }))
    return
  }
  const collected: unknown[] = []
  for (const target of targets) {
    const result = await sendLiveCommand(base, type, { ...payload, asset: target }, sessionId, current)
    collected.push(result)
    if (!flags.json) console.log(describeLiveResult(type, result, { add, replace, remove, merge, restoreVersion, deleteVersions }))
  }
  if (flags.json) console.log(JSON.stringify(collected.length === 1 ? collected[0] : collected, null, 2))
}


function describeLiveResult(type: BridgeCommand['type'], raw: unknown, flags: Record<string, unknown>): string {
  const d = (raw ?? {}) as Record<string, any>
  switch (type) {
    case 'save':
      return `✓ 已保存 ${d.file ?? ''}${d.dirty ? '，保存期间有新的未保存改动' : ''}`
    case 'project.reload':
      return `✓ 已重新载入 ${d.file ?? ''}（${d.assets ?? 0} 个素材）`
    case 'review':
      return `${d.assetName ?? d.asset ?? ''}：${d.gate ?? '?'} · ${d.counts?.FAIL ?? 0} 硬伤 / ${d.counts?.WARN ?? 0} 提示`
    case 'select':
      return `✓ 已选中 ${d.selection?.elementId || d.selection?.assetId || '素材'}`
    case 'asset.add':
      return `✓ 已添加 ${d.name ?? ''}（${d.asset ?? ''}）${d.width ?? '?'}×${d.height ?? '?'}`
    case 'asset.versions':
      return d.versions?.length
        ? (d.versions as any[]).map((v) => `v${v.index}  ${v.createdAt ? new Date(v.createdAt).toLocaleString() : ''}  ${v.bytes ?? ''}B`).join('\n')
        : '这个素材还没有版本记录'
    case 'asset.mergeVersions':
      return `✓ 已并入 ${d.merged ?? 0} 个版本，当前最高 v${d.index ?? '?'}`
    case 'asset.restoreVersion':
      return `✓ 已恢复到 v${d.index ?? '?'}（${d.width ?? '?'}×${d.height ?? '?'}）`
    case 'asset.deleteVersions':
      return `✓ 已删除 ${d.removed ?? 0} 个版本`
    case 'asset.replaceSvg':
      return `✓ 已替换素材内容（${d.width ?? '?'}×${d.height ?? '?'}）`
    case 'asset.remove':
      return `✓ 已删除素材「${d.name ?? ''}」`
    case 'style.clear':
      return `✓ 已清除 ${d.element ?? '元素'} 的样式覆盖`
    default:
      return `✓ 已更新 ${d.element ?? '元素'}${d.overrides ? `：${Object.keys(d.overrides).join(', ')}` : ''}`
  }
}


async function sendLiveCommand(
  base: string,
  type: BridgeCommand['type'],
  payload: BridgeCommand['payload'],
  sessionId: string | undefined,
  current: boolean,
): Promise<unknown> {
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
      return outcome.result
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
Studio 默认连接本机 7350 端口；如果刚启动桥，请刷新 Studio 页面`)
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
  if (cmd === 'version') {
    // 版本子命令：把 list/restore/delete 翻译成 live 的等价参数，复用同一套发送逻辑
    const sub = file || 'list'
    const target = str(flags, 'asset')
    if (!target) usage('version 需要 --asset 指定素材')
    if (sub === 'list') (flags as Record<string, unknown>).versions = true
    else if (sub === 'restore') {
      const id = str(flags, 'id')
      if (!id) usage('version restore 需要 --id <版本 id>')
      ;(flags as Record<string, unknown>).restore = id
    } else if (sub === 'delete') {
      const ids = str(flags, 'ids')
      if (!ids) usage('version delete 需要 --ids <版本 id,...>')
      ;(flags as Record<string, unknown>)['delete-versions'] = ids
    } else usage('version 支持 list / restore / delete')
    return runLive(flags)
  }
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
      // 原生素材（lottie / gsap）的动画在运行时里：没有元素索引，也没有轨道，
      // 逐元素与轨道类命令都不适用。这里显式给出，免得 Agent 靠 kind 猜。
      format: a.format || 'svg',
      duration: a.duration,
      editable: (a.format || 'svg') === 'svg',
      groups: a.groups, layouts: a.layouts, overrides: a.overrides, elements: flags.elements ? a.elements : undefined,
      warnings: a.warnings,
    }))
    success('read', rows, () => console.log(outline(project, { assetId, elements: !!flags.elements })))
    return
  }

  if (cmd === 'review') {
    const target = str(flags, 'asset')
    const agentPrompt = !!flags['agent-prompt']
    const agentResultFile = str(flags, 'agent-result')
    if (agentPrompt && agentResultFile) usage('--agent-prompt 与 --agent-result 不能同时使用')
    if ((agentPrompt || agentResultFile) && flags.run) usage('Agent 提示词/结果导入与 --run 不能同时使用')
    if (agentPrompt) {
      if (!target) usage('--agent-prompt 需要 --asset 指定单个素材')
      if (flags.write || flags['dry-run']) usage('--agent-prompt 不接收 --write 或 --dry-run')
      const result = await agentPromptForProject({ file, target, appUrl: str(flags, 'app'), projectUrl: str(flags, 'project-url') })
      success('agent_prompt', result, () => console.log(result.prompt))
    } else if (agentResultFile) {
      if (!target) usage('--agent-result 需要 --asset 指定单个素材')
      if (!flags.write && !flags['dry-run']) usage('--agent-result 需要 --write；可加 --dry-run 预览')
      if (str(flags, 'app') || str(flags, 'project-url')) usage('--app 和 --project-url 只用于 --run 或 --agent-prompt')
      const raw = agentResultFile === '-' ? await readStdin() : fs.readFileSync(path.resolve(agentResultFile), 'utf8')
      const result = saveAgentReviewResult({ file, target, document: raw, write: !!flags.write, dryRun: !!flags['dry-run'] })
      success(result.written ? 'agent_result_written' : 'agent_result_dry_run', result, () => {
        console.log(`${result.assetName}：导入 Agent 结论 ${result.agentReview.results.length} 条${result.written ? '（已保存）' : '（未写入）'}`)
      })
    } else if (flags.run) {
      const result = await reviewProjectFile({ file, target, appUrl: str(flags, 'app'), projectUrl: str(flags, 'project-url'),
        write: !!flags.write, dryRun: !!flags['dry-run'] })
      success(result.written ? 'written' : flags['dry-run'] ? 'dry_run' : 'reviewed', result, () => {
        for (const row of result.rows) console.log(`${row.assetName}：${row.gate} · ${row.counts.FAIL} 硬伤 / ${row.counts.WARN} 提示`)
        if (result.written) console.log(`✓ 已写入 ${result.file}`)
      })
    } else {
      if (flags.write || flags.app || flags['project-url'] || flags['dry-run']) usage('这些选项需要 --run、--agent-prompt 或 --agent-result')
      const project = readProject(file)
      const rows = (target ? [findAsset(project, target)] : project.assets).map((asset) => {
        const snap = asset.review
        const status = !snap ? 'none' : snap.inputHash === reviewInputHash(asset, snap.options) ? 'ok' : 'stale'
        const agentSnap = asset.agentReview
        const agentStatus = !agentSnap ? 'none' : agentSnap.inputHash === reviewInputHash(asset, agentSnap.options) ? 'ok' : 'stale'
        return {
          id: asset.id, name: asset.name, status, review: status === 'ok' ? snap : null,
          lastReview: snap ? { gate: snap.gate, counts: snap.counts, generatedAt: snap.generatedAt } : null,
          agentReviewStatus: agentStatus,
          agentReview: agentStatus === 'ok' ? agentSnap : null,
          lastAgentReview: agentSnap ? { generatedAt: agentSnap.generatedAt, results: agentSnap.results.length } : null,
        }
      })
      success('read', rows, () => {
        const labels = { ok: '已评审', stale: '已过期', none: '未评审' }
        for (const row of rows) {
          console.log(`${row.name}：规则 ${labels[row.status]}${row.lastReview ? ` · ${row.lastReview.gate}` : ''} · Agent ${labels[row.agentReviewStatus]}${row.lastAgentReview ? ` · ${row.lastAgentReview.results} 条` : ''}`)
          if (row.status === 'ok' && row.review) {
            for (const finding of row.review.findings) {
              const measured = finding.measured === null ? '未测' : `${finding.measured}${finding.unit ? ` ${finding.unit}` : ''}`
              console.log(`  ${finding.level.padEnd(10)} ${finding.ruleId} ${finding.title} · ${finding.element || '画面级'} · ${measured}`)
            }
          }
          if (row.agentReviewStatus === 'ok' && row.agentReview) {
            const agentLabels = { positive: '正例', negative: '反例', unmeasured: '未测' }
            for (const result of row.agentReview.results) {
              console.log(`  Agent ${agentLabels[result.result]} ${result.ruleId} · ${result.reason}${result.elementId ? ` · ${result.elementId}` : ''}`)
            }
          }
        }
      })
    }
    return
  }

  const { project, snapshot } = readProjectFile(file)
  const batchAssets = (str(flags, 'assets') || '').split(',').map((v) => v.trim()).filter(Boolean)
  const asset = str(flags, 'asset') || batchAssets[0] || ''
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
      const text = fs.readFileSync(path.resolve(svgFile), 'utf8')
      const base = path.basename(svgFile).replace(/\.(svg|json)$/i, '')
      const native = looksLikeLottie(text) ? 'lottie' : looksLikeGsapSvg(text) ? 'gsap' : undefined
      ops = [{ op: 'asset.add', ...(native ? { format: native, payload: text } : { svg: text }),
        name: str(flags, 'name') || base, width, height, x: num(flags, 'x'), y: num(flags, 'y') }]
      break
    }
    case 'replace': {
      const svgFile = str(flags, 'svg')
      if (!asset) usage('replace 需要 --asset <id>')
      if (!svgFile) usage('replace 需要 --svg <file>')
      ops = [{ op: 'asset.update', asset, patch: { svg: fs.readFileSync(path.resolve(svgFile), 'utf8') } }]
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
