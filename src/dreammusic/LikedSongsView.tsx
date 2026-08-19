import { useCallback, useEffect, useState } from 'react'
import { likedList, songDetail, loginStatus, NcmError } from './api'
import { useCurrentUser } from './CurrentUserContext'
import { collectionToTrack } from './collection'
import TrackList from './TrackList'
import type { Track } from './player/reducer'

const SONG_DETAIL_BATCH_SIZE = 500

/** 我喜欢的音乐（T-03/DM-12）：读取全部 ID，分批补齐歌曲详情 */
export default function LikedSongsView() {
  const user = useCurrentUser()
  const [tracks, setTracks] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0 })

  const load = useCallback(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setProgress({ done: 0, total: 0 })
    setTracks([])
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
        const ids = liked.ids || []
        if (!ids.length) {
          if (!cancelled) {
            setTracks([])
          }
          return
        }
        const chunks: number[][] = []
        for (let i = 0; i < ids.length; i += SONG_DETAIL_BATCH_SIZE) {
          chunks.push(ids.slice(i, i + SONG_DETAIL_BATCH_SIZE))
        }
        setProgress({ done: 0, total: chunks.length })
        const details = await Promise.allSettled(
          chunks.map((chunk) =>
            songDetail(chunk.join(',')).finally(() => {
              if (!cancelled) {
                setProgress((current) => ({ ...current, done: current.done + 1 }))
              }
            }),
          ),
        )
        if (cancelled) return
        const songs = details.flatMap((result) =>
          result.status === 'fulfilled'
            ? ((result.value.songs || []) as Parameters<typeof collectionToTrack>[0][])
            : [],
        )
        setTracks(songs.map(collectionToTrack))
        const failed = details.filter((result) => result.status === 'rejected').length
        if (failed) {
          setError(`有 ${failed} 批歌曲详情加载失败，可重试`)
        }
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

  if (loading && !tracks.length) {
    return (
      <p className="dm-tracklist-empty">
        加载我喜欢…{progress.total ? ` ${progress.done}/${progress.total} 批` : ''}
      </p>
    )
  }
  return (
    <>
      {error && (
        <div className="dm-tracklist-sync-error">
          <p className="dm-tracklist-empty" role="alert">{error}</p>
          <button type="button" className="dm-icon-btn" onClick={() => load()}>
            重试加载
          </button>
        </div>
      )}
      {loading && progress.total > 0 && (
        <p className="dm-tracklist-empty">
          继续加载… {progress.done}/{progress.total} 批
        </p>
      )}
      <TrackList tracks={tracks} emptyHint="还没有红心歌曲，去播放页点亮红心吧" />
    </>
  )
}
