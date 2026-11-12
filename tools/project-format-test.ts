import type { Asset } from '../src/types'
import { PROJECT_FORMAT, PROJECT_VERSION, createProject, normalizeProject } from '../src/lib/project'

function check(name: string, cond: boolean, detail?: any) {
  if (!cond) {
    console.error('FAIL', name, JSON.stringify(detail))
    process.exitCode = 1
  } else console.log('ok  ', name)
}

function asset(id: string, patch: Partial<Asset> = {}): Asset {
  return {
    id,
    name: id,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>',
    format: 'svg',
    width: 100,
    height: 100,
    kind: 'static',
    groups: [],
    elements: [],
    videoCopy: '',
    overrides: {},
    layouts: {},
    warnings: [],
    source: 'import',
    x: 0,
    y: 0,
    createdAt: 1,
    version: 1,
    ...patch,
  } as Asset
}

const versions = [
  { index: 1, createdAt: 100, label: '首版', svg: '<svg>v1</svg>', width: 10, height: 10 },
  { index: 2, createdAt: 200, svg: '<svg>v2</svg>', width: 10, height: 10 },
]

// 写：版本进文件，格式版本升到 2
const written = createProject([asset('a', { versions, revision: { index: 2, createdAt: 200 } })], '测试')
check('项目格式版本是 2', written.version === 2 && PROJECT_VERSION === 2, written.version)
check('版本写进 assets[].versions', (written.assets[0] as any).versions?.length === 2, (written.assets[0] as any).versions)
check('版本指针写进文件', (written.assets[0] as any).revision?.index === 2, (written.assets[0] as any).revision)
check('没有版本时不写这个字段', !('versions' in createProject([asset('b')]).assets[0]), createProject([asset('b')]).assets[0])

// 读：JSON 往返
const round = normalizeProject(JSON.parse(JSON.stringify(written)))
check('往返后版本还在', round.assets[0].versions?.length === 2, round.assets[0].versions)
check('往返后内容一致', round.assets[0].versions?.[1].svg === '<svg>v2</svg>', round.assets[0].versions?.[1])
check('往返后指针还在', round.assets[0].revision?.index === 2, round.assets[0].revision)

// 读：老文件（v1，没有 versions）照样能打开
const legacy = normalizeProject({
  format: PROJECT_FORMAT,
  version: 1,
  name: '老项目',
  assets: [{ id: 'a', name: 'A', svg: '<svg/>', width: 1, height: 1 }],
})
check('v1 老文件能读', legacy.assets.length === 1, legacy)
check('v1 读进来没有版本', (legacy.assets[0].versions ?? []).length === 0, legacy.assets[0].versions)
check('v1 读进来升到新版本号', legacy.version === PROJECT_VERSION, legacy.version)

// 读：脏数据不炸整份文件
const messy = normalizeProject({
  format: PROJECT_FORMAT,
  version: 2,
  name: '脏数据',
  assets: [{
    id: 'a', name: 'A', svg: '<svg/>', width: 1, height: 1,
    versions: [
      { index: 2, createdAt: 20, svg: '<svg>v2</svg>', width: 1, height: 1 },
      { index: 1, createdAt: 10, svg: '<svg>v1</svg>', width: 1, height: 1 },
      { index: 2, createdAt: 30, svg: '<svg>重复</svg>', width: 1, height: 1 },
      { index: 3, createdAt: 30 },
      { index: 'x', svg: '<svg/>' },
    ],
  }],
})
check('版本按 index 升序', messy.assets[0].versions?.map((v) => v.index).join(',') === '1,2', messy.assets[0].versions)
check('重复的版本号只留一份', messy.assets[0].versions?.[1].svg === '<svg>v2</svg>', messy.assets[0].versions)
check('没有 svg 的版本丢掉', messy.assets[0].versions?.length === 2, messy.assets[0].versions)

console.log('done')
