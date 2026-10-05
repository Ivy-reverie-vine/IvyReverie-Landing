import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  playerReducer,
  initialPlayerState,
  currentTrack,
  type PlayerState,
  type PlayerAction,
} from './reducer'
import { songUrlV1, mediaUrl, recoverMediaUrl, reportStats } from '../api'

import { fullAudioUrl } from '../audioIntegrity'

const STORAGE_PREFIX = 'dreammusic_player'

interface PlayerContextValue {
  state: PlayerState
  dispatch: React.Dispatch<PlayerAction>
  audioRef: React.RefObject<HTMLAudioElement>
  playbackError: string
}

const PlayerContext = createContext<PlayerContextValue | null>(null)

export function usePlayer(): PlayerContextValue {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer 必须在 PlayerProvider 内使用')
  return ctx
}

/**
 * 恢复持久化的播放状态（D4-Q8）：
 * 只恢复队列元数据 + 当前索引 + 音质 + 模式；不恢复 isPlaying/进度；
 * URL 一律丢弃（网易链接会过期），由 PlayerProvider 现有逻辑自动重取。
 */
function loadPersisted(storageKey?: string): PlayerState {
  const key = storageKey ? `${STORAGE_PREFIX}_${storageKey}` : STORAGE_PREFIX
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return initialPlayerState
    const p = JSON.parse(raw) as Partial<PlayerState>
    if (!Array.isArray(p.queue)) return initialPlayerState
    const queue = (p.queue as PlayerState['queue'])
      .map((t) => ({
        id: typeof t.id === 'string' && t.mediaRef ? t.id : Number(t.id),
        mediaRef: typeof t.mediaRef === 'string' ? t.mediaRef : undefined,
        source: typeof t.source === 'string' ? t.source : undefined,
        catalogRef: typeof t.catalogRef === 'string' ? t.catalogRef : undefined,
        playbackRef: typeof t.playbackRef === 'string' ? t.playbackRef : undefined,
        lyricsRef: typeof t.lyricsRef === 'string' ? t.lyricsRef : undefined,
        playbackSource: typeof t.playbackSource === 'string' ? t.playbackSource : undefined,
        lyricsSource: typeof t.lyricsSource === 'string' ? t.lyricsSource : undefined,
        name: String(t.name || ''),
        artist: String(t.artist || ''),
        album: t.album ? String(t.album) : undefined,
        picUrl: t.picUrl ? String(t.picUrl) : undefined,
      }))
      .filter((t) => (typeof t.id === 'string' ? Boolean(t.mediaRef) : Number.isFinite(t.id)) && t.name)
    const currentIndex =
      Number.isInteger(p.currentIndex) &&
      (p.currentIndex as number) >= -1 &&
      (p.currentIndex as number) < queue.length
        ? (p.currentIndex as number)
        : queue.length
          ? 0
          : -1
    return {
      queue,
      currentIndex,
      isPlaying: false,
      mode: p.mode === 'single' || p.mode === 'shuffle' ? p.mode : 'order',
      level:
        p.level === 'standard' || p.level === 'lossless' || p.level === 'hires'
          ? p.level
          : 'exhigh',
      currentTime: 0,
      duration: 0,
    }
  } catch {
    return initialPlayerState
  }
}

/**
 * PlayerProvider（DM-04）：Context + useReducer 管理状态，
 * 顶层挂单一 `<audio>`，事件驱动 state（timeupdate/duration/ended）。
 * storageKey：按 DreamMusic 用户名分 key 持久化（D4-Q8）。
 */
export function PlayerProvider({
  children,
  storageKey,
}: {
  children: ReactNode
  storageKey?: string
}) {
  const [state, dispatch] = useReducer(
    playerReducer,
    storageKey,
    loadPersisted,
  )
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playbackError, setPlaybackError] = useState('')
  // 切音质后续播位置（DM-07）
  const pendingSeekRef = useRef<number | null>(null)
  const prevLevelRef = useRef(state.level)

  // 持久化队列/索引/音质/模式（不含 isPlaying/进度）
  useEffect(() => {
    const key = storageKey ? `${STORAGE_PREFIX}_${storageKey}` : STORAGE_PREFIX
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          queue: state.queue.map(({ url: _url, recoveryToken: _token, ...metadata }) => metadata),
          currentIndex: state.currentIndex,
          mode: state.mode,
          level: state.level,
        }),
      )
    } catch {
      /* 存储不可用时静默 */
    }
  }, [state.queue, state.currentIndex, state.mode, state.level, storageKey])

  // 播放时长上报（D5-Q4）：播放中每 30s 一次，暂停/切歌补报剩余
  const reportRef = useRef<{ songId: number; startedAt: number }>({
    songId: 0,
    startedAt: 0,
  })
  useEffect(() => {
    const track = currentTrack(state)
    if (!state.isPlaying || !track) return undefined
    const songId = typeof track.id === 'number' ? track.id : 0
    reportRef.current = { songId, startedAt: Date.now() }
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - reportRef.current.startedAt) / 1000)
      if (elapsed >= 30) {
        reportStats(elapsed, reportRef.current.songId || undefined).catch(() => {})
        reportRef.current.startedAt = Date.now()
      }
    }, 10000)
    return () => {
      clearInterval(timer)
      const elapsed = Math.floor((Date.now() - reportRef.current.startedAt) / 1000)
      if (elapsed >= 10) {
        reportStats(elapsed, reportRef.current.songId || undefined).catch(() => {})
      }
    }
  }, [state.isPlaying, currentTrack(state)?.id])

  const track = currentTrack(state)
  const liveTrack = useRef(track)
  liveTrack.current = track
  const recovery = useRef<{ track: NonNullable<typeof track>; controller: AbortController; timer: ReturnType<typeof setTimeout>; deadline: number } | null>(null)
  const recoveryAttempts = useRef(0)
  const stopRecovery = () => {
    if (recovery.current) { clearTimeout(recovery.current.timer); recovery.current.controller.abort(); recovery.current = null }
  }
  useEffect(() => {
    recoveryAttempts.current = 0; setPlaybackError('')
    return () => { stopRecovery(); pendingSeekRef.current = null }
  }, [track?.id, state.currentIndex, track?.playbackRef, state.level])
  useEffect(() => { if (!state.isPlaying) stopRecovery(); else recoveryAttempts.current = 0 }, [state.isPlaying])
  const trackUrl = track?.url

  // 切曲 / url 更新 → 设 src；若有待续播位置，canplay 后 seek
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    let onCanPlay: (() => void) | undefined
    if (trackUrl && audio.dataset.src !== trackUrl) {
      audio.src = trackUrl
      audio.dataset.src = trackUrl
      audio.load()
      if (pendingSeekRef.current != null) {
        const seekTo = pendingSeekRef.current
        onCanPlay = () => {
          try {
            audio.currentTime = seekTo
          } catch {
            /* 忽略 */
          }
          pendingSeekRef.current = null
          if (onCanPlay) audio.removeEventListener('canplay', onCanPlay)
        }
        audio.addEventListener('canplay', onCanPlay)
      }
    } else if (!trackUrl && audio.dataset.src) {
      audio.removeAttribute('src')
      delete audio.dataset.src
    }
    return () => {
      if (onCanPlay) audio.removeEventListener('canplay', onCanPlay)
    }
  }, [trackUrl, track])

  // 播放/暂停同步（切曲时若 isPlaying 则播）
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (state.isPlaying && trackUrl) {
      Promise.resolve(audio.play()).catch(() => {
        if (recovery.current || liveTrack.current !== track) return
        setPlaybackError('音频未能播放，请点击播放按钮重试或换一首歌')
        dispatch({ type: 'PAUSE' })
      })
    } else if (!state.isPlaying) {
      audio.pause()
    }
  }, [state.isPlaying, state.currentIndex, trackUrl, track])

  // 当前曲缺 URL 时只解析选定资源，并要求可靠完整版。
  useEffect(() => {
    if (!track || track.url) return
    let cancelled = false
    ;(async () => {
      try {
        const r = track.mediaRef ? await mediaUrl(track.playbackRef || track.mediaRef, state.level) : await songUrlV1(track.id, state.level)
        const url = fullAudioUrl(r)
        if (!cancelled && url) {
          dispatch({ type: 'SET_TRACK_URL', id: track.id, url, identity: track.mediaRef ? {
            recoveryToken: r.recoveryToken,
            catalogRef: r.catalogRef || track.catalogRef || track.mediaRef,
            playbackRef: r.playbackRef || track.playbackRef || track.mediaRef,
            lyricsRef: r.lyricsRef || track.lyricsRef || track.mediaRef,
            playbackSource: r.playbackSource || track.source,
            lyricsSource: r.lyricsSource || track.source,
          } : undefined })
        } else if (!cancelled) {
          setPlaybackError('当前音源没有可用播放链接，请换一首歌或切换音源')
          dispatch({ type: 'PAUSE' })
        }
      } catch (error) {
        if (!cancelled) {
          setPlaybackError(error instanceof Error ? error.message : '获取播放链接失败')
          dispatch({ type: 'PAUSE' })
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [track?.id, track?.url, state.level])

  // 切音质续播（DM-07）：level 变更时用新音质重取链接，canplay 后续播原位置
  useEffect(() => {
    if (prevLevelRef.current === state.level) return
    prevLevelRef.current = state.level
    const t = state.queue[state.currentIndex]
    if (!t) return
    const pos = state.currentTime
    let cancelled = false
    ;(async () => {
      try {
        const r = t.mediaRef ? await mediaUrl(t.playbackRef || t.mediaRef, state.level) : await songUrlV1(t.id, state.level)
        const url = fullAudioUrl(r)
        if (!cancelled && url && url !== t.url) {
          pendingSeekRef.current = pos
          dispatch({ type: 'SET_TRACK_URL', id: t.id, url, identity: t.mediaRef ? {
            recoveryToken: r.recoveryToken,
            catalogRef: r.catalogRef || t.catalogRef || t.mediaRef,
            playbackRef: r.playbackRef || t.playbackRef || t.mediaRef,
            lyricsRef: r.lyricsRef || t.lyricsRef || t.mediaRef,
            playbackSource: r.playbackSource || t.source,
            lyricsSource: r.lyricsSource || t.source,
          } : undefined })
        }
      } catch {
        /* 重取失败，保持原 url */
      }
    })()
    return () => {
      cancelled = true
    }
    // 仅依赖 level（避免循环；读取当前 state 快照）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.level])

  const value = useMemo<PlayerContextValue>(
    () => ({ state, dispatch, audioRef, playbackError }),
    [state, playbackError],
  )

  return (
    <PlayerContext.Provider value={value}>
      {children}
      <audio
        ref={audioRef}
        onPlaying={() => { stopRecovery(); setPlaybackError('') }}
        onError={async () => {
          const failed = liveTrack.current
          if (!failed?.url) return
          if (recovery.current?.track === failed) return
          if (failed.mediaRef && failed.recoveryToken && recoveryAttempts.current < 2) {
            const deadline = recovery.current?.deadline ?? Date.now() + 15000
            stopRecovery()
            recoveryAttempts.current++
            const controller = new AbortController()
            const timer = setTimeout(() => {
              if (recovery.current?.controller !== controller) return
              stopRecovery()
              setPlaybackError('所选资源恢复超时，请点击播放重试或重新选择来源')
              dispatch({ type: 'PAUSE' })
            }, Math.max(1, deadline - Date.now()))
            recovery.current = { track: failed, controller, timer, deadline }
            const position = audioRef.current?.currentTime || state.currentTime
            try {
              const result = await recoverMediaUrl(failed.playbackRef || failed.mediaRef, failed.recoveryToken, controller.signal)
              if (controller.signal.aborted || liveTrack.current !== failed) return
              const refreshed = fullAudioUrl(result)
              if (refreshed && result.playbackRef === (failed.playbackRef || failed.mediaRef) &&
                result.catalogRef === (failed.catalogRef || failed.mediaRef) &&
                result.lyricsRef === (failed.lyricsRef ?? failed.mediaRef)) {
                pendingSeekRef.current = position
                // Reload even if a provider legitimately refreshed content at the same URL.
                delete audioRef.current?.dataset.src
                dispatch({ type: 'SET_TRACK_URL', id: failed.id, url: refreshed, identity: {
                  recoveryToken: result.recoveryToken,
                  playbackRevision: (failed.playbackRevision || 0) + 1,
                  catalogRef: failed.catalogRef || failed.mediaRef,
                  playbackRef: result.playbackRef,
                  lyricsRef: failed.lyricsRef ?? failed.mediaRef,
                  playbackSource: result.playbackSource,
                  lyricsSource: failed.lyricsSource,
                } })
                return
              }
            } catch { /* Terminal state remains bound to this resource and selection. */ }
            if (controller.signal.aborted || liveTrack.current !== failed) return
            stopRecovery()
          }
          if (liveTrack.current !== failed) return
          setPlaybackError('所选资源恢复失败，请重试或重新选择来源')
          dispatch({ type: 'PAUSE' })
        }}
        onTimeUpdate={(e) =>
          dispatch({ type: 'SET_TIME', time: e.currentTarget.currentTime })
        }
        onLoadedMetadata={(e) =>
          dispatch({ type: 'SET_DURATION', duration: e.currentTarget.duration })
        }
        onEnded={() => dispatch({ type: 'NEXT' })}
        aria-hidden="true"
      />
    </PlayerContext.Provider>
  )
}
