import { useEffect, useRef, useState } from 'react'
import { songDetail, lyricNew, mediaDetail, mediaLyrics, type LyricResult } from './api'
import { usePlayer } from './player/PlayerContext'
import { musicSourceLabel } from './player/reducer'
import Controls from './player/Controls'
import { parseLyric, findActiveIndex, findActiveChar, EMPTY_LYRICS, type Lyrics } from './lyric'
import { applyThemeColor } from './theme'
import Icon from '../components/Icon'
import './NowPlaying.css'

/**
 * 右栏 NowPlaying（DM-06 + D4-Q7）：
 * 大封面 + 模糊背景 + 逐字歌词 + 控制条。
 * 背景 = 当前歌曲封面；无封面保持上一张；从未播放/无封面兜底显示默认背景图。
 */
export default function NowPlaying() {
  const { state } = usePlayer()
  const track = state.queue[state.currentIndex]

  const [picUrl, setPicUrl] = useState<string | undefined>(undefined)
  const [lyrics, setLyrics] = useState<Lyrics>(EMPTY_LYRICS)
  const [lyricHint, setLyricHint] = useState('正在加载歌词…')

  // 切曲 → 拉封面（专辑小图用）+ 歌词
  useEffect(() => {
    if (!track) {
      setPicUrl(undefined)
      setLyrics(EMPTY_LYRICS)
      return
    }
    let cancelled = false
    // 封面：已有就用，否则拉 songDetail
    if (track.picUrl && (!track.mediaRef || track.catalogRef)) {
      setPicUrl(track.picUrl)
    } else {
      setPicUrl(track.picUrl)
      const detail = track.mediaRef
        ? mediaDetail(track.catalogRef || track.mediaRef).then(r => r.data?.[0]?.album?.pictureUrl)
        : songDetail(track.id).then(r => {
            const s = r.songs?.[0] as { al?: { picUrl?: string }; album?: { picUrl?: string } } | undefined
            return s?.al?.picUrl || s?.album?.picUrl
          })
      detail
        .then((pic) => {
          if (cancelled) return
          if (pic) {
            setPicUrl(pic)
          }
        })
        .catch(() => {})
    }
    // 歌词
    setLyrics(EMPTY_LYRICS)
    setLyricHint('正在加载歌词…')
    const lyric: Promise<LyricResult> = track.mediaRef
      ? mediaLyrics(track.lyricsRef || track.mediaRef)
      : lyricNew(track.id)
    lyric
      .then((r) => {
        if (cancelled) return
        setLyrics(parseLyric(r.lrc?.lyric, r.yrc?.lyric))
        setLyricHint('纯音乐，无歌词')
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLyrics(EMPTY_LYRICS)
          setLyricHint(error instanceof Error && error.message === '当前音源未提供歌词' ? error.message : '歌词加载失败')
        }
      })
    return () => {
      cancelled = true
    }
  }, [track?.id, track?.mediaRef, track?.catalogRef, track?.lyricsRef])

  const timeMs = state.currentTime * 1000
  const activeIdx = findActiveIndex(lyrics.lines, timeMs)
  const activeLine = activeIdx >= 0 ? lyrics.lines[activeIdx] : undefined
  const activeChar = findActiveChar(activeLine, timeMs)

  const activeLineRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    activeLineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [activeIdx])

  // 主题色：驱动按钮/当前歌词/进度条等强调色（鸿蒙/QQ 动态取色）
  const displayPic = picUrl
  useEffect(() => {
    applyThemeColor(displayPic)
  }, [displayPic])

  return (
    <div className="dm-nowplaying" data-testid="dm-nowplaying">
      <div className="dm-np-content">
        {track?.playbackSource && <p className="dm-np-hint">音频来源：{musicSourceLabel(track.playbackSource)}</p>}
        <div className="dm-np-cover-wrap">
          {displayPic ? (
            <img
              className="dm-np-cover"
              src={track?.mediaRef ? displayPic : `${displayPic}?param=600y600`}
              alt={track?.name || ''}
            />
          ) : (
            <div className="dm-np-cover dm-np-cover-ph">
              {track ? <Icon name="music" size={40} /> : ''}
            </div>
          )}
        </div>

        <div className="dm-np-lyrics" role="region" aria-label="歌词">
          {!track && <p className="dm-np-hint">未播放</p>}
          {track && lyrics.lines.length === 0 && (
            <p className="dm-np-hint">{lyricHint}</p>
          )}
          <ul className="dm-lyric-list">
            {lyrics.lines.map((line, i) => {
              const isActive = i === activeIdx
              return (
                <li
                  key={i}
                  ref={isActive ? activeLineRef : undefined}
                  className={`dm-lyric-line ${isActive ? 'is-active' : ''}`}
                >
                  {line.chars && lyrics.hasYrc ? (
                    line.chars.map((c, ci) => (
                      <span
                        key={ci}
                        className={
                          isActive && ci <= activeChar
                            ? 'dm-lyric-char is-active'
                            : 'dm-lyric-char'
                        }
                      >
                        {c.text}
                      </span>
                    ))
                  ) : (
                    line.text
                  )}
                </li>
              )
            })}
          </ul>
        </div>

        <Controls />
      </div>
    </div>
  )
}
