import { useRef } from 'react'
import { usePlayer } from './player/PlayerContext'
import Cover from './Cover'
import HeartButton from './HeartButton'
import Icon from '../components/Icon'
import './QueueView.css'

/** 左栏：播放队列（DM-06） */
export default function QueueView() {
  const { state, dispatch } = usePlayer()
  const { queue, currentIndex } = state
  const dragIndex = useRef<number | null>(null)

  if (queue.length === 0) {
    return (
      <div className="dm-queue-empty" data-testid="dm-queue-empty">
        队列为空，点右上「搜索」找歌加入
      </div>
    )
  }

  return (
    <div className="dm-queue" data-testid="dm-queue">
      <div className="dm-queue-head">
        <span>播放队列（{queue.length}）</span>
        <button
          type="button"
          className="dm-queue-clear"
          onClick={() => dispatch({ type: 'CLEAR_QUEUE' })}
        >
          清空
        </button>
      </div>
      <ul className="dm-queue-list">
        {queue.map((t, i) => (
          <li
            key={t.id}
            className={`dm-queue-item ${i === currentIndex ? 'is-current' : ''}`}
            draggable
            onDragStart={(e) => {
              dragIndex.current = i
              e.dataTransfer.effectAllowed = 'move'
            }}
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = 'move'
            }}
            onDrop={(e) => {
              e.preventDefault()
              const from = dragIndex.current
              dragIndex.current = null
              if (from != null && from !== i) {
                dispatch({ type: 'REORDER_QUEUE', from, to: i })
              }
            }}
            onDragEnd={() => {
              dragIndex.current = null
            }}
          >
            <Cover
              picUrl={t.picUrl}
              songId={t.id}
              alt={t.name}
              className="dm-queue-thumb"
              phClassName="dm-queue-thumb-ph"
            />
            <button
              type="button"
              className="dm-queue-main"
              onClick={() => dispatch({ type: 'PLAY_TRACK', track: t })}
            >
              <span className="dm-queue-name">{t.name}</span>
              <span className="dm-queue-artist">{t.artist}</span>
            </button>
            <HeartButton songId={t.id} />
            <div className="dm-queue-move">
              <button
                type="button"
                className="dm-queue-move-btn"
                onClick={() => dispatch({ type: 'REORDER_QUEUE', from: i, to: i - 1 })}
                disabled={i === 0}
                aria-label={`上移 ${t.name}`}
                title="上移"
              >
                ↑
              </button>
              <button
                type="button"
                className="dm-queue-move-btn"
                onClick={() => dispatch({ type: 'REORDER_QUEUE', from: i, to: i + 1 })}
                disabled={i === queue.length - 1}
                aria-label={`下移 ${t.name}`}
                title="下移"
              >
                ↓
              </button>
            </div>
            <button
              type="button"
              className="dm-queue-del"
              onClick={() => dispatch({ type: 'REMOVE_FROM_QUEUE', id: t.id })}
              aria-label={`删除 ${t.name}`}
            >
              <Icon name="trash" size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
