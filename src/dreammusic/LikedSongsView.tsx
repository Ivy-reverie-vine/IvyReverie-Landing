import { useCallback, useEffect, useState } from 'react'
import { likedList, songDetail, loginStatus, NcmError } from './api'
import { useCurrentUser } from './CurrentUserContext'
import { collectionToTrack } from './collection'
import TrackList from './TrackList'
import type { Track } from './player/reducer'

/** 我喜欢的音乐（T-03）：先取喜欢列表 ids，再批量拿歌曲详情 */
export default function LikedSongsView() {
  const user = useCurrentUser()
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    ;(async () => {
      try {
        let uid = user.neteaseUid
        if (!uid) {
          const status = await loginStatus()
          uid = String(status.data?.profile?.userId || '')
        }
        if (!uid) {
          if (!cancelled) setError('无法获取网易云用户 ID，请重新扫码绑定')
          return
        }
        const liked = await likedList(uid)
        const ids = (liked.ids || []).slice(0, 999)
        if (!ids.length) {
          if (!cancelled) {
            setTracks([])
            setLoading(false)
          }
          return
        }
        const chunks: number[][] = []
        for (let i = 0; i < ids.length; i += 500) chunks.push(ids.slice(i, i + 500))
        const details = await Promise.all(chunks.map((chunk) => songDetail(chunk.join(','))))
        if (cancelled) return
        const songs = details.flatMap((d) => (d.songs || []) as Parameters<typeof collectionToTrack>[0][])
        setTracks(songs.map(collectionToTrack))
      } catch (e) {
        if (!cancelled) setError(e instanceof NcmError ? e.message : '加载我喜欢失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user.neteaseUid])

  useEffect(() => load(), [load])

  // 任意位置红心切换后立即刷新，不等下一次进入 tab
  useEffect(() => {
    const handler = () => load()
    window.addEventListener('dm-liked-changed', handler)
    return () => window.removeEventListener('dm-liked-changed', handler)
  }, [load])

  if (loading) return <p className="dm-tracklist-empty">加载我喜欢…</p>
  if (error) return <p className="dm-tracklist-empty" role="alert">{error}</p>
  return <TrackList tracks={tracks} emptyHint="还没有红心歌曲，去播放页点亮红心吧" />
}
