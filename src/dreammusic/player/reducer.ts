/**
 * Player 状态机（DM-04）—— 纯函数 reducer，无 DOM 依赖。
 *
 * 状态：queue / currentIndex(-1 空) / isPlaying / mode / level / currentTime / duration
 * 模式：order 顺序（末首停）/ single 单曲循环 / shuffle 随机
 */

import type { MediaIdentity } from '../api'

export interface Track extends MediaIdentity {
  id: number | string
  mediaRef?: string
  source?: string
  name: string
  artist: string
  album?: string
  picUrl?: string
  url?: string
  duration?: number
}

export function musicSourceLabel(source: string): string {
  switch (source) {
    case 'api-enhanced': return '网易云'
    case 'meting-tencent': return '腾讯 / QQ'
    case 'meting-kugou': return '酷狗'
    case 'meting-kuwo': return '酷我'
    case 'lrclib': return 'LRCLIB'
    default: return source
  }
}

export type Mode = 'order' | 'single' | 'shuffle'
export type Level = 'standard' | 'exhigh' | 'lossless' | 'hires'

export interface PlayerState {
  queue: Track[]
  /** -1 表示空队列 */
  currentIndex: number
  isPlaying: boolean
  mode: Mode
  level: Level
  currentTime: number
  duration: number
}

export const initialPlayerState: PlayerState = {
  queue: [],
  currentIndex: -1,
  isPlaying: false,
  mode: 'order',
  level: 'exhigh',
  currentTime: 0,
  duration: 0,
}

export type PlayerAction =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'TOGGLE' }
  | { type: 'NEXT' }
  | { type: 'PREV' }
  | { type: 'SEEK'; time: number }
  | { type: 'ADD_TO_QUEUE'; track: Track }
  | { type: 'PLAY_TRACK'; track: Track }
  | { type: 'REMOVE_FROM_QUEUE'; id: number | string }
  | { type: 'CLEAR_QUEUE' }
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'SET_LEVEL'; level: Level }
  | { type: 'SET_TIME'; time: number }
  | { type: 'SET_DURATION'; duration: number }
  | { type: 'SET_TRACK_URL'; id: number | string; url: string; identity?: MediaIdentity }
  | { type: 'REORDER_QUEUE'; from: number; to: number }

export function playerReducer(
  state: PlayerState,
  action: PlayerAction,
): PlayerState {
  const { queue, currentIndex, mode } = state

  switch (action.type) {
    case 'PLAY':
      return queue.length ? { ...state, isPlaying: true } : state

    case 'PAUSE':
      return { ...state, isPlaying: false }

    case 'TOGGLE':
      return queue.length ? { ...state, isPlaying: !state.isPlaying } : state

    case 'NEXT': {
      if (queue.length === 0) return state
      if (mode === 'single') {
        // 单曲循环：重放当前
        return { ...state, isPlaying: true, currentTime: 0 }
      }
      if (mode === 'shuffle') {
        if (queue.length === 1) return { ...state, isPlaying: true, currentTime: 0 }
        let next = currentIndex
        while (next === currentIndex) next = Math.floor(Math.random() * queue.length)
        return { ...state, currentIndex: next, isPlaying: true, currentTime: 0 }
      }
      // order 顺序：末首停
      if (currentIndex < queue.length - 1) {
        return { ...state, currentIndex: currentIndex + 1, isPlaying: true, currentTime: 0 }
      }
      return { ...state, isPlaying: false, currentTime: 0 }
    }

    case 'PREV': {
      if (queue.length === 0) return state
      return {
        ...state,
        currentIndex: Math.max(0, currentIndex - 1),
        isPlaying: true,
        currentTime: 0,
      }
    }

    case 'SEEK':
      return { ...state, currentTime: action.time }

    case 'ADD_TO_QUEUE': {
      const newQueue = [...queue, action.track]
      return {
        ...state,
        queue: newQueue,
        currentIndex: currentIndex < 0 ? 0 : currentIndex,
      }
    }

    case 'PLAY_TRACK': {
      const idx = queue.findIndex((t) => t.id === action.track.id)
      if (idx >= 0) {
        return { ...state, queue: queue.map((track, i) => i === idx ? { ...track, ...action.track } : track), currentIndex: idx, isPlaying: true, currentTime: 0 }
      }
      const newQueue = [...queue, action.track]
      return {
        ...state,
        queue: newQueue,
        currentIndex: newQueue.length - 1,
        isPlaying: true,
        currentTime: 0,
      }
    }

    case 'REMOVE_FROM_QUEUE': {
      const idx = queue.findIndex((t) => t.id === action.id)
      if (idx < 0) return state
      const newQueue = queue.filter((t) => t.id !== action.id)
      let newIndex = currentIndex
      if (idx < currentIndex) newIndex = currentIndex - 1
      else if (idx === currentIndex) newIndex = Math.min(currentIndex, newQueue.length - 1)
      if (newIndex < 0) newIndex = -1
      return {
        ...state,
        queue: newQueue,
        currentIndex: newIndex,
        isPlaying: newQueue.length === 0 ? false : state.isPlaying,
      }
    }

    case 'CLEAR_QUEUE':
      return { ...state, queue: [], currentIndex: -1, isPlaying: false, currentTime: 0 }

    case 'SET_MODE':
      return { ...state, mode: action.mode }

    case 'SET_LEVEL':
      return { ...state, level: action.level }

    case 'SET_TIME':
      return { ...state, currentTime: action.time }

    case 'SET_DURATION':
      return { ...state, duration: action.duration }

    case 'SET_TRACK_URL':
      return {
        ...state,
        queue: queue.map((t) => {
          if (t.id !== action.id || (t.catalogRef && action.identity?.catalogRef &&
            t.catalogRef !== action.identity.catalogRef)) return t
          return { ...t, ...action.identity, url: action.url }
        }),
      }

    case 'REORDER_QUEUE': {
      const from = Math.trunc(action.from)
      const to = Math.trunc(action.to)
      if (
        from < 0 ||
        from >= queue.length ||
        to < 0 ||
        to >= queue.length ||
        from === to
      ) {
        return state
      }
      const newQueue = [...queue]
      const [moved] = newQueue.splice(from, 1)
      newQueue.splice(to, 0, moved)

      // 当前播放曲目跟随移动，索引语义与最终数组一致
      let newIndex = currentIndex
      if (currentIndex === from) newIndex = to
      else if (from < currentIndex && to >= currentIndex) newIndex = currentIndex - 1
      else if (from > currentIndex && to <= currentIndex) newIndex = currentIndex + 1
      return { ...state, queue: newQueue, currentIndex: newIndex }
    }

    default:
      return state
  }
}

/** 当前曲（可能 undefined） */
export function currentTrack(state: PlayerState): Track | undefined {
  return state.currentIndex >= 0 ? state.queue[state.currentIndex] : undefined
}
