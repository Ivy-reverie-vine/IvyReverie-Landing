import { useEffect, useState } from 'react'
import { playlistTrackAll, NcmError, type Song } from './api'
import { usePlayer } from './player/PlayerContext'
import type { Track } from './player/reducer'
import Icon from '../components/Icon'
import './PlaylistView.css'

function toTrack(s: Song): Track {
  const ar = (s as unknown as { ar?: { name: string }[]; artists?: { name: string }[] })
  const artists = ar.ar || ar.artists || []
  const al = (s as unknown as { al?: { name: string; picUrl?: string }; album?: { name: string; picUrl?: string } })
  const album = al.al || al.album
  return {
    id: s.id,
    name: s.name,
    artist: artists.map((a) => a.name).join(' / ') || '未知',
    album: album?.name,
    picUrl: album?.picUrl,
  }
}

/** 歌单详情（DM-06）：全部歌曲 → 播放全部 / 加入队列 / 点单首 */
export default function PlaylistDetail({
  id,
  onBack,
}: {
  id: number
  onBack: () => void
}) {
  const { dispatch } = usePlayer()
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    playlistTrackAll(id)
      .then((r) => {
        if (cancelled) return
        setSongs(r.songs || [])
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof NcmError ? e.message : '加载歌单失败')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [id])

  const playAll = () => {
    if (!songs.length) return
    const tracks = songs.map(toTrack)
    dispatch({ type: 'CLEAR_QUEUE' })
    for (const t of tracks) dispatch({ type: 'ADD_TO_QUEUE', track: t })
    dispatch({ type: 'PLAY_TRACK', track: tracks[0] })
  }

  /** 整单加入当前队列（不打断正在播放的歌曲） */
  const enqueueAll = () => {
    for (const t of songs.map(toTrack)) {
      dispatch({ type: 'ADD_TO_QUEUE', track: t })
    }
  }

  return (
    <div className="dm-pl-detail" data-testid="dm-playlist-detail">
      <div className="dm-pl-detail-head">
        <button type="button" className="dm-pl-back" onClick={onBack}>
          <Icon name="back" size={14} /> 返回
        </button>
        <button type="button" className="dm-icon-btn" onClick={playAll}>
          播放全部
        </button>
        <button
          type="button"
          className="dm-icon-btn"
          onClick={enqueueAll}
          disabled={!songs.length}
        >
          加入队列
        </button>
      </div>
      {loading && <p className="dm-pl-hint">加载中…</p>}
      {error && <p className="dm-pl-hint" role="alert">{error}</p>}
      <ul className="dm-pl-songs">
        {songs.map((s, i) => (
          <li key={s.id} className="dm-pl-song">
            <span className="dm-pl-song-no">{i + 1}</span>
            <button
              type="button"
              className="dm-pl-song-main"
              onClick={() => dispatch({ type: 'PLAY_TRACK', track: toTrack(s) })}
            >
              <span className="dm-pl-song-name">{s.name}</span>
              <span className="dm-pl-song-artist">
                {(((s as unknown as { ar?: { name: string }[]; artists?: { name: string }[] }).ar ||
                  (s as unknown as { artists?: { name: string }[] }).artists) || []
                ).map((a) => a.name).join(' / ')}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
