// Narrow, disposable verification page. Actual Bilibili HTTP, no mocked provider replies.
// The explicit sample-play button is isolated here; production full-audio gates stay intact.
import { createServer } from 'node:http'
import { startIdentityGateway } from '../server/test-support/identityGateway.js'
import { createMediaRef } from '../server/mediaContract.js'

const port = Number(process.env.LIVE_BILIBILI_PORT || 30327)
const gateway = await startIdentityGateway({ bilibili: true, mediaProxy: true, mediaTtlMs: 120000 })
for (const source of gateway.orchestrator.sourceStatuses()) {
  if (source.id !== 'bilibili') gateway.orchestrator.setSourceEnabled(source.id, false)
}
gateway.controls.thirdPartyResponse = async (url, init) => fetch(url, init)
let latest = null
const html = `<!doctype html><meta charset="utf-8"><title>Issue 26 指定 Bilibili 分 P 验收</title>
<style>body{font:18px system-ui;padding:32px;max-width:880px;margin:auto;background:#f7f6fa;color:#292438}button,input{padding:12px;font:inherit;margin:5px}pre{white-space:pre-wrap}audio{width:100%}</style>
<h1>Issue 26 · 指定 Bilibili 分 P</h1>
<p>隔离验收：真实 B 站 → NightDream 统一 v2 → 既有媒体代理 → 同一 audio 播放器。仅测试指定资源，不进行歌名搜索或下载入库。</p>
<label>BV <input id="bv" value="BV1GJ411x7h7"></label><label>CID <input id="cid" value="137649199"></label>
<button id="resolve">解析指定分 P</button><p id="catalog">尚未解析</p>
<p>完整性 unknown 时只能证明可访问和可播放，不能证明整曲完整。本按钮仅用于主动选择的隔离样本。</p>
<button id="play" disabled>播放指定验收样本</button><button id="pause">暂停</button>
<audio controls></audio><pre id="status">未开始</pre>
<script>
const audio=document.querySelector('audio'),status=document.querySelector('#status'),play=document.querySelector('#play');let sample,serial=0;
function report(){const evidence={...sample,url:undefined,paused:audio.paused,currentTime:audio.currentTime,duration:audio.duration,
readyState:audio.readyState,error:audio.error?.code??null};status.textContent=JSON.stringify(evidence,null,2);
if(sample)fetch('/evidence',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(evidence)}).catch(()=>{})}
for(const type of ['playing','timeupdate','loadedmetadata','error','pause'])audio.addEventListener(type,report);
document.querySelector('#resolve').onclick=async()=>{const turn=++serial;play.disabled=true;audio.pause();audio.removeAttribute('src');audio.load();sample=undefined;
try{status.textContent='正在解析真实分 P…';const response=await fetch('/resolve?'+new URLSearchParams({bvid:document.querySelector('#bv').value,cid:document.querySelector('#cid').value}));
const result=await response.json();if(turn!==serial)return;if(!response.ok)throw new Error(result.errorCode+'：'+result.message);
sample=result;document.querySelector('#catalog').textContent='实际来源：Bilibili · '+sample.bvid+' / CID '+sample.cid+' / P'+sample.page+' · '+sample.partTitle+' · UP：'+sample.uploader+'（上传者）';
audio.src=sample.url;play.disabled=false;report()}catch(error){status.textContent='失败：'+error.message}};
play.onclick=async()=>{try{await audio.play();report()}catch(error){status.textContent='媒体播放失败：'+error.message}};
document.querySelector('#pause').onclick=()=>audio.pause();
</script>`
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${port}`)
  if (url.pathname === '/stop' && req.method === 'POST') { res.writeHead(204); res.end(); setImmediate(() => void stop()); return }
  if (url.pathname === '/resolve') {
    try {
      const mediaRef = createMediaRef({ source: 'bilibili', sourceId: `${url.searchParams.get('bvid')}:${url.searchParams.get('cid')}` })
      const query = '?' + new URLSearchParams({ mediaRef })
      const headers = { 'X-API-Key': gateway.apiKey }
      const detail = await gateway.request('/dreammusic/api/v2/song/detail' + query, { headers })
      const result = detail.status === 200 ? await gateway.request('/dreammusic/api/v2/song/url/v1' + query, { headers }) : detail
      res.writeHead(result.status, { 'Content-Type': 'application/json' })
      if (result.status !== 200) return res.end(JSON.stringify(result.body))
      const data = result.body.data[0], resource = data.resource
      const evidence = { source: result.body.playbackSource, bvid: resource.bvid, cid: resource.cid, page: resource.page,
        title: resource.title, partTitle: resource.partTitle, uploader: resource.uploader.name,
        artists: detail.body.data[0].artists, catalogRef: result.body.catalogRef, playbackRef: result.body.playbackRef,
        audioIntegrity: result.body.audioIntegrity, media: data.media, urlObtained: Boolean(data.url) }
      console.log(JSON.stringify(evidence))
      return res.end(JSON.stringify({ ...evidence, url: data.url }))
    } catch { res.writeHead(502); return res.end(JSON.stringify({ errorCode: 'LIVE_REQUEST_FAILED', message: '真实请求失败' })) }
  }
  if (url.pathname === '/evidence' && req.method === 'POST') {
    let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 16000) { res.writeHead(413); return res.end() } }
    latest = JSON.parse(body); res.writeHead(204); return res.end()
  }
  if (url.pathname === '/evidence') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(latest)) }
  if (url.pathname === '/diagnostics') { res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify(gateway.diagnostics.recent())) }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html)
})
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))
console.log(`Bilibili verification page: http://127.0.0.1:${port}/`)
let stopping = false
async function stop() {
  if (stopping) return; stopping = true
  await new Promise(resolve => server.close(resolve)); await gateway.close(); process.exit(0)
}
process.on('SIGINT', stop); process.on('SIGTERM', stop)
process.stdin.setEncoding('utf8')
process.stdin.on('data', input => { if (input.trim() === 'stop') void stop() })
