/**
 * 素材自带的 @font-face → document.fonts。
 *
 * Studio 把 SVG 重画到 canvas，文字最后是一次 ctx.font 画布绘制。
 * canvas 只认两处字体：系统里装了的、和注册进 document.fonts 的。
 * 素材里 <style>@font-face</style> 只活在它自己那份 SVG 里，不会进页面，
 * 所以导入时手动注册一遍；否则 font-family 里的别名（如 'Tsanger'）在画布上
 * 根本不存在，会掉到下一个族名——常常是同一套字里最细的那一档。
 */

export interface FontFaceSpec {
  family: string
  src: string
  weight: string
  style: string
}

const settled = new Map<string, Promise<void>>()
const pending = new Map<string, Promise<void>>()
const warned = new Set<string>()

const hasDocumentFonts = () =>
  typeof document !== 'undefined' && typeof FontFace !== 'undefined' && !!document.fonts

/** 从一段 CSS 里认 @font-face 声明 */
export function parseFontFaces(css: string): FontFaceSpec[] {
  const out: FontFaceSpec[] = []
  const re = /@font-face\s*\{([^}]*)\}/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(css))) {
    const decls: Record<string, string> = {}
    for (const chunk of match[1].split(';')) {
      const i = chunk.indexOf(':')
      if (i < 0) continue
      const key = chunk.slice(0, i).trim().toLowerCase()
      if (key) decls[key] = chunk.slice(i + 1).trim()
    }
    const family = (decls['font-family'] || '').replace(/^["']|["']$/g, '').trim()
    const src = decls['src']
    if (!family || !src) continue
    out.push({
      family,
      src,
      weight: decls['font-weight'] || 'normal',
      style: decls['font-style'] || 'normal',
    })
  }
  return out
}

/** 取 SVG 里所有 <style> 的 CSS 文本 */
export function extractSvgCss(svg: string): string {
  let css = ''
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(svg))) css += '\n' + match[1].replace(/<!\[CDATA\[|\]\]>/g, '')
  return css
}

/**
 * 只留页面里能直接解析的来源：local() 和 data: 内嵌。
 * 相对路径的 url() 在 Studio 里没有基准地址，注册了也加载不出来。
 */
function usableSrc(src: string): string {
  const parts = src.match(/local\([^)]*\)|url\([^)]*\)/gi) || []
  return parts.filter((part) => /^local\(/i.test(part) || /^url\(\s*["']?data:/i.test(part)).join(', ')
}

function registerFace(spec: FontFaceSpec): Promise<void> {
  const key = `${spec.family}|${spec.weight}|${spec.style}|${spec.src}`
  const cached = settled.get(key)
  if (cached) return cached

  const src = usableSrc(spec.src)
  if (!src) return Promise.resolve()

  let face: FontFace
  try {
    face = new FontFace(spec.family, src, { weight: spec.weight, style: spec.style })
  } catch {
    return Promise.resolve()
  }
  document.fonts.add(face)

  const task = face
    .load()
    .then(() => undefined)
    .catch(() => {
      document.fonts.delete(face)
      const note = `字体 ${spec.family}（${spec.weight}）没装上，已回退到下一个族名`
      if (!warned.has(note)) {
        warned.add(note)
        console.warn(`[mgsvg] ${note}`)
      }
    })
    .finally(() => {
      pending.delete(key)
      settled.set(key, task)
    })

  pending.set(key, task)
  return task
}

/** 解析素材时顺手排队注册；不阻塞解析，字体就绪后由画布重建一次 */
export function queueSvgFonts(svg: string): Promise<void> {
  if (!hasDocumentFonts()) return Promise.resolve()
  return Promise.all(parseFontFaces(extractSvgCss(svg)).map(registerFace)).then(() => undefined)
}

export function hasPendingFonts(): boolean {
  return pending.size > 0
}

/** 等当前所有字体注册结束；失败的也算结束，不抛错 */
export function fontsSettled(): Promise<void> {
  if (!pending.size) return Promise.resolve()
  return Promise.all([...pending.values()]).then(() => undefined)
}
