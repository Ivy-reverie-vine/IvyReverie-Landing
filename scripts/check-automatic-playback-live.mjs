// Live provider HTTP via the local api-enhanced service; disposable auth/SQLite only.
// No provider response substitution and no credentials or signed URLs in durable evidence.
import { createServer } from 'node:http'
import { startIdentityGateway } from '../server/test-support/identityGateway.js'

const upstream = process.env.LIVE_NETEASE_UPSTREAM || 'http://127.0.0.1:30325'
const keyword = process.env.LIVE_MUSIC_KEYWORD || 'Kevin MacLeod'
const sampleId = process.env.LIVE_MUSIC_ID || '33984241'
const port = Number(process.env.LIVE_SAMPLE_PORT || 30326)
const gateway = await startIdentityGateway()
for (const id of ['meting-tencent', 'meting-kugou']) gateway.orchestrator.setSourceEnabled(id, false)
gateway.controls.thirdPartyResponse = async url => {
  if (url.host !== 'upstream.test') return null
  const live = new URL(url.pathname + url.search, upstream)
  return fetch(live, { signal: AbortSignal.timeout(6500) })
}
const headers = { 'X-API-Key': gateway.apiKey }
let evidence = null
const html = `<!doctype html><meta charset="utf-8"><title>Issue 25 真实平台播放验收</title>
<style>body{font:18px system-ui;padding:32px;max-width:850px;margin:auto;background:#f7f6fa;color:#292438}button{padding:14px;font:inherit}pre{white-space:pre-wrap}audio{width:100%}</style>
<h1>Issue 25 · 真实网易音频</h1><p>实际 HTTP 搜索 → NightDream 自动解析 → 浏览器音频解码。临时本地账户，仅启用网易；QQ / 酷狗未启用。</p>
<button id="play">点播真实网易样本</button> <button id="pause">暂停</button>
<p id="catalog">等待点播</p><audio controls></audio><pre id="status">未开始</pre>
<script>
const audio=document.querySelector('audio'),status=document.querySelector('#status');let sample;
function report(){status.textContent=JSON.stringify({provider:sample?.provider,id:sample?.id,title:sample?.title,terminal:sample?.terminal,
integrity:sample?.integrity,reason:sample?.reason,providerDurationMs:sample?.resourceDurationMs,
catalogDurationMs:sample?.catalogDurationMs,paused:audio.paused,currentTime:audio.currentTime,duration:audio.duration,
readyState:audio.readyState,error:audio.error?.code??null},null,2)}
for(const type of ['playing','timeupdate','loadedmetadata','error','pause'])audio.addEventListener(type,report);
document.querySelector('#play').onclick=async()=>{try{status.textContent='正在通过真实接口搜索及解析…';
sample=await(await fetch('/resolve')).json();document.querySelector('#catalog').textContent=sample.title+' · '+sample.artist;
if(sample.integrity!=='full'||sample.terminal!=='success'){report();return}audio.src=sample.url;await audio.play();report()
}catch(error){status.textContent='失败：'+error.message}};
document.querySelector('#pause').onclick=()=>audio.pause();
</script>`
const server = createServer(async (req, res) => {
  if (req.url === '/resolve') {
    try {
      const search = await gateway.request('/dreammusic/api/v2/search?' + new URLSearchParams({
        aggregate: 'true', merge: 'true', keywords: keyword, limit: '8' }), { headers })
      const song = search.body.groups?.flatMap(group => group.entries).find(song => song.sourceId === sampleId)
      if (!song) throw new Error('Live sample is absent from actual search results')
      const result = await gateway.request('/dreammusic/api/v2/song/url/v1?' + new URLSearchParams({
        automatic: 'true', mediaRef: song.mediaRef, searchSession: search.body.searchSession }), { headers })
      evidence = { provider: result.body.playbackSource, id: sampleId, title: song.title, artist: song.artists.join(' / '),
        terminal: result.body.playback?.status, integrity: result.body.audioIntegrity?.status, reason: result.body.audioIntegrity?.reason,
        catalogDurationMs: result.body.audioIntegrity?.catalogDurationMs, resourceDurationMs: result.body.audioIntegrity?.resourceDurationMs,
        elapsedMs: result.body.playback?.elapsedMs, catalogPreserved: result.body.catalogRef === song.mediaRef,
        searchSources: search.body.sources.map(source => ({ source: source.source, status: source.status, errorCode: source.errorCode })) }
      console.log(JSON.stringify(evidence))
      res.writeHead(200, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ ...evidence, url: result.body.data?.[0]?.url }))
    } catch (error) {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ terminal: 'failed', reason: error.message }))
    }
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html)
})
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
console.log(`Live sample page: http://127.0.0.1:${port}/`)
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await new Promise(resolve => server.close(resolve))
  await gateway.close()
  process.exit(0)
}
process.on('SIGINT', stop); process.on('SIGTERM', stop)
process.stdin.setEncoding('utf8')
process.stdin.on('data', input => { if (input.trim() === 'stop') void stop() })
