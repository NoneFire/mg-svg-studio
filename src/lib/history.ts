import type { Asset, AssetVersion as ProjectVersion } from '../types'

export const HISTORY_LIMIT = 100

/** 历史里的一帧：某个位置上素材当时的快照（和项目文件里的「历史版本」不是一回事） */
export interface HistorySnapshot {
  asset: Asset
  index: number
}

export interface AssetChange {
  id: string
  before?: HistorySnapshot
  after?: HistorySnapshot
}

export interface HistoryEntry {
  id: string
  label: string
  time: number
  changes: AssetChange[]
}

export interface ProjectHistory {
  entries: HistoryEntry[]
  undo: string[]
  redo: string[]
}

export function emptyHistory(): ProjectHistory {
  return { entries: [], undo: [], redo: [] }
}

/** 版本数组通常被整份共用，先比引用；真的换了再逐条比字段，避免每次都序列化大段 SVG */
export function sameVersions(a?: ProjectVersion[], b?: ProjectVersion[]) {
  if (a === b) return true
  const left = a ?? []
  const right = b ?? []
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) {
    const one = left[i]
    const other = right[i]
    if (one === other) continue
    if (one.index !== other.index || one.createdAt !== other.createdAt ||
      one.svg !== other.svg || one.width !== other.width || one.height !== other.height) return false
  }
  return true
}

export function sameAsset(a: Asset, b: Asset, includeReview = false) {
  return a === b || (
    a.id === b.id && a.name === b.name && a.svg === b.svg &&
    a.width === b.width && a.height === b.height && a.kind === b.kind &&
    a.x === b.x && a.y === b.y && a.source === b.source && a.createdAt === b.createdAt &&
    a.videoCopy === b.videoCopy && a.voiceoverAudio === b.voiceoverAudio &&
    sameValue(a.groups, b.groups) && sameValue(a.elements ?? [], b.elements ?? []) &&
    sameValue(a.overrides, b.overrides) && sameValue(a.layouts ?? {}, b.layouts ?? {}) &&
    sameValue(a.warnings, b.warnings) && (!includeReview || sameValue(a.review, b.review))
  )
}

export function sameValue(a: unknown, b: unknown) {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}





export function assetChanges(before: Asset[], after: Asset[]): AssetChange[] {
  const previous = new Map(before.map((asset, index) => [asset.id, { asset, index }]))
  const nextIds = new Set(after.map(({ id }) => id))
  const sharedOrder = before.filter(({ id }) => nextIds.has(id)).map(({ id }) => id)
  const reordered = after.filter(({ id }) => previous.has(id)).some(({ id }, i) => id !== sharedOrder[i])
  const changes: AssetChange[] = []
  after.forEach((asset, index) => {
    const old = previous.get(asset.id)
    previous.delete(asset.id)
    if (!old || (reordered && old.index !== index) || !sameAsset(old.asset, asset)) {
      changes.push({ id: asset.id, before: old, after: { asset, index } })
    }
  })
  for (const [id, old] of previous) changes.push({ id, before: old })
  return changes
}

export function applyAssetChanges(assets: Asset[], changes: AssetChange[], side: 'before' | 'after') {
  const changed = new Set(changes.map(({ id }) => id))
  const current = new Map(assets.map((asset) => [asset.id, asset]))
  const result = assets.filter(({ id }) => !changed.has(id))
  const versions = changes.flatMap((change) => change[side] ? [change[side]!] : [])
  versions.sort((a, b) => a.index - b.index)
  for (const { asset, index } of versions) {
    const existing = current.get(asset.id)
    result.splice(index, 0, existing ? { ...asset, review: existing.review } : asset)
  }
  return result
}

type StoredAsset = Omit<Asset, 'svg' | 'voiceoverAudio'> & { svg: number; voiceoverAudio?: number }
type StoredVersion = Omit<HistorySnapshot, 'asset'> & { asset: StoredAsset }
type StoredHistory = Omit<ProjectHistory, 'entries'> & {
  entries: (Omit<HistoryEntry, 'changes'> & {
    changes: { id: string; before?: StoredVersion; after?: StoredVersion }[]
  })[]
}

export interface StoredHistoryState {
  sources: string[]
  audioSources?: string[]
  assets: StoredAsset[]
  savedAssets: StoredAsset[] | null
  history: StoredHistory
}

/** 位图也以 SVG 存储。让当前素材与历史版本共用同一份源文件。 */
export function packHistoryState(assets: Asset[], savedAssets: Asset[] | null, history: ProjectHistory): StoredHistoryState {
  const sources: string[] = []
  const sourceIndex = new Map<string, number>()
  const audioSources: string[] = []
  const audioIndex = new Map<string, number>()
  const packed = new Map<Asset, StoredAsset>()
  const pack = (asset: Asset) => {
    const cached = packed.get(asset)
    if (cached) return cached
    let index = sourceIndex.get(asset.svg)
    if (index === undefined) {
      index = sources.length
      sources.push(asset.svg)
      sourceIndex.set(asset.svg, index)
    }
    const { voiceoverAudio, ...rest } = asset
    let audioSourceIndex: number | undefined
    if (voiceoverAudio) {
      audioSourceIndex = audioIndex.get(voiceoverAudio)
      if (audioSourceIndex === undefined) {
        audioSourceIndex = audioSources.length
        audioSources.push(voiceoverAudio)
        audioIndex.set(voiceoverAudio, audioSourceIndex)
      }
    }
    const result: StoredAsset = {
      ...rest,
      svg: index,
      ...(audioSourceIndex === undefined ? {} : { voiceoverAudio: audioSourceIndex }),
    }
    packed.set(asset, result)
    return result
  }
  return {
    sources,
    audioSources,
    assets: assets.map(pack),
    savedAssets: savedAssets?.map(pack) ?? null,
    history: {
      ...history,
      entries: history.entries.map((entry) => ({
        ...entry,
        changes: entry.changes.map(({ id, before, after }) => ({
          id,
          before: before && { ...before, asset: pack(before.asset) },
          after: after && { ...after, asset: pack(after.asset) },
        })),
      })),
    },
  }
}

export function unpackHistoryState(state: StoredHistoryState) {
  const unpacked = new Map<StoredAsset, Asset>()
  const unpack = (asset: StoredAsset) => {
    const cached = unpacked.get(asset)
    if (cached) return cached
    const { voiceoverAudio, ...rest } = asset
    const result: Asset = {
      ...rest,
      svg: state.sources[asset.svg],
      ...(voiceoverAudio === undefined ? {} : { voiceoverAudio: state.audioSources?.[voiceoverAudio] }),
    }
    unpacked.set(asset, result)
    return result
  }
  return {
    assets: state.assets.map(unpack),
    savedAssets: state.savedAssets?.map(unpack) ?? null,
    history: {
      ...state.history,
      entries: state.history.entries.map((entry) => ({
        ...entry,
        changes: entry.changes.map(({ id, before, after }) => ({
          id,
          before: before && { ...before, asset: unpack(before.asset) },
          after: after && { ...after, asset: unpack(after.asset) },
        })),
      })),
    },
  }
}
