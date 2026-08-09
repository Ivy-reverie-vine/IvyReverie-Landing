/**
 * 基于 ivy-move-font/glyphData.json 的逐笔书写布局（Issue 02 增强版）。
 *
 * glyphData 按字符做 key，每个字形：
 *   { w: 推进宽度, t: 总时间, s: [{ p: [[x,y,宽],...], d: 笔画起始时间, a: 笔画绘制时长 }] }
 * 坐标系：font 单位（unitsPerEm=1000），y 负方向为上。
 *
 * 把文本排成一行，每笔生成 SVG path + 动画时序，整体压缩到 targetDuration 秒。
 */
import glyphData from '../../ivy-move-font/glyphData.json'

export type Pt = [number, number, number]
export interface StrokeData {
  p: Pt[]
  d: number
  a: number
  r?: number
}
export interface GlyphData {
  w: number
  t: number
  s: StrokeData[]
}
type GlyphMap = Record<string, GlyphData>

const DATA = glyphData as unknown as GlyphMap

export interface RenderStroke {
  /** SVG path "M x y L x y ..."（已平移到全局 + y 翻正） */
  path: string
  /** 笔画平均宽度（font 单位） */
  width: number
  /** 动画起始延迟（秒） */
  delay: number
  /** 动画绘制时长（秒） */
  dur: number
}

export interface HandwrittenLayout {
  strokes: RenderStroke[]
  width: number
  height: number
  totalTime: number
}

/**
 * 把文本布局成逐笔书写的笔画集合。
 * @param text 待渲染文本
 * @param targetDuration 目标总时长（秒）
 */
export function layoutHandwritten(
  text: string,
  targetDuration = 3,
): HandwrittenLayout {
  // 第一遍：求总时长、总宽、y 范围
  let totalT = 0
  let totalW = 0
  let minY = Infinity
  let maxY = -Infinity
  for (const ch of text) {
    const g = DATA[ch]
    if (!g) {
      totalW += 500
      continue
    }
    totalT += g.t
    totalW += g.w
    for (const st of g.s) {
      for (const pt of st.p) {
        if (pt[1] < minY) minY = pt[1]
        if (pt[1] > maxY) maxY = pt[1]
      }
    }
  }
  if (totalT <= 0) totalT = 1
  const scale = targetDuration / totalT
  const height = maxY - minY > 0 ? maxY - minY : 1000

  // 第二遍：生成 path（x 累加偏移，y 平移使顶部为 0）
  let xOffset = 0
  let cumTime = 0
  const strokes: RenderStroke[] = []
  for (const ch of text) {
    const g = DATA[ch]
    if (!g) {
      xOffset += 500
      cumTime += 0.3
      continue
    }
    for (const st of g.s) {
      let path = ''
      let sumW = 0
      st.p.forEach((pt, i) => {
        const x = pt[0] + xOffset
        const y = pt[1] - minY // 平移：顶部→0
        path += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)} `
        sumW += pt[2]
      })
      const avgW = st.p.length ? sumW / st.p.length : 30
      strokes.push({
        path: path.trim(),
        width: avgW,
        delay: (cumTime + st.d) * scale,
        dur: Math.max(st.a, 0.05) * scale,
      })
    }
    xOffset += g.w
    cumTime += g.t
  }

  return {
    strokes,
    width: totalW,
    height,
    totalTime: totalT * scale,
  }
}
