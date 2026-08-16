/**
 * 歌词解析（DM-06）—— 纯函数，无 DOM。
 * yrc 逐字（卡拉OK式）优先，退 lrc 逐行。
 *
 * yrc 行格式：[lineStart,lineDur](charTime,charDur,0)字 (charTime,charDur,0)字 ...
 * lrc 行格式：[mm:ss.xx]歌词  (一行可有多个时间戳)
 */

export interface LyricChar {
  time: number // 毫秒
  text: string
}
export interface LyricLine {
  time: number // 毫秒
  text: string
  /** 仅 yrc 有 */
  chars?: LyricChar[]
}
export interface Lyrics {
  lines: LyricLine[]
  hasYrc: boolean
}

export const EMPTY_LYRICS: Lyrics = { lines: [], hasYrc: false }

/** 解析单行 yrc */
function parseYrcLine(raw: string): LyricLine | null {
  const m = raw.match(/^\[(\d+),\d+\](.*)$/)
  if (!m) return null
  const lineTime = parseInt(m[1], 10)
  const content = m[2] || ''
  const chars: LyricChar[] = []
  const segRe = /\((\d+),\d+,\d+\)([^\(\)]*)/g
  let sm: RegExpExecArray | null
  while ((sm = segRe.exec(content))) {
    const t = parseInt(sm[1], 10)
    const text = sm[2] || ''
    if (text) chars.push({ time: t, text })
  }
  const text = chars.map((c) => c.text).join('')
  return { time: lineTime, text, chars }
}

/** 解析单行 lrc（可能多个时间戳共享同一文本） */
function parseLrcLine(raw: string): LyricLine[] | null {
  const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g
  const times: number[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(raw))) {
    times.push(parseInt(m[1], 10) * 60 * 1000 + Math.round(parseFloat(m[2]) * 1000))
  }
  if (!times.length) return null
  const text = raw.replace(re, '').trim()
  return times.map((t) => ({ time: t, text }))
}

export function parseLyric(lrc?: string, yrc?: string): Lyrics {
  if (yrc && yrc.trim()) {
    const lines: LyricLine[] = []
    for (const raw of yrc.split('\n')) {
      const l = parseYrcLine(raw)
      if (l) lines.push(l)
    }
    if (lines.length) {
      lines.sort((a, b) => a.time - b.time)
      return { lines, hasYrc: true }
    }
  }
  if (lrc && lrc.trim()) {
    const lines: LyricLine[] = []
    for (const raw of lrc.split('\n')) {
      const ls = parseLrcLine(raw)
      if (ls) lines.push(...ls)
    }
    if (lines.length) {
      lines.sort((a, b) => a.time - b.time)
      return { lines, hasYrc: false }
    }
  }
  return EMPTY_LYRICS
}

/** 给定当前时间(ms)，返回当前行索引（-1 表示未到第一行） */
export function findActiveIndex(lines: LyricLine[], timeMs: number): number {
  if (!lines.length) return -1
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].time <= timeMs) idx = i
    else break
  }
  return idx
}

/** 给定当前行，返回当前字索引（仅 yrc 行有 chars） */
export function findActiveChar(line: LyricLine | undefined, timeMs: number): number {
  if (!line || !line.chars) return -1
  let idx = -1
  for (let i = 0; i < line.chars.length; i++) {
    if (line.chars[i].time <= timeMs) idx = i
    else break
  }
  return idx
}
