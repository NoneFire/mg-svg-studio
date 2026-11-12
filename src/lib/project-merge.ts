import type { Asset, AssetVersion } from '../types'
import { sameValue } from './history'
import { normalizeAsset } from './project'

/**
 * 项目文件的三路合并：基线（上一次同步的样子）+ 界面上的改动 + 磁盘上的改动。
 * 只改了一边的字段取那边；两边改到同一个字段时按文件版本，记一条冲突。
 */
export interface MergeOutcome {
  assets: Asset[]
  /** 两边都改到同一处的素材 id */
  conflicts: string[]
  /** 合并结果和文件不一致（需要写回文件） */
  changed: boolean
}

type Rec = Record<string, unknown>

function isRecord(value: unknown): value is Rec {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 历史版本按 index 合并：版本只追加、内容不可变，所以按条对齐，
 * 一边删掉的尊重删除，两边新加的并集保留。
 */
function mergeVersions(
  base: unknown,
  local: AssetVersion[],
  disk: AssetVersion[],
  onConflict: () => void,
): AssetVersion[] {
  const baseline = new Map(((Array.isArray(base) ? base : []) as AssetVersion[]).map((item) => [item.index, item]))
  const mine = new Map(local.map((item) => [item.index, item]))
  const theirs = new Map(disk.map((item) => [item.index, item]))
  const merged: AssetVersion[] = []
  const indexes = [...new Set([...mine.keys(), ...theirs.keys()])].sort((a, b) => a - b)
  for (const index of indexes) {
    const before = baseline.get(index)
    const one = mine.get(index)
    const other = theirs.get(index)
    if (one && other) {
      if (!sameValue(one, other)) onConflict()
      merged.push(other) // 同一个版本号内容不同：按文件版本
      continue
    }
    if (one) {
      if (!before) merged.push(one) // 界面新记的一版
      continue // 文件把它删了：跟着删
    }
    if (other && !before) merged.push(other) // 文件新记的一版
    // 否则是界面删掉的：保持删除
  }
  return merged
}

/** 叶子级三路合并；两边都动过同一个叶子时取文件版本并记冲突 */
function mergeValue(base: unknown, local: unknown, disk: unknown, onConflict: () => void, key?: string): unknown {
  if (sameValue(local, disk)) return disk
  if (sameValue(local, base)) return disk // 只有文件改了
  if (sameValue(disk, base)) return local // 只有界面改了
  if (key === 'versions' && Array.isArray(local) && Array.isArray(disk)) {
    return mergeVersions(base, local as AssetVersion[], disk as AssetVersion[], onConflict)
  }
  if (isRecord(base) && isRecord(local) && isRecord(disk)) {
    const merged: Rec = {}
    const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(disk)])
    for (const name of keys) {
      const value = mergeValue(base[name], local[name], disk[name], onConflict, name)
      if (value !== undefined) merged[name] = value
    }
    return merged
  }
  // 数组、字符串这类整块值两边都改过：按文件版本
  onConflict()
  return disk
}

/** 素材按 id 对齐：一边新增的保留，只有一边删掉的尊重删除；两边都改过的走字段合并 */
export function mergeAssets(base: Asset[], local: Asset[], disk: Asset[]): MergeOutcome {
  const norm = (list: Asset[] | null | undefined) => (list || []).map((asset) => normalizeAsset(asset))
  const baseline = new Map(norm(base).map((asset) => [asset.id, asset]))
  const localById = new Map(norm(local).map((asset) => [asset.id, asset]))
  const diskById = new Map(norm(disk).map((asset) => [asset.id, asset]))
  const conflicts = new Set<string>()
  const merged: Asset[] = []

  const ids = [
    ...localById.keys(),
    ...Array.from(diskById.keys()).filter((id) => !localById.has(id)),
  ]
  for (const id of ids) {
    const before = baseline.get(id)
    const mine = localById.get(id)
    const theirs = diskById.get(id)

    if (mine && theirs) {
      merged.push(mergeValue(before, mine, theirs, () => conflicts.add(id)) as Asset)
      continue
    }

    if (mine) {
      // 文件里没有这个素材
      if (!before) {
        merged.push(mine) // 界面上新加的，等写回
        continue
      }
      if (sameValue(mine, before)) continue // 界面没动过，跟着文件删掉
      conflicts.add(id) // 界面改过但文件删了：按文件版本
      continue
    }

    if (theirs) {
      if (!before) {
        merged.push(theirs) // 文件里新加的
        continue
      }
      if (sameValue(theirs, before)) continue // 文件没动过，界面删了它
      conflicts.add(id) // 界面删了但文件改过：按文件版本留回来
      merged.push(theirs)
    }
  }

  for (const asset of merged) {
    if (asset.revision && !(asset.versions ?? []).some((version) => version.index === asset.revision!.index)) {
      delete (asset as { revision?: unknown }).revision
    }
  }
  return { assets: merged, conflicts: Array.from(conflicts), changed: !sameValue(merged, norm(disk)) }
}
