import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PlayerProvider, usePlayer } from '../../src/dreammusic/player/PlayerContext'
import { login } from '../../src/dreammusic/api'

function Harness() {
  const { state, dispatch, audioRef, playbackError } = usePlayer()
  const [events, setEvents] = useState<Array<{ event: string; time: number; paused: boolean; readyState: number }>>([])
  const [starting, setStarting] = useState(false)
  useEffect(() => {
    const audio = audioRef.current!
    audio.muted = true
    const listener = (event: Event) => setEvents(previous => [...previous.filter((item, index) =>
      item.event !== 'timeupdate' || index >= previous.length - 8), {
      event: event.type, time: Number(audio.currentTime.toFixed(3)), paused: audio.paused, readyState: audio.readyState,
    }])
    for (const event of ['error', 'loadedmetadata', 'playing', 'timeupdate', 'pause']) audio.addEventListener(event, listener)
    return () => { for (const event of ['error', 'loadedmetadata', 'playing', 'timeupdate', 'pause']) audio.removeEventListener(event, listener) }
  }, [audioRef])
  async function start(query = '') {
    setStarting(true); setEvents([])
    try {
      await login('identity-user', 'identity-password')
      const { body, catalog } = await (await fetch('/test/fixture' + query)).json()
      dispatch({ type: 'PLAY_TRACK', track: { id: 'controlled-' + Date.now(), name: '目录歌曲', artist: '原歌手',
        mediaRef: catalog.mediaRef, catalogRef: body.catalogRef, playbackRef: body.playbackRef,
        lyricsRef: body.lyricsRef, playbackSource: body.playbackSource, lyricsSource: body.lyricsSource,
        recoveryToken: body.recoveryToken, url: body.data[0].url } })
    } finally { setStarting(false) }
  }
  const track = state.queue[state.currentIndex]
  return <main style={{ maxWidth: 850, margin: '30px auto', fontFamily: 'sans-serif', lineHeight: 1.6 }}>
    <h1>Issue #32：受控 URL 过期恢复</h1>
    <p>生产 React 播放器 / API → 实际鉴权 HTTP → 本地 90 秒 WAV。首个地址 410；恢复地址可解码。音频静音。</p>
    <button disabled={starting} onClick={() => start()}>开始受控过期播放</button>{' '}
    <button disabled={starting} onClick={() => start('?failure=true')}>持续失效</button>{' '}
    <button disabled={starting} onClick={() => start('?slow=true')}>慢解析</button>{' '}
    <button onClick={() => dispatch({ type: 'CLEAR_QUEUE' })}>取消播放</button>
    <p role="status">{playbackError || (state.isPlaying ? '播放请求进行中' : '已暂停')}</p>
    <pre id="state">{JSON.stringify({ name: track?.name, artist: track?.artist, catalogRef: track?.catalogRef,
      playbackRef: track?.playbackRef, lyricsRef: track?.lyricsRef, playbackSource: track?.playbackSource,
      revision: track?.playbackRevision, isPlaying: state.isPlaying, time: Number(state.currentTime.toFixed(3)) }, null, 2)}</pre>
    <h2>浏览器原生媒体事件</h2><pre id="events">{JSON.stringify(events, null, 2)}</pre>
  </main>
}
createRoot(document.getElementById('root')!).render(<PlayerProvider storageKey="issue32-controlled"><Harness /></PlayerProvider>)
