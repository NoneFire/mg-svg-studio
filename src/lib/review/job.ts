import type { Asset } from '../../types'
import { reviewSnapshotOf, runReviewAll, type BatchResult, type BatchRow } from './batch'
import { runReview } from './review'
import type { ReviewOptions, ReviewReport, ReviewSnapshot } from './types'

export type ReviewJobResult = {
  rows: BatchRow[]
  snapshots: Record<string, ReviewSnapshot>
} & ({ kind: 'single'; report: ReviewReport } | { kind: 'all'; batch: BatchResult })

export type ReviewJob = { ok: true; result: ReviewJobResult } | { ok: false; error: string }

export function defaultReviewOptions(asset: Asset, frame = 1): ReviewOptions {
  return { medium: 'ui', displayWidth: Math.round(asset.width), frame }
}

export async function runReviewJob(assets: Asset[], target: string): Promise<ReviewJobResult> {
  if (target === 'all') {
    const batch = await runReviewAll(assets)
    return { kind: 'all', batch, rows: batch.rows, snapshots: batch.snapshots }
  }
  const asset = assets.find((entry) => entry.id === target)
  if (!asset) throw new Error(`浏览器中的项目没有素材 ${target}`)
  const options = defaultReviewOptions(asset)
  const report = await runReview(asset, options)
  return {
    kind: 'single', report, snapshots: { [asset.id]: reviewSnapshotOf(report, options) },
    rows: [{
      assetId: asset.id, assetName: asset.name, gate: report.gate, counts: report.counts,
      measured: report.coverage.measured, total: report.coverage.total, inputHash: report.inputHash,
      findings: report.findings.filter((finding) => finding.level !== 'PASS').length,
    }],
  }
}
