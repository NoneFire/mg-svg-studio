import type { Finding } from './types'

/**
 * 评审的分类轴。
 *
 * 规则库给的是 principle（原则），一条原则只说明「错在哪」，不说明「该去哪儿修」：
 * 对齐和网格都是布局问题，对比度和调色板都是看漏问题。面板按「修的时候一起改的那一批」
 * 分成 5 类，每类都能对应到 impeccable craft floor 的一条视觉轴：
 *
 *   排版  ← type       字号 / 行高 / 字重 / 层级
 *   布局  ← spacing    对齐 / 网格 / 间距 / 留白 / 溢出
 *   对比  ← contrast   文字与底色、配色预算、调色板
 *   一致性           同类东西是否长得一样
 *   交付              裁切、遮挡、资源失效
 *
 * 分类是展示层的东西，不进规则库：规则库同步（scripts/sync-review-rules.mjs）不会覆盖它。
 * 没登记的新规则按 principle 兜底，兜不住的进「其他」，不会消失。
 */

export type GroupId = 'type' | 'layout' | 'contrast' | 'consistency' | 'delivery' | 'other'

export interface ReviewGroupMeta {
  id: GroupId
  label: string
  desc: string
}

export const REVIEW_GROUPS: ReviewGroupMeta[] = [
  { id: 'type', label: '排版', desc: '字号、行高、字重、层级：读得清不清' },
  { id: 'layout', label: '布局', desc: '对齐、网格、间距、留白、出画：位置关系对不对' },
  { id: 'contrast', label: '对比', desc: '文字与底色、配色预算、调色板：看不看得见' },
  { id: 'consistency', label: '一致性', desc: '档位收没收敛、同类东西是否长得一样' },
  { id: 'delivery', label: '交付', desc: '裁切、遮挡、资源失效：能不能交出去' },
  { id: 'other', label: '其他', desc: '还没归类的规则' },
]

const GROUP_LABEL: Record<GroupId, string> = Object.fromEntries(REVIEW_GROUPS.map((g) => [g.id, g.label])) as Record<
  GroupId,
  string
>
const GROUP_DESC: Record<GroupId, string> = Object.fromEntries(REVIEW_GROUPS.map((g) => [g.id, g.desc])) as Record<
  GroupId,
  string
>

/** 逐条登记：这是「修的时候一起改」的归属，不是原则的复述 */
const RULE_GROUP: Record<string, GroupId> = {
  // 排版
  'QL-03': 'type',
  'QL-04': 'type',
  'TY-01': 'type',
  'TY-04': 'type',
  'TY-05': 'type',
  'TY-07': 'type',
  'TY-08': 'type',
  'CT-01': 'type',
  // 布局
  'QL-01': 'layout',
  'QL-02': 'layout',
  'VS-01': 'layout',
  'AL-01': 'layout',
  'AL-02': 'layout',
  'GR-01': 'layout',
  'GR-02': 'layout',
  'NS-01': 'layout',
  // 对比
  'CT-02': 'contrast',
  'TX-01': 'contrast',
  'CL-01': 'contrast',
  // 一致性：档位收没收敛，同类是否长得一样
  'GE-02': 'consistency',
  'RP-01': 'consistency',
  'TY-06': 'consistency',
  'SP-01': 'consistency',
  // 交付
  'QL-07': 'delivery',
}

/** 新规则兜底：先看原则，再看规则号前缀 */
const PRINCIPLE_GROUP: Record<string, GroupId> = {
  对比: 'contrast',
  可读性: 'type',
  // 正反例表用的原则名
  可读性与可辨识性: 'type',
  亲密: 'layout',
  格式塔: 'layout',
  信息组织: 'layout',
  平衡与比例: 'layout',
  重复: 'consistency',
  交付检查: 'delivery',
  视觉层次: 'type',
  统一与多样: 'contrast',
  对齐: 'layout',
  网格: 'layout',
  亲密性: 'layout',
  负空间: 'layout',
  共同区域: 'layout',
  重复与一致性: 'consistency',
  '格式塔·相似': 'consistency',
  交付完整性: 'delivery',
  可用性: 'delivery',
}

const PREFIX_GROUP: Record<string, GroupId> = {
  QL: 'layout',
  VS: 'delivery',
  AL: 'layout',
  GR: 'layout',
  SP: 'layout',
  NS: 'layout',
  TY: 'type',
  CT: 'contrast',
  TX: 'contrast',
  CL: 'contrast',
  RP: 'consistency',
  GE: 'consistency',
}

export function groupOf(ruleId: string, principle?: string): GroupId {
  if (RULE_GROUP[ruleId]) return RULE_GROUP[ruleId]
  if (principle && PRINCIPLE_GROUP[principle]) return PRINCIPLE_GROUP[principle]
  const prefix = ruleId.split('-')[0]
  return PREFIX_GROUP[prefix] || 'other'
}

export const groupLabel = (id: GroupId) => GROUP_LABEL[id] || '其他'
export const groupDesc = (id: GroupId) => GROUP_DESC[id] || ''

/** 一条 finding 的归类；画布级判定也按规则号归 */
export const groupOfFinding = (f: Finding) => groupOf(f.ruleId, f.principle)
