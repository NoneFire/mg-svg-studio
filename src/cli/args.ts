type Option = 'switch' | 'value' | 'repeat'
const commands = {
  help: {},
  init: { project: 'value', name: 'value', force: 'switch' },
  outline: { asset: 'value', elements: 'switch' },
  validate: {},
  apply: { ops: 'value', 'dry-run': 'switch' },
  add: { svg: 'value', name: 'value', x: 'value', y: 'value', width: 'value', height: 'value', 'dry-run': 'switch' },
  replace: { asset: 'value', svg: 'value', 'dry-run': 'switch' },
  style: { asset: 'value', element: 'value', set: 'repeat', clear: 'switch', 'dry-run': 'switch' },
  anim: { asset: 'value', group: 'value', set: 'repeat', 'dry-run': 'switch' },
  layer: { asset: 'value', group: 'value', targets: 'value', stagger: 'value', 'dry-run': 'switch' },
  layout: {
    asset: 'value', container: 'value', mode: 'value', gap: 'value', 'row-gap': 'value', padding: 'value',
    cols: 'value', width: 'value', 'max-width': 'value', 'align-x': 'value', 'align-y': 'value', justify: 'value',
    wrap: 'switch', 'no-wrap': 'switch', 'dry-run': 'switch',
  },
  review: {
    asset: 'value', run: 'switch', write: 'switch', app: 'value', 'project-url': 'value', 'dry-run': 'switch',
    'agent-prompt': 'switch', 'agent-result': 'value',
  },
  context: { bridge: 'value', session: 'value', wait: 'value', after: 'value' },
  live: {
    bridge: 'value', session: 'value', current: 'switch', asset: 'value', element: 'value', set: 'repeat',
    clear: 'switch', select: 'value', save: 'switch', reload: 'switch', review: 'switch', frame: 'value', add: 'value', name: 'value', merge: 'value', replace: 'value', force: 'switch', versions: 'switch', restore: 'value', 'delete-versions': 'value',
  },
  bridge: { port: 'value' },
  mcp: { project: 'value', bridge: 'value' },
} as const satisfies Record<string, Record<string, Option>>

export class CliError extends Error {
  constructor(public code: string, message: string, public details?: unknown) { super(message) }
}

export function usage(message: string): never {
  throw new CliError('INVALID_ARGUMENT', message)
}

export type Flags = Record<string, true | string | string[]>

export function parseArgv(argv: string[]) {
  const [first, ...tail] = argv
  const cmd = !first || first === '--help' || first === '-h' ? 'help' : first
  if (!Object.prototype.hasOwnProperty.call(commands, cmd)) usage(`未知命令：${cmd}`)
  const specs: Record<string, Option> = { help: 'switch', json: 'switch', ...commands[cmd as keyof typeof commands] }
  const flags: Flags = Object.create(null)
  const positional: string[] = []
  for (let i = 0; i < tail.length; i++) {
    const arg = tail[i]
    if (arg === '--') {
      positional.push(...tail.slice(i + 1))
      break
    }
    if (!arg.startsWith('--') && arg !== '-h') {
      if (arg.startsWith('-')) usage(`未知参数：${arg}`)
      positional.push(arg)
      continue
    }
    const eq = arg.indexOf('=')
    const key = arg === '-h' ? 'help' : arg.slice(2, eq >= 0 ? eq : undefined)
    const option = Object.prototype.hasOwnProperty.call(specs, key) ? specs[key] : undefined
    if (!option) usage(`未知参数：--${key}`)
    if (flags[key] !== undefined && option !== 'repeat') usage(`参数 --${key} 只能传一次`)
    if (option === 'switch') {
      if (eq >= 0) usage(`参数 --${key} 不接收值`)
      flags[key] = true
      continue
    }
    const value = eq >= 0 ? arg.slice(eq + 1) : tail[++i]
    if (!value?.trim() || value.startsWith('--') || value === '-h') usage(`参数 --${key} 缺少值`)
    if (option === 'repeat') flags[key] = [...((flags[key] as string[]) || []), value]
    else flags[key] = value
  }
  const projectless = ['bridge', 'context', 'live', 'help'].includes(cmd)
  if (positional.length > (projectless ? 0 : 1)) usage(`多余的位置参数：${positional.join(' ')}`)
  if (flags.json && (cmd === 'bridge' || cmd === 'mcp') && !flags.help) usage(`${cmd} 是常驻命令，不接收 --json`)
  return { cmd, flags, file: positional[0] }
}

export function str(flags: Flags, key: string) {
  return flags[key] as string | undefined
}

export function num(flags: Flags, key: string) {
  const text = str(flags, key)
  if (text === undefined) return undefined
  const value = Number(text)
  if (!Number.isFinite(value)) usage(`参数 --${key} 需要有限数字`)
  return value
}

export function portOf(flags: Flags, key: string, fallback?: number) {
  const port = num(flags, key) ?? (process.env.MGSVG_BRIDGE?.trim() ? Number(process.env.MGSVG_BRIDGE) : fallback)
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) {
    usage(`--${key} 或 MGSVG_BRIDGE 必须是 1–65535 的端口`)
  }
  return port
}
