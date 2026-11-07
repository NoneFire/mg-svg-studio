#!/usr/bin/env node
/**
 * 一键把子页面发到 uniCloud 前端网页托管。
 *
 * 前置：HBuilderX 已打开并登录 DCloud 账号（CLI 依赖它）。
 * 用法：pnpm deploy:unicloud
 * 可调：HX_SPACE（默认 bests-prod）、HX_PREFIX（默认 mg-svg/）、HX_CLI、BESTORY_DIR
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const CLI = process.env.HX_CLI || '/Applications/HBuilderX.app/Contents/MacOS/cli'
const SPACE = process.env.HX_SPACE || 'bests-prod'
const PREFIX = process.env.HX_PREFIX || 'mg-svg/'
const PRJ = process.env.HX_PRJ || 'best_s'
const root = path.resolve(import.meta.dirname, '..')

if (!fs.existsSync(CLI)) {
  console.error(`找不到 HBuilderX CLI：${CLI}`)
  process.exit(1)
}

const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', ...opts })

console.log('→ 构建并同步到 best_s/public/mg-svg')
run('node scripts/sync-bestory.mjs', { cwd: root })

console.log(`→ 确认 HBuilderX 已导入 ${PRJ}`)
const list = execSync(`"${CLI}" project list`, { encoding: 'utf8' })
if (!list.includes(PRJ)) {
  const bestory = process.env.BESTORY_DIR || path.join(process.env.HOME, 'Documents/github/best_s')
  console.log(`  未导入，正在导入：${bestory}`)
  run(`"${CLI}" project open --path "${bestory}"`)
}

console.log(`→ 上传到空间 ${SPACE} 的 ${PREFIX}`)
run(`"${CLI}" hosting deploy --prj ${PRJ} --provider aliyun --space ${SPACE} --source public/mg-svg --prefix ${PREFIX}`)

console.log('\n完成。子页面地址形如：')
console.log('  https://static-<space-id>.next.bspapp.com/' + PREFIX)
