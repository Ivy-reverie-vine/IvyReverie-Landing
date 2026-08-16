import { useState } from 'react'
import { usePlayer } from './PlayerContext'
import { createDownloadTask, NcmError } from '../api'
import type { Mode, Level } from './reducer'
import type { CSSProperties } from 'react'
import Icon from '../../components/Icon'
import './Controls.css'

const MODE_CYCLE: Mode[] = ['order', 'single', 'shuffle']
const MODE_LABEL: Record<Mode, string> = {
  order: '顺序',
  single: '单曲',
  shuffle: '随机',
}
const LEVELS: Level[] = ['standard', 'exhigh', 'lossless', 'hires']
const LEVEL_LABEL: Record<Level, string> = {
  standard: '标准',
  exhigh: '极高',
  lossless: '无损',
  hires: 'Hi-Res',
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** 播放控制条（DM-04）：上一首/播放/下一首 + 进度 + 模式 + 音质 */
export default function Controls() {
  const { state, dispatch, audioRef } = usePlayer()
  const track = state.queue[state.currentIndex]
  const hasTrack = !!track
  const [downloadBusy, setDownloadBusy] = useState(false)
  const [downloadMsg, setDownloadMsg] = useState('')
  const pct = state.duration
    ? Math.min(100, (state.currentTime / state.duration) * 100)
    : 0

  const cycleMode = () => {
    const i = MODE_CYCLE.indexOf(state.mode)
    dispatch({ type: 'SET_MODE', mode: MODE_CYCLE[(i + 1) % MODE_CYCLE.length] })
  }
  async function handleDownload() {
    if (!track || downloadBusy) return
    setDownloadBusy(true)
    setDownloadMsg('')
    try {
      const r = await createDownloadTask({
        songId: track.id,
        level: state.level,
        songName: track.name,
        artist: track.artist,
      })
      setDownloadMsg(`${r.message}（当前余额 ${r.points}）`)
    } catch (e) {
      setDownloadMsg(e instanceof NcmError ? e.message : '下载任务创建失败')
    } finally {
      setDownloadBusy(false)
    }
  }

  return (
    <div className="dm-controls" data-testid="dm-controls">
      <div className="dm-now-line">
        <span className="dm-now-name">{track ? track.name : '未播放'}</span>
        {track && <span className="dm-now-artist">{track.artist}</span>}
      </div>
      <div className="dm-progress">
        <span className="dm-time">{fmt(state.currentTime)}</span>
        <input
          className="dm-seek"
          type="range"
          min={0}
          max={state.duration || 0}
          step={0.1}
          value={Math.min(state.currentTime, state.duration || 0)}
          disabled={!hasTrack}
          style={{ '--fill': `${pct}%` } as CSSProperties}
          onChange={(e) => {
            const t = Number(e.target.value)
            // 拖进度必须同步 audio.currentTime，否则只改界面、声音不动
            if (audioRef.current && hasTrack) {
              audioRef.current.currentTime = t
            }
            dispatch({ type: 'SEEK', time: t })
          }}
          aria-label="进度"
        />
        <span className="dm-time">{fmt(state.duration)}</span>
      </div>
      <div className="dm-buttons">
        <div className="dm-buttons-side">
          <button
            type="button"
            className="dm-ctrl-btn"
            onClick={cycleMode}
            title={`播放模式：${MODE_LABEL[state.mode]}`}
            aria-label={`播放模式 ${MODE_LABEL[state.mode]}`}
          >
            {MODE_LABEL[state.mode]}
          </button>
        </div>
        <div className="dm-buttons-center">
          <button
            type="button"
            className="dm-ctrl-btn"
            onClick={() => dispatch({ type: 'PREV' })}
            disabled={!hasTrack}
            aria-label="上一首"
          >
            <Icon name="prev" size={17} />
          </button>
          <button
            type="button"
            className="dm-ctrl-btn dm-play"
            onClick={() => dispatch({ type: 'TOGGLE' })}
            disabled={!hasTrack}
            aria-label={state.isPlaying ? '暂停' : '播放'}
          >
            <Icon name={state.isPlaying ? 'pause' : 'play'} size={18} />
          </button>
          <button
            type="button"
            className="dm-ctrl-btn"
            onClick={() => dispatch({ type: 'NEXT' })}
            disabled={!hasTrack}
            aria-label="下一首"
          >
            <Icon name="next" size={17} />
          </button>
        </div>
        <div className="dm-buttons-side dm-buttons-right">
          <select
            className="dm-level-select"
            value={state.level}
            onChange={(e) => dispatch({ type: 'SET_LEVEL', level: e.target.value as Level })}
            aria-label="音质"
            title={`音质：${LEVEL_LABEL[state.level]}`}
          >
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {LEVEL_LABEL[level]}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="dm-ctrl-btn"
            onClick={handleDownload}
            disabled={!hasTrack || downloadBusy}
            aria-label="下载歌曲"
            title="下载歌曲（扣 1 梦点）"
          >
            <Icon name="download" size={16} />
          </button>
        </div>
      </div>
      {downloadMsg && (
        <p className="dm-download-msg" role="status">
          {downloadMsg}
        </p>
      )}
    </div>
  )
}
