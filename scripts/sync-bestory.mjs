#!/usr/bin/env node
/**
 * 把 MG SVG Studio 构建成一个静态子页面，同步到 best_s/public/mg-svg。
 * 这样 best_s 构建 / 部署到 uniCloud 时会一起带上，访问 <站点>/mg-svg/ 即可。
 *
 * 用法：pnpm build:bestory
 * 可用 BESTORY_DIR 指定目标目录（默认 ../../Documents/github/best_s）
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const root = path.resolve(import.meta.dirname, '..')
const bestory = process.env.BESTORY_DIR || path.join(os.homedir(), 'Documents/github/best_s')
const target = path.join(bestory, 'public', 'mg-svg')

if (!fs.existsSync(bestory)) {
  console.error(`找不到 best_s 目录：${bestory}\n可用 BESTORY_DIR 指定。`)
  process.exit(1)
}

console.log('→ 构建（相对 base，可放在任意子路径）')
execSync('npx vite build --outDir dist-bestory --emptyOutDir', { cwd: root, stdio: 'inherit' })

console.log(`→ 同步到 ${target}`)
fs.rmSync(target, { recursive: true, force: true })
fs.mkdirSync(target, { recursive: true })
fs.cpSync(path.join(root, 'dist-bestory'), target, { recursive: true })

const size = execSync(`du -sh "${target}"`).toString().split('\t')[0].trim()
console.log(`✓ 完成：${target}（${size}）`)
console.log('  best_s 里 `pnpm build` 后，dist/mg-svg/ 会一起被部署；访问 <host>/mg-svg/ 即可。')
