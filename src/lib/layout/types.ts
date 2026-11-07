/** 布局内核的公开协议：输入尺寸与约束，输出绝对坐标。渲染层不参与计算。 */
export type LayoutMode = 'free' | 'row' | 'column' | 'grid'
export type Align = 'start' | 'center' | 'end' | 'stretch'
export type Justify = 'start' | 'center' | 'end' | 'between'

export interface LayoutSpec {
  mode: LayoutMode
  /** 主/次轴统一间距 */
  gap: number
  rowGap?: number
  /** 四边内边距，单位与画布一致 */
  padding: number
  /** 网格模式的列数 */
  cols: number
  /** 容器内宽；给出后 row 可换行、grid 可等分列宽 */
  width?: number | null
  /** 每个子项的最大宽度约束 */
  maxWidth?: number | null
  alignX: Align
  alignY: Align
  justify: Justify
  wrap: boolean
}

export interface LayoutItem {
  id: string
  width: number
  height: number
  /** free 模式下沿用原有位置 */
  x?: number
  y?: number
  /** 可选：覆盖默认尺寸（例如固定卡片宽） */
  fixedWidth?: number
  fixedHeight?: number
}

export interface LayoutBox {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutResult {
  boxes: LayoutBox[]
  width: number
  height: number
}

export const DEFAULT_LAYOUT: LayoutSpec = {
  mode: 'row',
  gap: 24,
  rowGap: 24,
  padding: 0,
  cols: 3,
  width: null,
  maxWidth: null,
  alignX: 'start',
  alignY: 'center',
  justify: 'start',
  wrap: false,
}
