/** 原生素材识别：只认 Lottie 的 Bodymovin JSON，和自带 gsap 脚本的 SVG */

export function looksLikeLottie(text: string): boolean {
  const head = text.trim()
  if (!head.startsWith('{')) return false
  try {
    const doc = JSON.parse(head) as Record<string, unknown>
    return Array.isArray(doc.layers) && (typeof doc.w === 'number' || typeof doc.h === 'number')
  } catch {
    return false
  }
}

export function looksLikeGsapSvg(text: string): boolean {
  return /<script[\s>]/i.test(text) && /\bgsap\b/i.test(text) && /<\/svg>/i.test(text)
}
