import { useEffect, useState } from 'react'
import { personalFm, fmTrash, NcmError } from './api'
import { collectionToTrack } from './collection'
import TrackList from './TrackList'
import type { Track } from './player/reducer'

/** 私人 FM（T-01）：每次拉一批，支持换一批/垃圾桶（下一首） */
export default function FmView() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = (fresh = false) => {
    let cancelled = false
    setLoading(true)
    setError('')
    personalFm(fresh)
      .then((r) => {
        if (cancelled) return
        const songs = (Array.isArray(r.data) ? r.data : []) as Parameters<typeof collectionToTrack>[0][]
        setTracks(songs.map(collectionToTrack))
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof NcmError ? e.message : '私人 FM 加载失败')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }

  useEffect(() => load(), [])

  async function dislikeFirst() {
    const first = tracks[0]
    if (!first) return
    setError('')
    try {
      await fmTrash(first.id)
      load(true)
    } catch (e) {
      setError(e instanceof NcmError ? e.message : '操作失败')
    }
  }

  return (
    <div className="dm-fm">
      <div className="dm-tracklist-actions">
        <button type="button" className="dm-icon-btn" onClick={() => load(true)} disabled={loading}>
          {loading ? '加载中…' : '换一批'}
        </button>
        <button type="button" className="dm-icon-btn" onClick={dislikeFirst} disabled={loading || !tracks.length}>
          不喜欢
        </button>
        <span className="dm-fm-hint">私人 FM：只给你一个人放歌</span>
      </div>
      {error && <p className="dm-tracklist-empty" role="alert">{error}</p>}
      {!error && <TrackList tracks={tracks} showBulkActions={false} emptyHint="FM 暂时没有抓到歌，换一批试试" />}
    </div>
  )
}
