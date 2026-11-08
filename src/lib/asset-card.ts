/**
 * 素材卡片的竖向结构：画面在上，「视频文案」条紧贴画面下沿。
 * 两者共用同一张卡片（同一个画板、同一个选中框），靠分隔线和底色分区。
 */
/** 文案条内部：标题行、正文起点、左右留白 */
export const COPY_HEADER_TOP = 10
export const COPY_BODY_TOP = 32
export const COPY_SIDE = 14
export const COPY_TEXT_LEFT = 22
export const COPY_LINE_HEIGHT = 18
export const COPY_BOTTOM = 10
/** 卡片上最多展示三行，多出来的收成省略号 */
export const COPY_LINES = 3
export const VIDEO_COPY_BAND_HEIGHT = COPY_BODY_TOP + COPY_LINES * COPY_LINE_HEIGHT + COPY_BOTTOM

export function hasVideoCopy(videoCopy?: string) {
  return !!videoCopy?.trim()
}

export function assetCardHeight(svgHeight: number, videoCopy?: string) {
  return svgHeight + (hasVideoCopy(videoCopy) ? VIDEO_COPY_BAND_HEIGHT : 0)
}

/** 字数按字符算，空白不计 */
export function countCopy(text: string) {
  return Array.from(text.replace(/\s+/g, '')).length
}
