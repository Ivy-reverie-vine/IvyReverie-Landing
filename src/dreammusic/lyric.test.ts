import { describe, it, expect } from 'vitest'
import { parseLyric, findActiveIndex, findActiveChar } from './lyric'

const LRC = `[00:01.00]第一行
[00:03.50]第二行
[00:06.00]第三行`

const YRC = `[1000,2000](1000,500,0)我(1500,500,0)爱
[3000,2000](3000,500,0)你(3500,500,0)中
[6000,2000](6000,500,0)国`

describe('lyric — DM-06', () => {
  it('parses lrc into timed lines', () => {
    const { lines, hasYrc } = parseLyric(LRC)
    expect(hasYrc).toBe(false)
    expect(lines.length).toBe(3)
    expect(lines[0].time).toBe(1000)
    expect(lines[0].text).toBe('第一行')
    expect(lines[2].time).toBe(6000)
    expect(lines[2].text).toBe('第三行')
  })

  it('parses yrc with per-char timing', () => {
    const { lines, hasYrc } = parseLyric(undefined, YRC)
    expect(hasYrc).toBe(true)
    expect(lines.length).toBe(3)
    expect(lines[0].chars).toBeDefined()
    expect(lines[0].chars!.length).toBe(2)
    expect(lines[0].chars![0].time).toBe(1000)
    expect(lines[0].chars![0].text).toBe('我')
    expect(lines[0].text).toBe('我爱')
  })

  it('prefers yrc over lrc when both present', () => {
    const { hasYrc, lines } = parseLyric(LRC, YRC)
    expect(hasYrc).toBe(true)
    expect(lines[0].chars).toBeDefined()
  })

  it('falls back to lrc when yrc empty', () => {
    const { hasYrc } = parseLyric(LRC, '')
    expect(hasYrc).toBe(false)
  })

  it('returns empty when both empty', () => {
    const r = parseLyric('', '')
    expect(r.lines).toEqual([])
    expect(r.hasYrc).toBe(false)
  })

  it('findActiveIndex returns current line by time', () => {
    const { lines } = parseLyric(LRC)
    expect(findActiveIndex(lines, 0)).toBe(-1)
    expect(findActiveIndex(lines, 1000)).toBe(0)
    expect(findActiveIndex(lines, 4000)).toBe(1)
    expect(findActiveIndex(lines, 99999)).toBe(2)
  })

  it('findActiveChar returns current char index', () => {
    const { lines } = parseLyric(undefined, YRC)
    const line = lines[0]
    expect(findActiveChar(line, 999)).toBe(-1)
    expect(findActiveChar(line, 1000)).toBe(0)
    expect(findActiveChar(line, 1600)).toBe(1)
  })
})
