import { describe, it, expect } from 'vitest'
import {
  playerReducer,
  initialPlayerState,
  type Track,
} from './reducer'

const t = (id: number): Track => ({
  id,
  name: `song${id}`,
  artist: `artist${id}`,
  url: `https://example.com/${id}.mp3`,
})

function withQueue(tracks: Track[]) {
  return { ...initialPlayerState, queue: tracks, currentIndex: tracks.length ? 0 : -1 }
}

describe('playerReducer — DM-04', () => {
  it('initial state is empty & paused', () => {
    expect(initialPlayerState.queue).toEqual([])
    expect(initialPlayerState.currentIndex).toBe(-1)
    expect(initialPlayerState.isPlaying).toBe(false)
    expect(initialPlayerState.mode).toBe('order')
    expect(initialPlayerState.level).toBe('exhigh')
  })

  it('PLAY/PAUSE/TOGGLE no-op on empty queue', () => {
    expect(playerReducer(initialPlayerState, { type: 'PLAY' })).toBe(initialPlayerState)
    expect(playerReducer(initialPlayerState, { type: 'TOGGLE' })).toBe(initialPlayerState)
  })

  it('PLAY/PAUSE/TOGGLE toggle isPlaying when queue non-empty', () => {
    const s = withQueue([t(1)])
    expect(playerReducer(s, { type: 'PLAY' }).isPlaying).toBe(true)
    const playing = { ...s, isPlaying: true }
    expect(playerReducer(playing, { type: 'PAUSE' }).isPlaying).toBe(false)
    expect(playerReducer(playing, { type: 'TOGGLE' }).isPlaying).toBe(false)
  })

  it('ADD_TO_QUEUE sets currentIndex 0 when empty', () => {
    const s = playerReducer(initialPlayerState, { type: 'ADD_TO_QUEUE', track: t(1) })
    expect(s.queue.length).toBe(1)
    expect(s.currentIndex).toBe(0)
    expect(s.isPlaying).toBe(false)
  })

  it('PLAY_TRACK appends new track and plays; switches if exists', () => {
    const s0 = playerReducer(initialPlayerState, { type: 'PLAY_TRACK', track: t(1) })
    expect(s0.queue.length).toBe(1)
    expect(s0.currentIndex).toBe(0)
    expect(s0.isPlaying).toBe(true)
    // 已存在 → 切过去
    const s1 = playerReducer(s0, { type: 'PLAY_TRACK', track: t(1) })
    expect(s1.queue.length).toBe(1)
    expect(s1.currentIndex).toBe(0)
  })

  it('NEXT order: mid advances, last stops', () => {
    const s = withQueue([t(1), t(2), t(3)])
    const s2 = playerReducer(s, { type: 'NEXT' })
    expect(s2.currentIndex).toBe(1)
    expect(s2.isPlaying).toBe(true)
    // 跳到末首
    const last = { ...s, currentIndex: 2, isPlaying: true }
    const stopped = playerReducer(last, { type: 'NEXT' })
    expect(stopped.currentIndex).toBe(2)
    expect(stopped.isPlaying).toBe(false)
  })

  it('NEXT single: loops same track', () => {
    const s = { ...withQueue([t(1), t(2)]), currentIndex: 0, mode: 'single' as const, isPlaying: true }
    const r = playerReducer(s, { type: 'NEXT' })
    expect(r.currentIndex).toBe(0)
    expect(r.isPlaying).toBe(true)
    expect(r.currentTime).toBe(0)
  })

  it('NEXT shuffle: picks a different index (len>1)', () => {
    const s = { ...withQueue([t(1), t(2), t(3), t(4)]), currentIndex: 0, mode: 'shuffle' as const }
    let got: number[] = []
    for (let i = 0; i < 8; i++) {
      const r = playerReducer(s, { type: 'NEXT' })
      got.push(r.currentIndex)
      expect(r.currentIndex).not.toBe(0)
      expect(r.isPlaying).toBe(true)
    }
    // 至少出现不止一个不同索引（证明随机）
    expect(new Set(got).size).toBeGreaterThan(1)
  })

  it('PREV clamps to 0', () => {
    const s = { ...withQueue([t(1), t(2)]), currentIndex: 1 }
    const r = playerReducer(s, { type: 'PREV' })
    expect(r.currentIndex).toBe(0)
    const r2 = playerReducer(r, { type: 'PREV' })
    expect(r2.currentIndex).toBe(0)
  })

  it('empty queue NEXT/PREV no crash', () => {
    expect(playerReducer(initialPlayerState, { type: 'NEXT' })).toBe(initialPlayerState)
    expect(playerReducer(initialPlayerState, { type: 'PREV' })).toBe(initialPlayerState)
  })

  it('REMOVE_FROM_QUEUE adjusts currentIndex', () => {
    const s = { ...withQueue([t(1), t(2), t(3)]), currentIndex: 2 }
    // 删当前曲 → 收敛到末尾
    const r = playerReducer(s, { type: 'REMOVE_FROM_QUEUE', id: 3 })
    expect(r.queue.length).toBe(2)
    expect(r.currentIndex).toBe(1)
    // 删前面的曲 → currentIndex 前移
    const r2 = playerReducer(r, { type: 'REMOVE_FROM_QUEUE', id: 1 })
    expect(r2.currentIndex).toBe(0)
  })

  it('CLEAR_QUEUE empties & pauses', () => {
    const s = { ...withQueue([t(1)]), isPlaying: true }
    const r = playerReducer(s, { type: 'CLEAR_QUEUE' })
    expect(r.queue).toEqual([])
    expect(r.currentIndex).toBe(-1)
    expect(r.isPlaying).toBe(false)
  })

  it('SET_MODE / SET_LEVEL / SEEK / SET_TIME / SET_DURATION', () => {
    const s = withQueue([t(1)])
    expect(playerReducer(s, { type: 'SET_MODE', mode: 'shuffle' }).mode).toBe('shuffle')
    expect(playerReducer(s, { type: 'SET_LEVEL', level: 'lossless' }).level).toBe('lossless')
    expect(playerReducer(s, { type: 'SEEK', time: 12.5 }).currentTime).toBe(12.5)
    expect(playerReducer(s, { type: 'SET_TIME', time: 3 }).currentTime).toBe(3)
    expect(playerReducer(s, { type: 'SET_DURATION', duration: 180 }).duration).toBe(180)
  })

  it('SET_TRACK_URL updates url on the matching track', () => {
    const s = withQueue([t(1)])
    const r = playerReducer(s, { type: 'SET_TRACK_URL', id: 1, url: 'https://x/1.mp3' })
    expect(r.queue[0].url).toBe('https://x/1.mp3')
  })

  it('REORDER_QUEUE moves a track and keeps currentIndex in sync', () => {
    const s = { ...withQueue([t(1), t(2), t(3)]), currentIndex: 1 }
    // 把 3 移到最前：queue [3,1,2]，当前曲 2 从 index1 → index2
    const r = playerReducer(s, { type: 'REORDER_QUEUE', from: 2, to: 0 })
    expect(r.queue.map((x) => x.id)).toEqual([3, 1, 2])
    expect(r.currentIndex).toBe(2)
    // 把当前曲 2 从 index2 移到 0：currentIndex 跟随为 0
    const r2 = playerReducer(r, { type: 'REORDER_QUEUE', from: 2, to: 0 })
    expect(r2.queue.map((x) => x.id)).toEqual([2, 3, 1])
    expect(r2.currentIndex).toBe(0)
  })

  it('REORDER_QUEUE ignores invalid indices', () => {
    const s = withQueue([t(1), t(2)])
    expect(playerReducer(s, { type: 'REORDER_QUEUE', from: -1, to: 0 })).toBe(s)
    expect(playerReducer(s, { type: 'REORDER_QUEUE', from: 0, to: 2 })).toBe(s)
    expect(playerReducer(s, { type: 'REORDER_QUEUE', from: 0, to: 0 })).toBe(s)
  })
})
