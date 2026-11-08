import type { AgentReviewResult, Finding } from './review/types'
import type { StylePatch } from '../types'

export interface StudioContext {
  ts: string
  sessionId: string
  selectionId: string
  project: { name: string; file: string | null; dirty: boolean; linked: boolean }
  selection: { assetId?: string; elementId?: string; groupId?: string }
  asset?: { id: string; name: string; width: number; height: number; kind: string }
  element?: {
    id: string
    tag?: string
    kind?: string
    label?: string
    depth?: number
    parentId?: string
    rect?: { x: number; y: number; width: number; height: number }
    style?: StylePatch
    overrides?: StylePatch
    text?: string
  }
  review?: {
    assetId: string
    gate: string
    counts: Record<string, number>
    findingsForElement: Finding[]
    raster?: unknown
  }
  agentReview?: {
    status: 'ok' | 'stale' | 'none'
    generatedAt?: string
    resultsForElement: AgentReviewResult[]
  }
  assets: { id: string; name: string }[]
}

export interface BridgeCommand {
  id: string
  sessionId: string
  type: 'style.set' | 'style.clear' | 'select' | 'save' | 'review' | 'asset.add' | 'asset.mergeVersions' | 'asset.versions' | 'project.reload'
  payload: { asset?: string; element?: string; patch?: unknown; frame?: number; svg?: string; name?: string; sources?: string[]; force?: boolean }
}

export type BridgeResult = { ok: true; result: unknown } | { ok: false; error: string; code?: string }

export function bridgeCommandTimeout(type: BridgeCommand['type']) {
  return type === 'review' ? 45_000 : type === 'asset.add' || type === 'project.reload' ? 20_000 : 8_000
}

