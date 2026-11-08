/**
 * 文案条只显示三行：先按可用宽度折行，超出后把最后一行收成省略号。
 * Leafer 的多行省略号会落在被裁掉的那一行上，所以这里先算好再交给它画。
 */
export function fitText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: (value: string) => number,
) {
  const rows: string[] = []
  let clipped = false
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n')

  const flush = (line: string) => {
    rows.push(line)
    return rows.length >= maxLines
  }

  for (let index = 0; index < paragraphs.length; index += 1) {
    let line = ''
    let exhausted = false
    for (const char of Array.from(paragraphs[index])) {
      if (measure(line + char) <= maxWidth || !line) {
        line += char
        continue
      }
      if (flush(line)) {
        clipped = true
        exhausted = true
        break
      }
      line = char
    }
    if (exhausted) break
    // 段落之间的换行是硬换行：最后一段之外，都要把当前行收掉
    if (index < paragraphs.length - 1) {
      if (flush(line)) {
        clipped = true
        break
      }
    } else if (line || rows.length === 0) {
      rows.push(line)
    }
  }

  if (!clipped) return { text: rows.join('\n'), clipped, lines: rows.length }

  let tail = rows[rows.length - 1] ?? ''
  while (tail && measure(tail + '…') > maxWidth) tail = Array.from(tail).slice(0, -1).join('')
  rows[rows.length - 1] = `${tail}…`
  return { text: rows.join('\n'), clipped, lines: rows.length }
}
