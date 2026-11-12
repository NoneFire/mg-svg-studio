import type { Asset } from '../src/types'
import { mergeAssets } from '../src/lib/project-merge'

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
    svg: '<svg xmlns="http://www.w3.org/2000/svg"/>',
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

const byId = (list: Asset[], id: string) => list.find((item) => item.id === id)!

// 只有文件改了：取文件，不需要写回
let out = mergeAssets([asset('a')], [asset('a')], [asset('a', { name: '文件改名' })])
check('只有文件改：用文件版本', byId(out.assets, 'a').name === '文件改名', out.assets)
check('只有文件改：不用写回', out.changed === false && out.conflicts.length === 0, out)

// 只有界面改了：保留，需要写回
out = mergeAssets([asset('a')], [asset('a', { name: '界面改名' })], [asset('a')])
check('只有界面改：保留界面版本', byId(out.assets, 'a').name === '界面改名', out.assets)
check('只有界面改：要写回文件', out.changed === true, out)

// 两边改不同字段：都留住
out = mergeAssets(
  [asset('a')],
  [asset('a', { x: 640 })],
  [asset('a', { name: '文件改名' })],
)
check('两边改不同字段：都保留', byId(out.assets, 'a').x === 640 && byId(out.assets, 'a').name === '文件改名', out.assets)
check('两边改不同字段：合并结果和文件不同 → 要写回', out.changed === true && !out.conflicts.length, out)

// 两边改同一个字段：按文件版本，记冲突
out = mergeAssets(
  [asset('a', { videoCopy: '' })],
  [asset('a', { videoCopy: '界面写的' })],
  [asset('a', { videoCopy: '文件写的' })],
)
check('同一字段冲突：文件优先', byId(out.assets, 'a').videoCopy === '文件写的', out.assets)
check('同一字段冲突：记一条冲突', out.conflicts.length === 1 && out.conflicts[0] === 'a', out)
check('同一字段冲突：不用写回', out.changed === false, out)

// 嵌套对象：不同元素各自合并
out = mergeAssets(
  [asset('a')],
  [asset('a', { overrides: { e1: { fill: '#fff' } } })],
  [asset('a', { overrides: { e2: { stroke: '#000' } } })],
)
const merged = byId(out.assets, 'a').overrides as any
check('嵌套覆盖：两边的元素都在', merged.e1?.fill === '#fff' && merged.e2?.stroke === '#000', merged)

// 嵌套对象里同一个元素的不同属性：各改各的，都留下
out = mergeAssets(
  [asset('a', { overrides: { e1: { fill: '#111' } } })],
  [asset('a', { overrides: { e1: { fill: '#111', opacity: 0.5 } } })],
  [asset('a', { overrides: { e1: { fill: '#222' } } })],
)
let deep = byId(out.assets, 'a').overrides as any
check('嵌套覆盖：属性级合并', deep.e1.fill === '#222' && deep.e1.opacity === 0.5, deep)

// 同一个属性两边都改：按文件版本，记冲突
out = mergeAssets(
  [asset('a', { overrides: { e1: { fill: '#111' } } })],
  [asset('a', { overrides: { e1: { fill: '#333', opacity: 0.5 } } })],
  [asset('a', { overrides: { e1: { fill: '#222' } } })],
)
deep = byId(out.assets, 'a').overrides as any
check('嵌套覆盖：同一属性按文件版本', deep.e1.fill === '#222' && deep.e1.opacity === 0.5, deep)
check('嵌套覆盖：记一条冲突', out.conflicts.length === 1, out)

// 数组字段两边都改：按文件版本
out = mergeAssets(
  [asset('a')],
  [asset('a', { groups: [{ id: 'g1' }] as any })],
  [asset('a', { groups: [{ id: 'g2' }] as any })],
)
check('数组字段冲突：按文件版本', byId(out.assets, 'a').groups[0].id === 'g2', byId(out.assets, 'a').groups)

// 文件删了、界面没动：跟着删
out = mergeAssets([asset('a'), asset('b')], [asset('a'), asset('b')], [asset('a')])
check('文件删除：界面没动就跟着删', out.assets.length === 1 && out.assets[0].id === 'a', out.assets)

// 文件删了、界面改过：按文件版本删，记冲突
out = mergeAssets([asset('a'), asset('b')], [asset('a'), asset('b', { x: 20 })], [asset('a')])
check('文件删除+界面改过：按文件版本删掉', out.assets.length === 1, out.assets)
check('文件删除+界面改过：记冲突', out.conflicts.includes('b'), out)

// 界面删了、文件没动：尊重删除
out = mergeAssets([asset('a'), asset('b')], [asset('a')], [asset('a'), asset('b')])
check('界面删除：文件没动就保持删除', out.assets.length === 1, out.assets)

// 界面删了、文件改过：按文件版本留回来
out = mergeAssets([asset('a'), asset('b')], [asset('a')], [asset('a'), asset('b', { name: '文件改名' })])
check('界面删除+文件改过：留回文件版本', out.assets.length === 2 && byId(out.assets, 'b').name === '文件改名', out.assets)
check('界面删除+文件改过：记冲突', out.conflicts.includes('b'), out)

// 新增素材：两边都加
out = mergeAssets([], [asset('new-local')], [asset('new-disk')])
check('新增素材：两边都保留', out.assets.length === 2, out.assets.map((a) => a.id))
check('新增素材：界面新增的要写回', out.changed === true, out)

// 基线未知（第一次同步就两边都有改动）：按文件版本
out = mergeAssets([], [asset('a', { name: '界面' })], [asset('a', { name: '文件' })])
check('没有基线时：按文件版本', byId(out.assets, 'a').name === '文件', out.assets)

// 完全一致：不用动
out = mergeAssets([asset('a')], [asset('a')], [asset('a')])
check('完全一致：不改不写', out.changed === false && !out.conflicts.length, out)

/* ------------------------------ 历史版本 ------------------------------ */

const v = (index: number, svg = `<svg>v${index}</svg>`) => ({ index, createdAt: index * 10, svg, width: 10, height: 10 })

// 只有文件记了新版本：合进来
out = mergeAssets(
  [asset('a', { versions: [v(1)] })],
  [asset('a', { versions: [v(1)] })],
  [asset('a', { versions: [v(1), v(2)] })],
)
check('版本：文件新记的合进来', byId(out.assets, 'a').versions?.length === 2, byId(out.assets, 'a').versions)
check('版本：只文件新增不用写回', out.changed === false, out)

// 只有界面记了新版本：保留并写回
out = mergeAssets(
  [asset('a', { versions: [v(1)] })],
  [asset('a', { versions: [v(1), v(2)] })],
  [asset('a', { versions: [v(1)] })],
)
check('版本：界面新记的保留', byId(out.assets, 'a').versions?.map((x) => x.index).join(',') === '1,2', out.assets)
check('版本：界面新记的要写回', out.changed === true, out)

// 两边各记一版：并集
out = mergeAssets(
  [asset('a', { versions: [v(1)] })],
  [asset('a', { versions: [v(1), v(2)] })],
  [asset('a', { versions: [v(1), v(3)] })],
)
check('版本：两边各记一版取并集', byId(out.assets, 'a').versions?.map((x) => x.index).join(',') === '1,2,3', out.assets)
check('版本：并集不记冲突', !out.conflicts.length, out)

// 同一个版本号内容不同：按文件版本
out = mergeAssets(
  [asset('a', { versions: [v(1)] })],
  [asset('a', { versions: [v(1), v(2, '<svg>界面版本</svg>')] })],
  [asset('a', { versions: [v(1), v(2, '<svg>文件版本</svg>')] })],
)
check('版本：同号冲突按文件', byId(out.assets, 'a').versions?.[1].svg === '<svg>文件版本</svg>', out.assets)
check('版本：同号冲突记一条', out.conflicts.length === 1, out)

// 文件删了一版：跟着删（界面没动过版本）
out = mergeAssets(
  [asset('a', { versions: [v(1), v(2)] })],
  [asset('a', { versions: [v(1), v(2)] })],
  [asset('a', { versions: [v(1)] })],
)
check('版本：文件删了就跟着删', byId(out.assets, 'a').versions?.length === 1, out.assets)

// 界面删了一版：保持删除
out = mergeAssets(
  [asset('a', { versions: [v(1), v(2)] })],
  [asset('a', { versions: [v(1)] })],
  [asset('a', { versions: [v(1), v(2)] })],
)
check('版本：界面删了保持删除', byId(out.assets, 'a').versions?.length === 1, out.assets)

// 指针指向的版本被删掉了：指针一起清掉
out = mergeAssets(
  [asset('a', { versions: [v(1), v(2)], revision: { index: 2, createdAt: 20 } })],
  [asset('a', { versions: [v(1), v(2)], revision: { index: 2, createdAt: 20 } })],
  [asset('a', { versions: [v(1)] })],
)
check('版本：指针指向已删版本时清空', byId(out.assets, 'a').revision === undefined, byId(out.assets, 'a').revision)

console.log('done')
