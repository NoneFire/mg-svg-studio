/** 剪贴板 / 拖拽进来的素材：SVG 源码、SVG 文件、位图（PNG/JPEG/…）都收 */

export function looksLikeSvg(text: string): boolean {
  const head = text.trim().slice(0, 500).toLowerCase()
  if (!head.includes('<svg')) return false
  return head.startsWith('<') || head.startsWith('<?xml') || head.includes('xmlns=')
}

export function isSvgFile(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
}

export function isBitmapFile(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp)$/i.test(file.name)
}

function cleanName(name: string): string {
  return name.replace(/\.(svg|png|jpe?g|webp|gif|avif|bmp)$/i, '').trim() || '素材'
}

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error || new Error('读取文件失败'))
    reader.readAsDataURL(file)
  })
}

export function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth || 1, height: img.naturalHeight || 1 })
    img.onerror = () => reject(new Error('图片解码失败'))
    img.src = src
  })
}

/** 把位图包成最小 SVG：后续的解析、布局、项目文件、CLI 全部复用同一条管线 */
export function wrapBitmapInSvg(dataUrl: string, width: number, height: number): string {
  const w = Math.max(1, Math.round(width))
  const h = Math.max(1, Math.round(height))
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<image href="${dataUrl}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>` +
    `</svg>`
  )
}

export async function bitmapFileToSvg(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file)
  const size = await imageSize(dataUrl)
  return wrapBitmapInSvg(dataUrl, size.width, size.height)
}

export async function dataUrlToSvg(dataUrl: string): Promise<string> {
  const size = await imageSize(dataUrl)
  return wrapBitmapInSvg(dataUrl, size.width, size.height)
}

export { cleanName }
