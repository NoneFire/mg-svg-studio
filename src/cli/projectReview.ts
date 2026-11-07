import path from 'node:path'
import { findAsset, validateProject } from '../lib/project'
import { reviewInputHash } from '../lib/review/review'
import { CliError } from './args'
import { readProjectFile, writeProject } from './io'
import { reviewInBrowser } from './reviewRunner'

export async function reviewProjectFile({
  file, appUrl = 'http://localhost:5188', projectUrl, target, write = false, dryRun = false,
}: { file: string; appUrl?: string; projectUrl?: string; target?: string; write?: boolean; dryRun?: boolean }) {
  const { project, snapshot } = readProjectFile(file)
  const absolute = path.resolve(file)
  if (!projectUrl) {
    const relative = path.relative(process.cwd(), absolute)
    if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
      throw new CliError('INVALID_ARGUMENT', '请从 Studio 项目目录运行，或提供 --project-url')
    }
    projectUrl = '/' + relative.split(path.sep).map(encodeURIComponent).join('/')
  }
  const assets = target ? [findAsset(project, target)] : project.assets
  const targetId = target ? assets[0].id : 'all'
  const result = await reviewInBrowser({ appUrl, projectUrl, target: targetId })

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
