import path from 'node:path'
import { findAsset, validateProject } from '../lib/project'
import { reviewInputHash } from '../lib/review/review'
import { agentReviewRules, parseAgentReviewDocument } from '../lib/review/agent'
import type { AgentReviewSnapshot, ReviewOptions } from '../lib/review/types'
import { ruleset } from '../lib/review/rules'
import { defaultReviewOptions } from '../lib/review/job'
import { CliError } from './args'
import { readProjectFile, writeProject } from './io'
import { reviewInBrowser } from './reviewRunner'

function projectUrlForFile(file: string, supplied?: string) {
  if (supplied) return supplied
  const absolute = path.resolve(file)
  const relative = path.relative(process.cwd(), absolute)
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
    throw new CliError('INVALID_ARGUMENT', '请从 Studio 项目目录运行，或提供 --project-url')
  }
  return '/' + relative.split(path.sep).map(encodeURIComponent).join('/')
}

export async function reviewProjectFile({
  file, appUrl = 'http://localhost:5188', projectUrl, target, write = false, dryRun = false,
}: { file: string; appUrl?: string; projectUrl?: string; target?: string; write?: boolean; dryRun?: boolean }) {
  const { project, snapshot } = readProjectFile(file)
  const absolute = path.resolve(file)
  projectUrl = projectUrlForFile(absolute, projectUrl)
  const assets = target ? [findAsset(project, target)] : project.assets
  const targetId = target ? assets[0].id : 'all'
  const result = await reviewInBrowser({ appUrl, projectUrl, target: targetId })
  if (result.kind === 'agent-prompt') throw new CliError('REVIEW_FAILED', '评审浏览器返回了 Agent 提示词，而不是规则结果')

  const failed = result.rows.filter((row) => row.error)
  if (failed.length) {
    throw new CliError('REVIEW_FAILED', '部分素材评审失败', failed.map((row) => `${row.assetName}：${row.error}`))
  }
  const rows = new Map(result.rows.map((row) => [row.assetId, row]))
  if (result.rows.length !== assets.length || Object.keys(result.snapshots).length !== assets.length) {
    throw new CliError('REVIEW_SOURCE_MISMATCH', '浏览器与本地项目的评审素材不一致')
  }
  for (const asset of assets) {
    const saved = result.snapshots[asset.id]
    const row = rows.get(asset.id)
    if (!saved || !row || saved.inputHash !== row.inputHash || saved.inputHash !== reviewInputHash(asset, saved.options)) {
      throw new CliError('REVIEW_SOURCE_MISMATCH', `浏览器与本地项目的素材版本不一致：${asset.name}（${asset.id}）`)
    }
  }

  if (write) {
    for (const asset of assets) asset.review = result.snapshots[asset.id]
    const check = validateProject(project)
    if (!check.ok) throw new CliError('VALIDATION_FAILED', '项目校验未通过', check.problems)
    if (!dryRun) writeProject(file, project, snapshot)
  }
  return { ...result, file: absolute, written: write && !dryRun }
}

export async function agentPromptForProject({
  file, appUrl = 'http://localhost:5188', projectUrl, target,
}: { file: string; appUrl?: string; projectUrl?: string; target: string }) {
  const { project } = readProjectFile(file)
  const asset = findAsset(project, target)
  const result = await reviewInBrowser({
    appUrl,
    projectUrl: projectUrlForFile(path.resolve(file), projectUrl),
    target: asset.id,
    mode: 'agent-prompt',
  })
  if (result.kind !== 'agent-prompt') throw new CliError('REVIEW_FAILED', '浏览器没有返回 Agent 评审提示词')
  if (result.assetId !== asset.id || result.inputHash !== reviewInputHash(asset, result.options)) {
    throw new CliError('REVIEW_SOURCE_MISMATCH', `浏览器与本地项目的素材版本不一致：${asset.name}（${asset.id}）`)
  }
  return { ...result, file: path.resolve(file) }
}

export function saveAgentReviewResult({
  file, target, document, write = false, dryRun = false,
}: {
  file: string
  target: string
  document: string | unknown
  write?: boolean
  dryRun?: boolean
}) {
  const { project, snapshot } = readProjectFile(file)
  const asset = findAsset(project, target)
  const raw = typeof document === 'string' ? document : JSON.stringify(document)
  const validRuleIds = new Set(agentReviewRules(ruleset.rules).map((rule) => rule.id))
  const parsed = parseAgentReviewDocument(raw, validRuleIds, {})
  if (parsed.assetId !== asset.id) throw new CliError('AGENT_ASSET_MISMATCH', `结果 assetId 不匹配：预期 ${asset.id}，收到 ${parsed.assetId || '缺失'}`)
  if (!parsed.inputHash || !parsed.options) throw new CliError('AGENT_RESULT_METADATA_MISSING', 'Agent JSON 必须带回 assetId、inputHash 和 options')
  const options = parsed.options as ReviewOptions
  if (options.medium !== 'ui' && options.medium !== 'print') throw new CliError('AGENT_RESULT_INVALID', 'Agent JSON 的 options.medium 无效')
  if (!Number.isFinite(options.frame) || options.frame! < 0 || options.frame! > 1) {
    throw new CliError('AGENT_RESULT_INVALID', 'Agent JSON 的 options.frame 必须在 0–1')
  }
  if (!Number.isFinite(options.displayWidth) || options.displayWidth! <= 0) {
    throw new CliError('AGENT_RESULT_INVALID', 'Agent JSON 的 options.displayWidth 必须为正数')
  }
  if (options.scaleLadder !== undefined && (!Array.isArray(options.scaleLadder) || options.scaleLadder.some((value) => !Number.isFinite(value) || value <= 0))) {
    throw new CliError('AGENT_RESULT_INVALID', 'Agent JSON 的 options.scaleLadder 必须是正数数组')
  }
  const currentHash = reviewInputHash(asset, options)
  if (parsed.inputHash !== currentHash) throw new CliError('AGENT_RESULT_STALE', 'Agent 结果对应的素材或评审口径已变化；请重新生成提示词并评审')
  const agentReview: AgentReviewSnapshot = {
    inputHash: currentHash,
    options,
    generatedAt: new Date().toISOString(),
    results: parsed.reviews,
  }
  asset.agentReview = agentReview
  const check = validateProject(project)
  if (!check.ok) throw new CliError('VALIDATION_FAILED', '项目校验未通过', check.problems)
  if (write && !dryRun) writeProject(file, project, snapshot)
  return { assetId: asset.id, assetName: asset.name, agentReview, written: write && !dryRun, dryRun: !!dryRun }
}
