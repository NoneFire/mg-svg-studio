import type { Asset } from '../../types'
import { reviewInputHash, runReview, type ReviewInput } from './review'
import { LIBRARY_VERSION } from './rules'
import type { GateVerdict, ReviewOptions, ReviewReport, ReviewSnapshot } from './types'

/**
 * 评审缓存：同一素材、同一输入指纹只算一次。
 * 面板、批量评审、CLI 的 `--run` 都读这一份，避免同一次会话里测三遍。
 */
export const reviewCache = new Map<string, ReviewReport>()

export interface BatchRow {
  assetId: string
  assetName: string
  gate: GateVerdict
  counts: ReviewReport['counts']
  measured: number
  total: number
  inputHash: string
  /** 非 PASS 的条数：这张素材这一版真有问题的地方 */
  findings: number
  error?: string
}

export interface BatchResult {
  generatedAt: string
  libraryVersion: number
  rows: BatchRow[]
  /** 每张素材的快照：CLI --write 用它们写回项目文件 */
  snapshots: Record<string, ReviewSnapshot>
  summary: {
    assets: number
    blocked: number
    review: number
    deliverable: number
    fail: number
    warn: number
    notMeasured: number
  }
}

/** 把一份报告压成可存进项目文件的快照：只留非 PASS 明细 */
export function reviewSnapshotOf(report: ReviewReport, options: ReviewOptions = {}): ReviewSnapshot {
  return {
    inputHash: report.inputHash,
    options,
    generatedAt: report.generatedAt,
    libraryVersion: report.libraryVersion,
    gate: report.gate,
    counts: report.counts,
    coverage: {
      measured: report.coverage.measured,
      total: report.coverage.total,
      counts: report.coverage.counts,
    },
    findings: report.findings.filter((f) => f.level !== 'PASS'),
  }
}

/** 画面或口径改过，上一次的结论就不能当数 */
export function isReviewStale(asset: ReviewInput, report: ReviewReport, options: ReviewOptions = {}): boolean {
  return report.inputHash !== reviewInputHash(asset, options)
}

/** 依次评审所有素材。串行跑：每次都要挂一张 1920×1080 的临时画布，并发会顶到内存 */
export async function runReviewAll(
  assets: Asset[],
  options: ReviewOptions = {},
  onProgress?: (done: number, total: number, row: BatchRow) => void
): Promise<BatchResult> {
  const rows: BatchRow[] = []
  const snapshots: Record<string, ReviewSnapshot> = {}
  for (const asset of assets) {
    const opts: ReviewOptions = { medium: 'ui', displayWidth: Math.round(asset.width), frame: 1, ...options }
    try {
      const report = await runReview(asset, opts)
      reviewCache.set(asset.id, report)
      snapshots[asset.id] = reviewSnapshotOf(report, opts)
      rows.push({
        assetId: asset.id,
        assetName: asset.name,
        gate: report.gate,
        counts: report.counts,
        measured: report.coverage.measured,
        total: report.coverage.total,
        inputHash: report.inputHash,
        findings: report.findings.filter((f) => f.level !== 'PASS').length,
      })
    } catch (err) {
      rows.push({
        assetId: asset.id,
        assetName: asset.name,
        gate: 'REVIEW_NEEDED',
        counts: { FAIL: 0, WARN: 0, PASS: 0, UNMEASURED: 0 },
        measured: 0,
        total: 0,
        inputHash: '',
        findings: 0,
        error: (err as Error)?.message || String(err),
      })
    }
    onProgress?.(rows.length, assets.length, rows[rows.length - 1])
  }

  return {
    generatedAt: new Date().toISOString(),
    libraryVersion: LIBRARY_VERSION,
    rows,
    snapshots,
    summary: {
      assets: rows.length,
      blocked: rows.filter((r) => r.gate === 'BLOCKED').length,
      review: rows.filter((r) => r.gate === 'REVIEW_NEEDED').length,
      deliverable: rows.filter((r) => r.gate === 'DELIVERABLE').length,
      fail: rows.reduce((s, r) => s + r.counts.FAIL, 0),
      warn: rows.reduce((s, r) => s + r.counts.WARN, 0),
      notMeasured: rows.reduce((s, r) => s + (r.total - r.measured), 0),
    },
  }
}
