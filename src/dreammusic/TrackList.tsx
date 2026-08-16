import { usePlayer } from './player/PlayerContext'
import type { Track } from './player/reducer'
import Cover from './Cover'
import './TrackList.css'

/**
 * 可复用歌曲列表（每日推荐 / 私人FM / 我喜欢 / 歌单详情通用）：
 * 播放全部 / 加入队列 / 点单首。
 */
export default function TrackList({
  tracks,
  emptyHint = '暂无歌曲',
  showBulkActions = true,
}: {
  tracks: Track[]
  emptyHint?: string
  showBulkActions?: boolean
}) {
  const { dispatch } = usePlayer()

  const playAll = () => {
    if (!tracks.length) return
    dispatch({ type: 'CLEAR_QUEUE' })
    for (const t of tracks) dispatch({ type: 'ADD_TO_QUEUE', track: t })
    dispatch({ type: 'PLAY_TRACK', track: tracks[0] })
  }

  const enqueueAll = () => {
    for (const t of tracks) dispatch({ type: 'ADD_TO_QUEUE', track: t })
  }

  if (!tracks.length) {
    return <p className="dm-tracklist-empty">{emptyHint}</p>
  }

  return (
    <div className="dm-tracklist">
      {showBulkActions && (
        <div className="dm-tracklist-actions">
          <button type="button" className="dm-icon-btn" onClick={playAll}>
            播放全部
          </button>
          <button type="button" className="dm-icon-btn" onClick={enqueueAll}>
            加入队列
          </button>
        </div>
      )}
      <ul className="dm-tracklist-list">
        {tracks.map((t, i) => (
          <li key={`${t.id}-${i}`} className="dm-tracklist-item">
            <span className="dm-tracklist-no">{i + 1}</span>
            <Cover
              picUrl={t.picUrl}
              songId={t.id}
              alt={t.name}
              className="dm-tracklist-thumb"
              phClassName="dm-tracklist-thumb-ph"
            />
            <button
              type="button"
              className="dm-tracklist-main"
              onClick={() => dispatch({ type: 'PLAY_TRACK', track: t })}
            >
              <span className="dm-tracklist-name">{t.name}</span>
              <span className="dm-tracklist-artist">{t.artist}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
