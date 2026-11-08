import type { ReviewReport } from './types'

/** Shared cache for interactive, batch, CLI, and bridge review results. */
export const reviewCache = new Map<string, ReviewReport>()
