import { solveLayout } from '../src/lib/layout/engine'

function check(name: string, cond: boolean, detail?: any) {
  if (!cond) {
    console.error('FAIL', name, JSON.stringify(detail))
    process.exitCode = 1
  } else console.log('ok  ', name)
}

const items = [
  { id: 'a', width: 100, height: 40 },
  { id: 'b', width: 60, height: 80 },
  { id: 'c', width: 80, height: 30 },
  { id: 'd', width: 40, height: 40 },
]

// row + 居中交叉对齐
let r = solveLayout(items, { mode: 'row', gap: 20, alignY: 'center' })
check('row x positions', r.boxes.map((b) => b.x).join(',') === '0,120,200,300', r.boxes)
check('row y centered', r.boxes[0].y === 20 && r.boxes[1].y === 0 && r.boxes[2].y === 25, r.boxes)
check('row size', r.width === 340 && r.height === 80, r)

// row + between + 内宽
r = solveLayout(items, { mode: 'row', gap: 10, width: 500, padding: 20, justify: 'between' })
check('row between spread', r.boxes[0].x === 20 && r.boxes[3].x + r.boxes[3].width === 480, r.boxes)
check('row width with padding', r.width === 500, r)

// wrap
r = solveLayout(items, { mode: 'row', gap: 10, width: 200, wrap: true })
check('row wraps to 2 lines', r.boxes.filter((b) => b.y >= 80).length === 2, r.boxes)
check('row second line offset', r.boxes[3].y === 80 + 10, r.boxes)

// column
r = solveLayout(items, { mode: 'column', gap: 8, alignX: 'end', width: 200 })
check('column stacks', r.boxes[0].y === 0 && r.boxes[1].y === 48, r.boxes)
check('column align end', r.boxes.every((b) => Math.abs(b.x + b.width - 200) < 0.001), r.boxes)

// grid
r = solveLayout(items, { mode: 'grid', cols: 2, gap: 10, rowGap: 10, width: 210, alignX: 'center', alignY: 'center' })
check('grid cols + centering', r.boxes[0].x === 0 && r.boxes[1].x === 130, r.boxes)
check('grid second row', r.boxes[2].y === 95 && r.boxes[3].y === 90, r.boxes)
check('grid row height max', r.boxes[2].width === 80, r.boxes)

// free
r = solveLayout([{ id: 'x', width: 10, height: 10, x: 5, y: 7 }], { mode: 'free' })
check('free keeps position', r.boxes[0].x === 5 && r.boxes[0].y === 7, r.boxes)

// maxWidth
r = solveLayout([{ id: 'wide', width: 900, height: 10 }], { mode: 'row', maxWidth: 120 })
check('maxWidth clamps', r.boxes[0].width === 120, r.boxes)

console.log('done')
