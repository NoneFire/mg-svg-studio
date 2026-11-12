import type { Asset } from '../src/types'
import { canvasGrid, cardSize, layoutByOrder, moveInOrder, nearestSlot, visualOrder } from '../src/lib/canvas-grid'

function check(name: string, cond: boolean, detail?: any) {
  if (!cond) {
    console.error('FAIL', name, JSON.stringify(detail))
    process.exitCode = 1
  } else console.log('ok  ', name)
}

let seq = 0
function asset(id: string, width: number, height: number, x = 0, y = 0): Asset {
  seq += 1
  return { id, name: id, width, height, x, y, createdAt: seq, groups: [], overrides: {}, warnings: [] } as unknown as Asset
}

const settings = { cols: 2, gap: 90 }

// 槽位：列宽取最宽的一张卡，行高取该行最高的一张卡
const a = asset('a', 1920, 1080)
const b = asset('b', 1600, 1320)
const c = asset('c', 1920, 1080)
const grid = layoutByOrder([a, b, c], ['a', 'b', 'c'], settings)
check('第一行两个槽位按列宽排开', grid.slots.get('a')!.x === 0 && grid.slots.get('b')!.x === cardSize(a).w + 90, [...grid.slots])
check('换行回到第一列', grid.slots.get('c')!.x === 0 && grid.slots.get('c')!.y > 0, grid.slots.get('c'))
check('槽位顺序与给定顺序一致', grid.order.join(',') === 'a,b,c', grid.order)

// 格子矩形：同一行的格子上下对齐、左右紧邻（无缝也不重叠）
const cellA = grid.cells.get('a')!
const cellB = grid.cells.get('b')!
const cellC = grid.cells.get('c')!
check('同排格子高度一致', cellA.height === cellB.height, [cellA, cellB])
check('格子左右相接', Math.abs(cellA.x + cellA.width - cellB.x) < 1e-6, [cellA, cellB])
check('上下相接', Math.abs(cellA.y + cellA.height - cellC.y) < 1e-6, [cellA, cellC])
check('格子里放得下画板', cellA.width > cardSize(a).w && cellA.height > cardSize(a).h, cellA)

// 拖动换位：把 c 挪到第一格，其余顺移
const moved = moveInOrder(['a', 'b', 'c'], 'c', 0)
check('换位后顺序', moved.join(',') === 'c,a,b', moved)
check('越界索引夹住', moveInOrder(['a', 'b'], 'a', 99).join(',') === 'b,a', moveInOrder(['a', 'b'], 'a', 99))
const next = layoutByOrder([a, b, c], moved, settings)
check('换位后由新顺序落格', next.slots.get('c')!.x === 0 && next.slots.get('c')!.y === 0, next.slots.get('c'))

// 可视顺序按位置兜底，同一位置按创建时间，保证稳定
const visual = visualOrder([
  { ...asset('p'), x: 650, y: 0 },
  { ...asset('q'), x: 0, y: 0 },
  { ...asset('r'), x: 0, y: 500 },
])
check('可视顺序：先上后下、先左后右', visual.map((item) => item.id).join(',') === 'q,p,r', visual.map((item) => item.id))

// 落点：离哪块格子最近
const near = canvasGrid([a, b, c], settings)
check('落在第一格', nearestSlot(near, { x: 10, y: 10 }) === 'a', nearestSlot(near, { x: 10, y: 10 }))
check('落在第三格（第二行）', nearestSlot(near, { x: 10, y: near.cells.get('c')!.y + 10 }) === 'c')

// 空画布不炸
const empty = canvasGrid([], settings)
check('空画布没有槽位', empty.order.length === 0 && empty.slots.size === 0)

console.log('done')
