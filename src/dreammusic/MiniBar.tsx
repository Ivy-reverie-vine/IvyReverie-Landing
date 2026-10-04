import { usePlayer } from './player/PlayerContext'
import Cover from './Cover'
import Icon from '../components/Icon'
import './MiniBar.css'

/**
 * 底部 mini 播放条（DM-07）：搜索浮层打开时显示精简控制，
 * 点 mini 条回到全屏 NowPlaying。
 */
export default function MiniBar({ onClick }: { onClick: () => void }) {
  const { state, dispatch } = usePlayer()
  const track = state.queue[state.currentIndex]
  if (!track) return null

  const pct = state.duration ? (state.currentTime / state.duration) * 100 : 0

  return (
    <div
      className="dm-minibar"
      data-testid="dm-minibar"
      role="button"
      tabIndex={0}
      aria-label="返回播放页"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <Cover
        picUrl={track.picUrl}
        songId={track.id}
        mediaRef={track.mediaRef}
        alt=""
        className="dm-minibar-cover"
        phClassName="dm-minibar-cover-ph"
      />
      <span className="dm-minibar-name">{track.name}</span>
      <button
        type="button"
        className="dm-minibar-play"
        onClick={(e) => {
          e.stopPropagation()
          dispatch({ type: 'TOGGLE' })
        }}
        aria-label={state.isPlaying ? '暂停' : '播放'}
      >
        <Icon name={state.isPlaying ? 'pause' : 'play'} size={13} />
      </button>
      <span className="dm-minibar-prog" aria-hidden="true">
        <span className="dm-minibar-prog-fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  )
}
