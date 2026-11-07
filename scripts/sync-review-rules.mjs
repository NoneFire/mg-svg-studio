#!/usr/bin/env node
/**
 * 把 quant-visual-review 的规则库同步进工作室。
 *
 * 评审的阈值只有一个来源：规则库 JSON。面板里的判定、影响分级、闸门权限全部查这张表，
 * 代码里不写死数字。规则库升级后跑一次这个脚本即可，别手改 src/lib/review/rules.json。
 *
 *   node scripts/sync-review-rules.mjs                      # 用默认技能目录
 *   node scripts/sync-review-rules.mjs --from <rules.json>  # 指定路径
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'src/lib/review/rules.json')
const args = process.argv.slice(2)
const fromIdx = args.indexOf('--from')
const from =
  fromIdx >= 0
    ? args[fromIdx + 1]
    : path.join(os.homedir(), '.dsh/skills/quant-visual-review/assets/rules.json')

if (!from || !fs.existsSync(from)) {
  console.error(`找不到规则库：${from}`)
  console.error('用法：node scripts/sync-review-rules.mjs --from <path/to/rules.json>')
  process.exit(1)
}

const text = fs.readFileSync(from, 'utf8')
const data = JSON.parse(text)
if (!Array.isArray(data.rules) || !data.libraryVersion) {
  console.error('这不是规则库：缺少 libraryVersion 或 rules[]')
  process.exit(1)
}

const hash = crypto.createHash('sha256').update(text).digest('hex').slice(0, 12)
fs.mkdirSync(path.dirname(target), { recursive: true })
fs.writeFileSync(target, text)

console.log(`已同步 ${data.rules.length} 条规则 · libraryVersion ${data.libraryVersion} · sha ${hash}`)
console.log(`→ ${path.relative(root, target)}`)
console.log('提醒：新增规则若要在浏览器里测得，需要同时更新 src/lib/review/rules.ts 的 IMPLEMENTED 表。')
