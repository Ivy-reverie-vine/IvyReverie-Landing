import { useEffect, useState } from 'react'
import { recommendSongs, NcmError } from './api'
import { collectionToTrack } from './collection'
import TrackList from './TrackList'
import type { Track } from './player/reducer'

/** 每日推荐（T-02）：登录后按网易云账号推荐歌曲 */
export default function DailyRecommendView() {
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    recommendSongs(50)
      .then((r) => {
        if (cancelled) return
        const songs = (r.data as { dailySongs?: Parameters<typeof collectionToTrack>[0][] })?.dailySongs || []
        setTracks(songs.map(collectionToTrack))
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof NcmError ? e.message : '加载每日推荐失败')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="dm-tracklist-empty">加载每日推荐…</p>
  if (error) return <p className="dm-tracklist-empty" role="alert">{error}</p>
  return <TrackList tracks={tracks} emptyHint="今天还没有推荐，稍后再来看看" />
}
