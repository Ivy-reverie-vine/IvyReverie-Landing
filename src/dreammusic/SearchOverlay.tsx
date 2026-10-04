import { useEffect, useRef, useState } from 'react'
import { mediaSearch, mediaUrl, NcmError, type MediaSong } from './api'
import { usePlayer } from './player/PlayerContext'
import type { Track } from './player/reducer'
import Icon from '../components/Icon'
import './SearchOverlay.css'

const SOURCES = [
  ['', '自动选择'], ['api-enhanced', '网易云'], ['meting-tencent', '腾讯 / QQ'],
  ['meting-kugou', '酷狗'], ['meting-kuwo', '酷我'], ['audius', 'Audius'],
]
function toTrack(song: MediaSong): Track {
  const legacyId = song.source === 'api-enhanced' ? Number(song.legacyId || song.sourceId) : 0
  return {
    id: legacyId > 0 ? legacyId : song.mediaRef,
    mediaRef: song.mediaRef, source: song.source,
    catalogRef: song.catalogRef || song.mediaRef,
    playbackRef: song.playbackRef || song.mediaRef,
    lyricsRef: song.lyricsRef || song.mediaRef,
    name: song.title, artist: song.artists.join(' / ') || '未知',
    album: song.album?.name, picUrl: song.album?.pictureUrl,
    duration: (song.durationMs || 0) / 1000,
  }
}

export default function SearchOverlay({ onClose }: { onClose: () => void }) {
  const { state, dispatch } = usePlayer()
  const [query, setQuery] = useState('')
  const [source, setSource] = useState('')
  const [results, setResults] = useState<MediaSong[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    inputRef.current?.focus()
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    let cancelled = false
    const keyword = query.trim()
    setResults([])
    setError('')
    setLoading(Boolean(keyword))
    if (!keyword) return
    const timer = setTimeout(async () => {
      try {
        const response = await mediaSearch(keyword, source)
        if (!cancelled) setResults(response.data || [])
      } catch (error) {
        if (!cancelled) setError(error instanceof NcmError ? error.message : '搜索失败，请稍后重试')
      } finally { if (!cancelled) setLoading(false) }
    }, 400)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, source])
  async function selectSong(song: MediaSong, enqueue: boolean) {
    setPendingId(song.mediaRef)
    setError('')
    try {
      const response = await mediaUrl(song.playbackRef || song.mediaRef, state.level)
      if (!mounted.current) return
      const url = response.data?.[0]?.url
      if (!url) {
        setError('当前音源没有可用播放链接，可能需要会员或内容授权；请换一首歌或切换音源')
        return
      }
      if (response.catalogRef && response.catalogRef !== (song.catalogRef || song.mediaRef)) {
        setError('播放响应与所选歌曲不一致，请重新选择')
        return
      }
      dispatch({ type: enqueue ? 'ADD_TO_QUEUE' : 'PLAY_TRACK', track: {
        ...toTrack(song), url,
        playbackRef: response.playbackRef || song.playbackRef || song.mediaRef,
        lyricsRef: response.lyricsRef || song.lyricsRef || song.mediaRef,
        playbackSource: response.playbackSource || song.source,
        lyricsSource: response.lyricsSource || song.source,
      } })
      if (!enqueue) onClose()
    } catch (error) {
      if (mounted.current) setError(error instanceof NcmError ? error.message : '获取播放链接失败')
    } finally { if (mounted.current) setPendingId(null) }
  }
  return (
    <div className="dm-overlay" data-testid="dm-search-overlay" role="dialog" aria-label="搜索" aria-modal="true">
      <div className="dm-overlay-backdrop" onClick={onClose} />
      <div className="dm-search-panel" onKeyDown={event => { if (event.key === 'Escape') onClose() }}>
        <div className="dm-search-head">
          <input ref={inputRef} className="dm-search-input" placeholder="搜索歌曲 / 歌手" value={query}
            onChange={event => setQuery(event.target.value)} aria-label="搜索关键词" />
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="关闭搜索"><Icon name="close" size={16} /></button>
        </div>
        <label className="dm-search-source">音源
          <select value={source} onChange={event => setSource(event.target.value)} disabled={pendingId !== null}>
            {SOURCES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        {loading && <p className="dm-search-hint" role="status">搜索中…</p>}
        {error && <p className="dm-search-hint" role="alert">{error}</p>}
        {!loading && !error && results.length === 0 && query.trim() && <p className="dm-search-hint">无结果</p>}
        <ul className="dm-search-list">
          {results.map(song => <li key={song.mediaRef} className="dm-search-item">
            {song.album?.pictureUrl ? <img className="dm-search-thumb" src={song.album.pictureUrl} alt="" />
              : <span className="dm-search-thumb-ph"><Icon name="music" size={16} /></span>}
            <button type="button" className="dm-search-main" onClick={() => selectSong(song, false)} disabled={pendingId !== null}>
              <span className="dm-search-name">{song.title}</span>
              <span className="dm-search-sub">{song.artists.join(' / ')} · {SOURCES.find(([id]) => id === song.source)?.[1] || song.source}</span>
            </button>
            <button type="button" className="dm-search-add" onClick={() => selectSong(song, true)} disabled={pendingId !== null} aria-label="加入队列" title="加入队列"><Icon name="plus" size={15} /></button>
          </li>)}
        </ul>
      </div>
    </div>
  )
}
