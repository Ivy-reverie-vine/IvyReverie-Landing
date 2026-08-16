import { useEffect, useRef, useState } from 'react'
import { search, songUrlV1, songUrlMatch, NcmError } from './api'
import { usePlayer } from './player/PlayerContext'
import type { Track } from './player/reducer'
import Icon from '../components/Icon'
import './SearchOverlay.css'

/** 搜索结果 song（兼容 artists/ar、album/al 两种字段） */
interface SearchSong {
  id: number
  name: string
  artists?: { name: string }[]
  ar?: { name: string }[]
  album?: { name: string; picUrl?: string }
  al?: { name: string; picUrl?: string }
}

function toTrack(s: SearchSong): Track {
  const artists = s.artists || s.ar || []
  const album = s.album || s.al
  return {
    id: s.id,
    name: s.name,
    artist: artists.map((a) => a.name).join(' / ') || '未知',
    album: album?.name,
    picUrl: album?.picUrl,
  }
}

/**
 * 搜索浮层（DM-05）：输入防抖 400ms → search → 结果列表。
 * 点歌：取 songUrlV1，空则解灰 songUrlMatch(qq)，拿到 url 后 PLAY_TRACK。
 */
export default function SearchOverlay({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePlayer()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchSong[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 自动聚焦
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // 防抖搜索 400ms
  useEffect(() => {
    const kw = query.trim()
    if (!kw) {
      setResults([])
      setError('')
      return
    }
    setLoading(true)
    setError('')
    const t = setTimeout(async () => {
      try {
        const r = await search(kw)
        setResults((r.result?.songs as SearchSong[]) || [])
      } catch (e) {
        setError(e instanceof NcmError ? e.message : '搜索失败')
        setResults([])
      } finally {
        setLoading(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [query])

  // 取播放链接（含解灰兜底）
  async function resolveUrl(id: number): Promise<string> {
    const r = await songUrlV1(id, state.level)
    let url = r.data?.[0]?.url || ''
    if (!url) {
      const m = await songUrlMatch(id, 'qq')
      url = m.data?.[0]?.url || ''
    }
    return url
  }

  async function playSong(s: SearchSong) {
    setPendingId(s.id)
    setError('')
    try {
      const url = await resolveUrl(s.id)
      if (!url) {
        setError('无版权，已跳过')
        // 若有在播曲目，跳下一首，不卡住
        if (state.currentIndex >= 0) dispatch({ type: 'NEXT' })
        return
      }
      dispatch({ type: 'PLAY_TRACK', track: { ...toTrack(s), url } })
      onClose()
    } catch (e) {
      setError(e instanceof NcmError ? e.message : '获取播放链接失败')
    } finally {
      setPendingId(null)
    }
  }

  async function enqueue(s: SearchSong) {
    setPendingId(s.id)
    setError('')
    try {
      const url = await resolveUrl(s.id)
      if (!url) {
        setError('无版权，无法加入')
        return
      }
      dispatch({ type: 'ADD_TO_QUEUE', track: { ...toTrack(s), url } })
    } catch (e) {
      setError(e instanceof NcmError ? e.message : '获取播放链接失败')
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div
      className="dm-overlay"
      data-testid="dm-search-overlay"
      role="dialog"
      aria-label="搜索"
    >
      <div className="dm-overlay-backdrop" onClick={onClose} />
      <div className="dm-search-panel">
        <div className="dm-search-head">
          <input
            ref={inputRef}
            className="dm-search-input"
            placeholder="搜索歌曲 / 歌手"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="搜索关键词"
          />
          <button
            type="button"
            className="dm-icon-btn"
            onClick={onClose}
            aria-label="关闭搜索"
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {loading && <p className="dm-search-hint">搜索中…</p>}
        {error && (
          <p className="dm-search-hint" role="alert">
            {error}
          </p>
        )}
        {!loading && !error && results.length === 0 && query.trim() && (
          <p className="dm-search-hint">无结果</p>
        )}

        <ul className="dm-search-list">
          {results.map((s) => (
            <li key={s.id} className="dm-search-item">
              {(s.album || s.al)?.picUrl ? (
                <img
                  className="dm-search-thumb"
                  src={`${(s.album || s.al)?.picUrl}?param=100y100`}
                  alt=""
                />
              ) : (
                <span className="dm-search-thumb-ph">
                  <Icon name="music" size={16} />
                </span>
              )}
              <button
                type="button"
                className="dm-search-main"
                onClick={() => playSong(s)}
                disabled={pendingId === s.id}
              >
                <span className="dm-search-name">{s.name}</span>
                <span className="dm-search-sub">
                  {(s.artists || s.ar || [])
                    .map((a) => a.name)
                    .join(' / ')}
                </span>
              </button>
              <button
                type="button"
                className="dm-search-add"
                onClick={() => enqueue(s)}
                disabled={pendingId === s.id}
                aria-label="加入队列"
                title="加入队列"
              >
                <Icon name="plus" size={15} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
