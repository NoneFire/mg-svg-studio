import type { ReviewOptions, ReviewReport, ReviewSnapshot } from './types'

/** Reduce a review report to the persistent snapshot, retaining passing and triggering findings. */
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
    findings: report.findings,
  }
}
