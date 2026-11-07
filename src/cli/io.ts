import fs from 'node:fs'
import path from 'node:path'
import { DOMParser as LinkedomParser } from 'linkedom'
import { setSvgDomParser } from '../lib/svg-doc'
import { normalizeProject, type ProjectFile } from '../lib/project'

// Node 侧用 linkedom 顶替浏览器 DOMParser
setSvgDomParser(() => new LinkedomParser() as any)

export function readProject(file: string): ProjectFile {
  return readProjectFile(file).project
}

export function readProjectFile(file: string): { project: ProjectFile; snapshot: string } {
  const abs = path.resolve(file)
  if (!fs.existsSync(abs)) throw new Error(`项目文件不存在：${abs}`)
  const raw = fs.readFileSync(abs, 'utf8')
  let json: any
  try {
    json = JSON.parse(raw)
  } catch (err) {
    throw new Error(`项目文件不是合法 JSON：${(err as Error).message}`)
  }
  return { project: normalizeProject(json), snapshot: raw }
}

export function writeProject(file: string, project: ProjectFile, snapshot?: string) {
  const abs = path.resolve(file)
  const tmp = `${abs}.tmp-${process.pid}`
  const body = JSON.stringify(project, null, 2) + '\n'
  try {
    fs.writeFileSync(tmp, body, 'utf8')
    if (snapshot !== undefined && fs.readFileSync(abs, 'utf8') !== snapshot) {
      throw new Error('项目文件在读取后已被修改，请重新读取后再应用')
    }
    fs.renameSync(tmp, abs)
  } finally {
    fs.rmSync(tmp, { force: true })
  }
  return abs
}

export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (data += chunk))
    process.stdin.on('end', () => resolve(data))
    process.stdin.on('error', reject)
  })
}

export function readJsonFile(file: string): any {
  return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'))
}
