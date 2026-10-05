import { useEffect, useRef, useState } from 'react'
import { songDetail, lyricNew, mediaDetail, mediaLyrics, type LyricResult } from './api'
import { usePlayer } from './player/PlayerContext'
import { musicSourceLabel } from './player/reducer'
import Controls from './player/Controls'
import { parseLyric, staticLyrics, findActiveIndex, findActiveChar, EMPTY_LYRICS, type Lyrics } from './lyric'
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
  const [timelineTrusted, setTimelineTrusted] = useState(false)
  const [lyricsSource, setLyricsSource] = useState('')
  const [lyricRetry, setLyricRetry] = useState(0)
  const [retryable, setRetryable] = useState(false)

  // 切曲 → 拉封面（专辑小图用）+ 歌词
  useEffect(() => {
    if (!track) {
      setPicUrl(undefined)
      setLyrics(EMPTY_LYRICS)
      return
    }
    let cancelled = false
    const controller = new AbortController()
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
    setTimelineTrusted(false)
    setLyricsSource('')
    setLyricHint('正在加载歌词…')
    setRetryable(false)
    const lyric: Promise<LyricResult> = track.mediaRef
      ? track.playbackRevision
        ? mediaLyrics(track.catalogRef || track.mediaRef, track.playbackRef || track.mediaRef, controller.signal, true)
        : mediaLyrics(track.catalogRef || track.mediaRef, track.playbackRef || track.mediaRef, controller.signal)
      : lyricNew(track.id)
    lyric
      .then((r) => {
        if (cancelled) return
        const trusted = track.mediaRef ? r.lyrics?.timeline === 'trusted' : true
        const instrumental = r.nolyric === true || r.lyrics?.status === 'instrumental'
        setTimelineTrusted(trusted)
        setLyricsSource(r.lyricsSource || '')
        setLyrics(instrumental ? EMPTY_LYRICS : trusted ? parseLyric(r.lrc?.lyric, r.yrc?.lyric) : staticLyrics(r.lrc?.lyric, r.yrc?.lyric))
        const status = r.lyrics?.status
        setRetryable(r.lyrics?.retryable === true || status === 'failed' || status === 'timeout' || status === 'unavailable')
        const completedFallback = r.lyrics?.fallback.implemented === true
        setLyricHint(r.nolyric === true || status === 'instrumental' ? '纯音乐，无歌词'
          : status === 'timeout' ? completedFallback ? '歌词请求超时' : '原平台歌词请求超时'
            : status === 'failed' || status === 'unavailable' ? completedFallback ? '歌词暂时无法加载' : '原平台歌词暂时无法加载'
              : status === 'unsupported' ? '原平台未提供歌词' : completedFallback ? '暂无歌词' : '原平台暂无歌词')
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLyrics(EMPTY_LYRICS)
          setRetryable(true)
          setLyricHint(error instanceof Error && error.message === '当前音源未提供歌词' ? error.message : '歌词加载失败')
        }
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [track?.id, track?.mediaRef, track?.catalogRef, track?.playbackRef, track?.lyricsRef, track?.playbackRevision, lyricRetry])

  const timeMs = state.currentTime * 1000
  const activeIdx = timelineTrusted ? findActiveIndex(lyrics.lines, timeMs) : -1
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

        <div className={`dm-np-lyrics${!timelineTrusted ? ' is-static' : ''}`} role="region" aria-label="歌词">
          {track && lyricsSource && <p className="dm-np-hint">歌词来源：{musicSourceLabel(lyricsSource)}</p>}
          {track && lyrics.lines.length > 0 && !timelineTrusted && <p className="dm-np-hint">歌词时间轴未确认，静态显示</p>}
          {!track && <p className="dm-np-hint">未播放</p>}
          {track && lyrics.lines.length === 0 && (
            <p className="dm-np-hint">{lyricHint}</p>
          )}
          {track && retryable && <button type="button" className="dm-np-lyric-retry"
            onClick={() => setLyricRetry(value => value + 1)}>重试歌词</button>}
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
