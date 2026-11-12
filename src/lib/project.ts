import type { AnimGroup, Asset, AssetVersion, ProjectElement, StylePatch } from '../types'
import { DEFAULT_LAYOUT, type LayoutSpec } from './layout/types'
import { parseSvgDocument } from './svg-doc'
import { looksLikeGsapSvg, looksLikeLottie } from './native/detect'
import { parseStylePatch } from './style-patch'
import { animationSchema, parseAnimationPatch, parseKeyframes, parseLayoutPatch, schemaProblems } from './project-schema'

export const PROJECT_FORMAT = 'mg-svg-studio/project'
/** 2：历史版本从浏览器搬到 assets[].versions，随项目文件走 */
export const PROJECT_VERSION = 2
/** 仍然能读的旧版本号（读进来后会升级成本版） */
const LEGACY_PROJECT_VERSIONS = [1]

export interface ProjectFile {
  format: string
  version: number
  name: string
  updatedAt?: string
  /** 画布上的素材；文件就是真源，Agent 直接改这里 */
  assets: Asset[]
}

export interface OpResult {
  index: number
  op: string
  ok: boolean
  detail: string
}

export type ProjectOp =
  | { op: 'asset.add'; name: string; svg?: string; format?: 'lottie' | 'gsap'; payload?: string; width?: number; height?: number; x?: number; y?: number; id?: string }
  | { op: 'asset.remove'; asset: string }
  | { op: 'asset.update'; asset: string; patch: Partial<Pick<Asset, 'name' | 'x' | 'y' | 'width' | 'height' | 'svg'>> }
  | { op: 'board.move'; asset: string; x: number; y: number }
  | { op: 'anim.set'; asset: string; group: AnimGroup }
  | { op: 'anim.update'; asset: string; group: string; patch: Partial<AnimGroup> }
  | { op: 'anim.remove'; asset: string; group: string }
  | { op: 'anim.layer'; asset: string; group: string; targets: string[]; stagger?: number }
  | { op: 'anim.keyframes'; asset: string; group: string; property: string; keyframes: { offset: number; value: string }[] }
  | { op: 'style.set'; asset: string; element: string; patch: StylePatch }
  | { op: 'style.clear'; asset: string; element: string }
  | { op: 'layout.set'; asset: string; container: string; spec: Partial<LayoutSpec> }
  | { op: 'layout.clear'; asset: string; container: string }

let seed = 0
function genId(prefix: string) {
  seed++
  return `${prefix}_${Date.now().toString(36)}${seed.toString(36)}`
}

/** 历史版本：按 index 升序、同一个 index 只留一份，坏数据直接丢掉而不是整份文件失败 */
export function normalizeVersions(raw: unknown): AssetVersion[] {
  if (!Array.isArray(raw)) return []
  const byIndex = new Map<number, AssetVersion>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const entry = item as any
    const index = Math.round(Number(entry.index))
    if (!Number.isFinite(index) || index < 1 || byIndex.has(index)) continue
    if (typeof entry.svg !== 'string' || !entry.svg.trim()) continue
    byIndex.set(index, {
      index,
      createdAt: Number(entry.createdAt) || Date.now(),
      label: typeof entry.label === 'string' && entry.label ? entry.label : undefined,
      svg: entry.svg,
      width: Number(entry.width) || 1920,
      height: Number(entry.height) || 1080,
    })
  }
  return Array.from(byIndex.values()).sort((a, b) => a.index - b.index)
}

export function elementIndexOf(doc: ReturnType<typeof parseSvgDocument>): ProjectElement[] {
  return doc.elements.map((el) => ({
    id: el.id,
    tag: el.tag,
    label: el.label,
    depth: el.depth,
    kind: el.kind,
    parentId: el.parentId,
  }))
}

export function buildAssetFromSvg(svg: string, name: string, opts: { id?: string; x?: number; y?: number } = {}): Asset {
  const doc = parseSvgDocument(svg)
  const id = opts.id || genId('a')
  const groups = doc.groups.map((g, i) => ({ ...g, id: `${id}_g${i}` })) as AnimGroup[]
  return {
    id,
    name,
    svg,
    format: 'svg',
    payload: undefined,
    duration: undefined,
    width: doc.width || 1920,
    height: doc.height || 1080,
    kind: groups.length ? 'animated' : 'static',
    groups,
    elements: elementIndexOf(doc),
    overrides: {},
    layouts: {},
    warnings: doc.warnings,
    source: 'import',
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    createdAt: Date.now(),
    version: 1,
  }
}

/** 原生素材：原文照着存，交给浏览器里的运行时去画，不做任何转换 */
export function buildNativeAsset(
  format: 'lottie' | 'gsap',
  payload: string,
  name: string,
  opts: { id?: string; x?: number; y?: number } = {}
): Asset {
  let width = 1920
  let height = 1080
  let duration = 0

  if (format === 'lottie') {
    const data = JSON.parse(payload) as Record<string, number>
    width = Math.max(1, Math.round(Number(data.w) || 512))
    height = Math.max(1, Math.round(Number(data.h) || 512))
    const fr = Number(data.fr) || 30
    const ip = Number(data.ip) || 0
    const op = Number(data.op) || ip + 1
    duration = Math.max(0.001, (op - ip) / fr)
  } else {
    // 自带 GSAP 的 SVG：尺寸从 viewBox 拿，时长要等运行时建出时间轴才知道
    const doc = parseSvgDocument(payload)
    width = doc.width || 1920
    height = doc.height || 1080
  }

  return {
    id: opts.id || genId('a'),
    name: name || (format === 'lottie' ? 'Lottie 素材' : 'GSAP 素材'),
    svg: '',
    format,
    payload,
    duration,
    width,
    height,
    kind: 'animated',
    groups: [],
    elements: [],
    overrides: {},
    layouts: {},
    warnings: [],
    source: 'import',
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    createdAt: Date.now(),
    version: 1,
  }
}

/**
 * 素材能不能播。
 * 原生素材没有轨道（动画在运行时里），所以不能按 groups 判空。
 */
export function isPlayable(asset: Asset): boolean {
  if (asset.format === 'lottie' || asset.format === 'gsap') return true
  return asset.groups.some((group) => group.enabled !== false)
}

export function createProject(assets: Asset[], name = '未命名素材库'): ProjectFile {
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name,
    updatedAt: new Date().toISOString(),
    assets: assets.map(stripRuntime),
  }
}

/** 只保留可序列化的字段，避免把浏览器里的运行时对象写进文件 */
export function stripRuntime(asset: Asset): Asset {
  const { ...rest } = asset as any
  delete rest.player
  delete rest.doc
  const versions = normalizeVersions(rest.versions)
  return {
    id: rest.id,
    name: rest.name,
    svg: rest.svg ?? '',
    format: rest.format || 'svg',
    payload: rest.payload,
    duration: rest.duration,
    width: rest.width,
    height: rest.height,
    kind: rest.kind,
    groups: rest.groups || [],
    elements: rest.elements || [],
    videoCopy: rest.videoCopy ?? '',
    voiceoverAudio: rest.voiceoverAudio,
    overrides: rest.overrides || {},
    layouts: rest.layouts || {},
    warnings: rest.warnings || [],
    source: rest.source || 'import',
    x: rest.x ?? 0,
    y: rest.y ?? 0,
    createdAt: rest.createdAt || Date.now(),
    review: rest.review,
    agentReview: rest.agentReview,
    revision: rest.revision,
    // 没有历史版本就不写这个字段，文件保持干净
    ...(versions.length ? { versions } : {}),
    version: 1,
  }
}

export function normalizeProject(raw: any): ProjectFile {
  if (!raw || typeof raw !== 'object') throw new Error('项目文件不是 JSON 对象')
  if (raw.format !== PROJECT_FORMAT) {
    throw new Error(`不是 MG SVG Studio 项目文件（format=${String(raw.format)}）`)
  }
  if (raw.version !== undefined && raw.version !== PROJECT_VERSION && !LEGACY_PROJECT_VERSIONS.includes(raw.version)) {
    throw new Error(`不支持的项目版本：${raw.version}`)
  }
  if (!Array.isArray(raw.assets)) throw new Error('项目缺少 assets 数组')
  return {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: raw.name || '未命名素材库',
    updatedAt: raw.updatedAt,
    assets: raw.assets.map((a: any) => normalizeAsset(a)),
  }
}

export function normalizeAsset(a: any): Asset {
  if (!a || typeof a !== 'object') throw new Error('assets 里存在非对象项')
  if (typeof a.id !== 'string') throw new Error('素材缺少 id')
  const format = a.format === 'lottie' || a.format === 'gsap' ? a.format : 'svg'
  if (format === 'svg' && typeof a.svg !== 'string') throw new Error(`素材 ${a.id} 缺少 svg`)
  if (format !== 'svg' && typeof a.payload !== 'string') throw new Error(`原生素材 ${a.id} 缺少 payload`)
  const groups = Array.isArray(a.groups) ? a.groups : []
  return {
    id: a.id,
    name: a.name || a.id,
    svg: typeof a.svg === 'string' ? a.svg : '',
    format,
    payload: typeof a.payload === 'string' ? a.payload : undefined,
    duration: Number(a.duration) || undefined,
    width: Number(a.width) || 1920,
    height: Number(a.height) || 1080,
    kind: format !== 'svg' || groups.length ? 'animated' : 'static',
    groups,
    elements: Array.isArray(a.elements) ? a.elements : [],
    videoCopy: typeof a.videoCopy === 'string' ? a.videoCopy : '',
    voiceoverAudio: typeof a.voiceoverAudio === 'string' ? a.voiceoverAudio : undefined,
    overrides: a.overrides && typeof a.overrides === 'object' ? a.overrides : {},
    layouts: a.layouts && typeof a.layouts === 'object' ? a.layouts : {},
    warnings: Array.isArray(a.warnings) ? a.warnings : [],
    source: a.source || 'import',
    x: Number(a.x) || 0,
    y: Number(a.y) || 0,
    createdAt: Number(a.createdAt) || Date.now(),
    review: a.review && typeof a.review === 'object' ? a.review : undefined,
    agentReview: a.agentReview && typeof a.agentReview === 'object' ? a.agentReview : undefined,
    revision: a.revision && typeof a.revision === 'object'
      ? {
        index: Number(a.revision.index) || 0,
        createdAt: Number(a.revision.createdAt) || 0,
        label: typeof a.revision.label === 'string' ? a.revision.label : undefined,
      }
      : undefined,
    versions: normalizeVersions(a.versions),
    version: 1,
  }
}

export function findAsset(project: Pick<ProjectFile, 'assets'>, ref: string): Asset {
  const asset = project.assets.find((a) => a.id === ref)
  if (asset) return asset
  const byName = project.assets.filter((a) => a.name === ref)
  if (byName.length === 1) return byName[0]
  throw new Error(`找不到素材 "${ref}"（现有：${project.assets.map((a) => a.id).join(', ')}）`)
}

export function findElement(asset: Asset, ref: string): ProjectElement {
  const list = asset.elements || []
  const byId = list.find((e) => e.id === ref)
  if (byId) return byId
  const byLabel = list.filter((e) => e.label === ref)
  if (byLabel.length === 1) return byLabel[0]
  if (byLabel.length > 1) throw new Error(`元素 "${ref}" 匹配到 ${byLabel.length} 个，请用 id：${byLabel.map((e) => e.id).join(', ')}`)
  throw new Error(`素材 ${asset.id} 里找不到元素 "${ref}"`)
}

export function findGroup(asset: Asset, ref: string): AnimGroup {
  const byId = asset.groups.find((g) => g.id === ref)
  if (byId) return byId
  const byName = asset.groups.filter((g) => g.name === ref)
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) throw new Error(`动画 "${ref}" 有 ${byName.length} 条同名轨道，请用 id：${byName.map((g) => g.id).join(', ')}`)
  throw new Error(`素材 ${asset.id} 里找不到动画 "${ref}"`)
}

/** 应用一批操作；任何一步出错都不修改原对象（返回新项目） */
export function applyOps(project: ProjectFile, ops: ProjectOp[]): { project: ProjectFile; log: OpResult[] } {
  const next: ProjectFile = JSON.parse(JSON.stringify(project))
  const log: OpResult[] = []

  ops.forEach((op, index) => {
    const result = applyOne(next, op)
    log.push({ index, op: op.op, ok: true, detail: result })
  })

  next.assets = next.assets.map((a) => ({ ...a, kind: (a.format && a.format !== 'svg') || a.groups.length ? 'animated' : 'static' }))
  next.updatedAt = new Date().toISOString()
  return { project: next, log }
}

function applyOne(project: ProjectFile, op: ProjectOp): string {
  switch (op.op) {
    case 'asset.add': {
      // 原生格式：原文照存，不做转换
      if (op.format === 'lottie' || op.format === 'gsap') {
        if (typeof op.payload !== 'string' || !op.payload.trim()) throw new Error('asset.add 的原生素材需要 payload')
        const asset = buildNativeAsset(op.format, op.payload, op.name || '原生素材', { id: op.id, x: op.x, y: op.y })
        project.assets.push(asset)
        return `添加${op.format === 'lottie' ? ' Lottie' : ' GSAP'} 素材 ${asset.id}（原生运行时，${asset.width}×${asset.height}）`
      }
      if (!op.svg || typeof op.svg !== 'string') throw new Error('asset.add 需要 svg，或 format + payload')
      const asset = buildAssetFromSvg(op.svg, op.name || '新素材', { id: op.id, x: op.x, y: op.y })
      if (op.width) asset.width = op.width
      if (op.height) asset.height = op.height
      project.assets.push(asset)
      return `添加素材 ${asset.id}（${asset.groups.length} 条动画，${asset.elements?.length || 0} 个元素）`
    }
    case 'asset.remove': {
      const asset = findAsset(project, op.asset)
      project.assets = project.assets.filter((a) => a.id !== asset.id)
      return `删除素材 ${asset.id}`
    }
    case 'asset.update': {
      const asset = findAsset(project, op.asset)
      const { svg, ...fields } = op.patch
      if (svg !== undefined) {
        if (typeof svg !== 'string' || !svg.trim()) throw new Error('asset.update 的 svg 必须是非空字符串')

        // 原生素材的内容在 payload 里，直接写 svg 会留下两份互相矛盾的正文，
        // 而且运行时读 payload，替换等于没生效。这里按新正文的格式重建。
        if (asset.format === 'lottie' || asset.format === 'gsap') {
          const keep = {
            id: asset.id, name: asset.name, x: asset.x, y: asset.y,
            overrides: asset.overrides, layouts: asset.layouts,
            videoCopy: asset.videoCopy, voiceoverAudio: asset.voiceoverAudio,
            createdAt: asset.createdAt, source: asset.source,
          }
          const rebuilt = looksLikeLottie(svg)
            ? buildNativeAsset('lottie', svg, keep.name, keep)
            : looksLikeGsapSvg(svg)
              ? buildNativeAsset('gsap', svg, keep.name, keep)
              : buildAssetFromSvg(svg, keep.name, keep)
          Object.assign(asset, rebuilt, keep)
          asset.format = rebuilt.format ?? 'svg'
          asset.payload = rebuilt.payload
          asset.duration = rebuilt.duration
          Object.assign(asset, fields)
          return `更新素材 ${asset.id}：内容与格式（→ ${asset.format}）`
        }

        const doc = parseSvgDocument(svg)
        asset.svg = svg
        asset.width = doc.width || asset.width
        asset.height = doc.height || asset.height
        asset.elements = elementIndexOf(doc)
        asset.warnings = doc.warnings
      }
      Object.assign(asset, fields)
      return `更新素材 ${asset.id}：${Object.keys(op.patch).join(', ')}`
    }
    case 'board.move': {
      const asset = findAsset(project, op.asset)
      asset.x = op.x
      asset.y = op.y
      return `画板 ${asset.id} → (${op.x}, ${op.y})`
    }
    case 'anim.set': {
      const asset = findAsset(project, op.asset)
      if (!op.group || !op.group.id) throw new Error('anim.set 需要完整的 group 对象（含 id）')
      const idx = asset.groups.findIndex((g) => g.id === op.group.id)
      if (idx >= 0) asset.groups[idx] = op.group
      else asset.groups.push(op.group)
      return `${idx >= 0 ? '替换' : '添加'}动画 ${op.group.id}（${op.group.name}）`
    }
    case 'anim.update': {
      const asset = findAsset(project, op.asset)
      const group = findGroup(asset, op.group)
      Object.assign(group, parseAnimationPatch(op.patch))
      return `更新动画 ${group.id}：${Object.keys(op.patch).join(', ')}`
    }
    case 'anim.remove': {
      const asset = findAsset(project, op.asset)
      const group = findGroup(asset, op.group)
      asset.groups = asset.groups.filter((g) => g.id !== group.id)
      return `删除动画 ${group.id}`
    }
    case 'anim.layer': {
      const asset = findAsset(project, op.asset)
      const group = findGroup(asset, op.group)
      if (!Array.isArray(op.targets) || !op.targets.length) throw new Error('anim.layer 需要 targets 数组')
      const ids = op.targets.map((t) => findElement(asset, t).id)
      group.targetIds = ids
      group.targetId = ids[0]
      if (op.stagger !== undefined) Object.assign(group, parseAnimationPatch({ stagger: op.stagger }))
      return `${group.name} 设为 ${ids.length} 个目标的分层${op.stagger !== undefined ? `，交错 ${op.stagger}s` : ''}`
    }
    case 'anim.keyframes': {
      const asset = findAsset(project, op.asset)
      const group = findGroup(asset, op.group)
      const track = group.tracks.find((t) => t.property === op.property)
      if (!track) throw new Error(`动画 ${group.id} 没有属性 ${op.property}，现有：${group.tracks.map((t) => t.property).join(', ')}`)
      track.keyframes = parseKeyframes(op.keyframes).sort((a, b) => a.offset - b.offset)
      return `${group.name} · ${op.property} 关键帧 → ${op.keyframes.length} 个`
    }
    case 'style.set': {
      const asset = findAsset(project, op.asset)
      if (asset.format === 'lottie' || asset.format === 'gsap') {
        throw new Error(`${asset.format} 是原生素材，动画在运行时里，不支持逐元素编辑；改源文件后重新导入`)
      }
      const el = findElement(asset, op.element)
      asset.overrides[el.id] = { ...(asset.overrides[el.id] || {}), ...parseStylePatch(op.patch) }
      return `元素 ${el.id}（${el.label}）样式：${Object.entries(op.patch).map(([k, v]) => `${k}=${v}`).join(', ')}`
    }
    case 'style.clear': {
      const asset = findAsset(project, op.asset)
      if (asset.format === 'lottie' || asset.format === 'gsap') {
        throw new Error(`${asset.format} 是原生素材，动画在运行时里，不支持逐元素编辑；改源文件后重新导入`)
      }
      const el = findElement(asset, op.element)
      delete asset.overrides[el.id]
      return `清空元素 ${el.id}（${el.label}）的样式覆盖`
    }
    case 'layout.set': {
      const asset = findAsset(project, op.asset)
      const el = findElement(asset, op.container)
      const spec: LayoutSpec = { ...DEFAULT_LAYOUT, ...parseLayoutPatch(op.spec) }
      asset.layouts = { ...(asset.layouts || {}), [el.id]: spec }
      return `容器 ${el.id}（${el.label}）布局：${spec.mode} gap=${spec.gap}${spec.mode === 'grid' ? ` cols=${spec.cols}` : ''}`
    }
    case 'layout.clear': {
      const asset = findAsset(project, op.asset)
      const el = findElement(asset, op.container)
      if (asset.layouts) delete asset.layouts[el.id]
      return `清除容器 ${el.id}（${el.label}）布局`
    }
    default:
      throw new Error(`未知操作：${(op as any).op}`)
  }
}

/* --------------------------------- 概要 --------------------------------- */

export function outline(project: ProjectFile, opts: { assetId?: string; elements?: boolean } = {}): string {
  const lines: string[] = []
  lines.push(`项目：${project.name} · ${project.assets.length} 个素材${project.updatedAt ? ` · 更新于 ${project.updatedAt}` : ''}`)
  const assets = opts.assetId ? [findAsset(project, opts.assetId)] : project.assets
  for (const a of assets) {
    const native = a.format === 'lottie' || a.format === 'gsap'
    const animated = native || a.groups.length > 0
    const kindLabel = native ? `原生 ${a.format}${a.duration ? ` · ${a.duration.toFixed(2)}s` : ''}` : animated ? `${a.groups.length} 条动画` : '静态'
    lines.push('')
    lines.push(`[${a.id}] ${a.name}  ${a.width}×${a.height}  ${kindLabel}  位置 (${Math.round(a.x)}, ${Math.round(a.y)})`)
    if (a.layouts && Object.keys(a.layouts).length) {
      lines.push(`  布局：${Object.entries(a.layouts).map(([id, s]) => `${id}=${s.mode}${s.mode === 'grid' ? `/${s.cols}列` : ''}`).join('  ')}`)
    }
    if (a.overrides && Object.keys(a.overrides).length) {
      lines.push(`  样式覆盖：${Object.keys(a.overrides).length} 个元素`)
    }
    a.groups.forEach((g) => {
      const targets = g.targetIds?.length || 1
      const label = targets > 1 ? `层 ×${targets}` : `${findLabel(a, g.targetId)}`
      lines.push(
        `  · ${g.name}  ${label}  ${g.duration.toFixed(2)}s +${g.delay.toFixed(2)}s${g.stagger ? ` 交错 ${g.stagger}s` : ''}  [${g.origin}]${g.enabled === false ? ' (停用)' : ''}  id=${g.id}`
      )
    })
    if (opts.elements) {
      lines.push('  元素：')
      ;(a.elements || []).forEach((el) => {
        lines.push(`    ${el.id}  ${el.tag}  ${el.label}${el.kind === 'group' ? '  (组)' : ''}`)
      })
    }
  }
  if (project.assets.some((a) => (a.elements?.length || 0) === 0)) {
    lines.push('')
    lines.push('提示：部分素材没有元素索引，用 `mgsvg repair <file>` 可以从 SVG 重新生成。')
  }
  return lines.join('\n')
}

function findLabel(asset: Asset, id: string) {
  return asset.elements?.find((e) => e.id === id)?.label || id
}

export function validateProject(project: ProjectFile): { ok: boolean; problems: string[] } {
  const problems: string[] = []
  const ids = new Set<string>()
  project.assets.forEach((a) => {
    if (ids.has(a.id)) problems.push(`素材 id 重复：${a.id}`)
    ids.add(a.id)
    const native = a.format === 'lottie' || a.format === 'gsap'
    if (native) {
      if (!a.payload) problems.push(`原生素材 ${a.id} 没有 payload`)
    } else if (!a.svg) {
      problems.push(`素材 ${a.id} 没有 svg`)
    }
    const elementIds = new Set((a.elements || []).map((e) => e.id))
    a.groups.forEach((g, index) => {
      const checked = animationSchema.safeParse(g)
      if (!checked.success) {
        problems.push(...schemaProblems(checked.error).map((problem) => `素材 ${a.id} 动画 ${g?.id || index}：${problem}`))
        return
      }
      const targets = g.targetIds?.length ? g.targetIds : [g.targetId]
      targets.forEach((t) => {
        if (elementIds.size && !elementIds.has(t)) problems.push(`动画 ${g.id} 指向不存在的元素 ${t}`)
      })
    })
    Object.entries(a.overrides || {}).forEach(([el]) => {
      if (elementIds.size && !elementIds.has(el)) problems.push(`素材 ${a.id} 的样式覆盖指向不存在的元素 ${el}`)
    })
    Object.entries(a.layouts || {}).forEach(([el, spec]) => {
      if (elementIds.size && !elementIds.has(el)) problems.push(`素材 ${a.id} 的布局指向不存在的容器 ${el}`)
      try { parseLayoutPatch(spec) } catch (error) { problems.push(`素材 ${a.id} 容器 ${el}：${(error as Error).message}`) }
    })
  })
  return { ok: problems.length === 0, problems }
}
