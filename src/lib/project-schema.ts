import { z } from 'zod'
import type { AnimGroup } from '../types'
import type { LayoutSpec } from './layout/types'

const id = z.string().min(1)
const keyframe = z.strictObject({ offset: z.number().min(0).max(1), value: z.string() })
const track = z.strictObject({ id, property: id, keyframes: z.array(keyframe) })

export const animationSchema = z.strictObject({
  id,
  name: z.string(),
  targetId: id,
  targetIds: z.array(id).min(1).optional(),
  duration: z.number().positive(),
  delay: z.number(),
  stagger: z.number().nonnegative().optional(),
  ease: id,
  iterations: z.union([z.number().positive(), z.literal('infinite')]),
  direction: z.enum(['normal', 'reverse', 'alternate', 'alternate-reverse']),
  fillMode: z.enum(['none', 'forwards', 'backwards', 'both']),
  origin: z.enum(['css', 'smil', 'manual']),
  originPoint: z.strictObject({ x: z.number(), y: z.number() }),
  enabled: z.boolean().optional(),
  tracks: z.array(track).min(1),
})

const animationPatch = animationSchema.omit({ id: true }).partial()
const align = z.enum(['start', 'center', 'end', 'stretch'])
const size = z.number().nonnegative().nullable().optional()
const layoutPatch = z.strictObject({
  mode: z.enum(['free', 'row', 'column', 'grid']),
  gap: z.number().nonnegative(),
  rowGap: z.number().nonnegative().optional(),
  padding: z.number().nonnegative(),
  cols: z.number().int().min(1).max(1000),
  width: size,
  maxWidth: size,
  alignX: align,
  alignY: align,
  justify: z.enum(['start', 'center', 'end', 'between']),
  wrap: z.boolean(),
}).partial()

export function schemaProblems(error: z.ZodError): string[] {
  return error.issues.flatMap((issue) => {
    const prefix = issue.path.length ? `${issue.path.join('.')}: ` : ''
    return issue.code === 'unrecognized_keys'
      ? issue.keys.map((key) => `${prefix}未知字段 ${key}`)
      : [prefix + issue.message]
  })
}

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new Error(`${label}校验失败：${schemaProblems(result.error).join('，')}`)
  return result.data
}

export function parseAnimationPatch(value: unknown): Partial<AnimGroup> {
  return parse(animationPatch, value, '动画参数')
}

export function parseLayoutPatch(value: unknown): Partial<LayoutSpec> {
  return parse(layoutPatch, value, '布局参数')
}

export function parseKeyframes(value: unknown) {
  return parse(z.array(keyframe), value, '关键帧')
}
