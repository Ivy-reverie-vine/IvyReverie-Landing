import { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PlayerProvider, usePlayer } from '../../src/dreammusic/player/PlayerContext'
import { login } from '../../src/dreammusic/api'
import NowPlaying from '../../src/dreammusic/NowPlaying'

function Harness() {
  const { state, dispatch, audioRef, playbackError } = usePlayer()
  const currentTrack = state.queue[state.currentIndex]
  const [record, setRecord] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('等待选择真实样本')
  const [candidates, setCandidates] = useState<Array<{ mediaRef: string; sourceId: string; title: string; reason: string }>>([])
  const [pending, setPending] = useState('')
  const selection = useRef({ key: '', startedAt: 0 })
  const handoffAt = useRef(0)
  const [native, setNative] = useState<unknown>(null)
  useEffect(() => {
    const audio = audioRef.current!
    audio.muted = true
    let lastProgress = 0
    const listener = (event: Event) => {
      if (event.type === 'timeupdate' && Date.now() - lastProgress < 10000) return
      if (event.type === 'timeupdate') lastProgress = Date.now()
      if (!selection.current.key) return
      const state = { key: selection.current.key, event: event.type === 'timeupdate' ? 'progress' : event.type,
        time: audio.currentTime, duration: Number.isFinite(audio.duration) ? audio.duration : null,
        paused: audio.paused, ended: audio.ended, readyState: audio.readyState,
        error: audio.error?.code || null, sinceSelectionMs: Date.now() - selection.current.startedAt,
        sinceHandoffMs: handoffAt.current ? Date.now() - handoffAt.current : null }
      setNative(state)
      void fetch('/test/browser', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) })
    }
    for (const event of ['playing', 'timeupdate', 'pause', 'ended', 'error']) audio.addEventListener(event, listener)
    return () => { for (const event of ['playing', 'timeupdate', 'pause', 'ended', 'error']) audio.removeEventListener(event, listener) }
  }, [audioRef])
  async function select(key: string) {
    setBusy(true); dispatch({ type: 'CLEAR_QUEUE' }); setNative(null)
    handoffAt.current = 0
    setCandidates([]); setPending('')
    selection.current = { key, startedAt: Date.now() }
    setStatus('真实聚合搜索与自动解析进行中…')
    try {
      await login('matching-live', 'matching-live-local')
      const result = await (await fetch('/test/select/' + key)).json()
      setRecord(result.record)
      const { body, catalog } = result
      setCandidates(body?.playback?.bilibili?.candidates?.filter((item: { mediaRef?: string }) => item.mediaRef) || [])
      if (!body || body.playback?.status !== 'success' || body.audioIntegrity?.status !== 'full') {
        setStatus('未取得可靠完整音频：' + (body?.playback?.reason || result.record.error)); return
      }
      setStatus('解析完成；由生产播放器缓冲并解码，音频静音')
      handoffAt.current = Date.now()
      dispatch({ type: 'PLAY_TRACK', track: { id: key + '-' + Date.now(), name: catalog.title,
        artist: catalog.artists.join(' / '), picUrl: catalog.album.pictureUrl,
        mediaRef: catalog.mediaRef, catalogRef: body.catalogRef, playbackRef: body.playbackRef,
        lyricsRef: body.lyricsRef, playbackSource: body.playbackSource, lyricsSource: body.lyricsSource,
        recoveryToken: body.recoveryToken, url: body.data[0].url } })
    } catch (error) { setStatus(error instanceof Error ? error.message : '请求失败') }
    finally { setBusy(false) }
  }
  async function manual() {
    setBusy(true)
    try {
      const result = await (await fetch('/test/manual/' + selection.current.key, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mediaRef: pending }) })).json()
      setRecord(result.record)
      const { body } = result
      if (body?.audioIntegrity?.status !== 'full' || !body.data?.[0]?.url) {
        setStatus('手动确认已解析所选资源；完整性：' + (body?.audioIntegrity?.status || result.record.error) + '，保持停止'); return
      }
      const entry = body.manualSelection.entry
      handoffAt.current = Date.now()
      dispatch({ type: 'PLAY_TRACK', track: { id: 'manual-' + Date.now(), name: entry.title,
        artist: entry.artists.join(' / '), mediaRef: body.catalogRef, catalogRef: body.catalogRef,
        playbackRef: body.playbackRef, lyricsRef: body.lyricsRef, playbackSource: body.playbackSource,
        recoveryToken: body.recoveryToken, url: body.data[0].url } })
      setStatus('独立候选完整性通过，生产播放器开始播放')
    } catch (error) { setStatus(error instanceof Error ? error.message : '手动解析失败') }
    finally { setBusy(false) }
  }
  return <main style={{ maxWidth: 1100, margin: '24px auto', fontFamily: 'sans-serif', lineHeight: 1.5 }}>
    <h1>Issue #34 · 真实多源验收</h1>
    <p>隔离账户/SQLite，真实网易、QQ、酷狗、Bilibili。生产播放器与歌词组件。未通过的场景保留失败状态。</p>
    <button disabled={busy} onClick={() => select('full')}>播放固定完整样本</button>{' '}
    <button disabled={busy} onClick={() => select('trial')}>验证明确试听与 B 站回退</button>{' '}
    <button disabled={busy} onClick={() => select('lyrics')}>验证原平台歌词</button>{' '}
    <button disabled={busy} onClick={() => select('lrclibPlain')}>验证真实 LRCLIB 文本</button>{' '}
    <button disabled={busy} onClick={() => select('lrclibMissing')}>验证真实歌词未命中</button>{' '}
    <button disabled={busy} onClick={() => select('lrclibSynced')}>验证真实 LRCLIB 同步</button>{' '}
    <button disabled={busy || !currentTrack?.url} onClick={() => {
      const audio = audioRef.current!
      const expired = new URL(currentTrack!.url!, window.location.href)
      expired.searchParams.set('reload', String(Date.now())) // Require HTTP, not a previously buffered/cache hit.
      audio.src = expired.toString(); audio.load(); void audio.play().catch(() => {})
    }}>重载已过期链接</button>{' '}
    <button onClick={() => dispatch({ type: 'PAUSE' })}>暂停</button>
    <p role="status">{playbackError || status}</p>
    {candidates.length > 0 && <section aria-label="手动候选"><h2>自动拒绝的具体候选</h2>
      {candidates.map(candidate => <p key={candidate.mediaRef}><button disabled={busy} onClick={() => { setPending(candidate.mediaRef); setStatus('已选候选，尚未解析音频：' + candidate.sourceId) }}>选择 {candidate.sourceId}</button>{' '}{candidate.title} · {candidate.reason}</p>)}
      <button disabled={busy || !pending} onClick={manual}>确认播放独立候选</button>
    </section>}
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
      <section style={{ background: '#282331', color: 'white', minHeight: 400 }}><NowPlaying /></section>
      <section><h2>原生媒体状态</h2><pre id="native">{JSON.stringify(native, null, 2)}</pre>
        <pre id="identity">{JSON.stringify({ name: currentTrack?.name, catalogRef: currentTrack?.catalogRef,
          playbackRef: currentTrack?.playbackRef, playbackSource: currentTrack?.playbackSource,
          lyricsRef: currentTrack?.lyricsRef, revision: currentTrack?.playbackRevision }, null, 2)}</pre>
        <h2>本轮真实解析证据</h2><pre id="record" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 500, overflow: 'auto' }}>{JSON.stringify(record, null, 2)}</pre></section>
    </div>
  </main>
}
createRoot(document.getElementById('root')!).render(<PlayerProvider storageKey="issue34-live"><Harness /></PlayerProvider>)
