// One-shot real catalog search -> ordinary platform resolution -> Bilibili search.
// Disposable local auth/SQLite only; no provider mocks and no known-BV shortcuts.
import { startIdentityGateway } from '../server/test-support/identityGateway.js'

const upstream = process.env.LIVE_NETEASE_UPSTREAM || 'http://127.0.0.1:30325'
const samples = JSON.parse(process.env.LIVE_MUSIC_SAMPLES || '[{"keyword":"晴天 周杰伦"},{"keyword":"Never Gonna Give You Up Rick Astley"}]')
const gateway = await startIdentityGateway({ bilibili: true, mediaProxy: true })
const events = []
for (const id of ['meting-tencent', 'meting-kugou']) gateway.orchestrator.setSourceEnabled(id, false)
gateway.controls.thirdPartyResponse = async (url, init) => {
  const target = url.host === 'upstream.test' ? new URL(url.pathname + url.search, upstream) : url
  const response = await fetch(target, init)
  const event = { host: url.host === 'upstream.test' ? 'netease-local' : url.host,
    path: url.pathname, httpStatus: response.status }
  if (response.headers.get('content-type')?.includes('json')) {
    try {
      const payload = await response.clone().json()
      event.providerCode = payload.code
      if (url.pathname.endsWith('/search/type')) {
        event.dataKeys = Object.keys(payload.data || {})
        event.resultCount = Array.isArray(payload.data?.result) ? payload.data.result.length : null
      }
    } catch { /* Original adapter records response failures. */ }
  }
  events.push(event)
  return response
}
try {
  for (const sample of samples) {
    events.length = 0
    gateway.orchestrator.resetSourceCircuit('api-enhanced'); gateway.orchestrator.resetSourceCircuit('bilibili')
    const headers = { 'X-API-Key': gateway.apiKey }
    const search = await gateway.request('/dreammusic/api/v2/search?' + new URLSearchParams({
      aggregate: 'true', merge: 'true', keywords: sample.keyword, limit: '10' }), { headers })
    const songs = search.body.groups?.flatMap(group => group.entries) || []
    const song = sample.id ? songs.find(song => song.sourceId === sample.id) : songs[0]
    if (!song) { console.log(JSON.stringify({ keyword: sample.keyword, status: 'catalog_search_failed', sources: search.body.sources, events })); continue }
    const began = Date.now()
    const result = await gateway.request('/dreammusic/api/v2/song/url/v1?' + new URLSearchParams({
      automatic: 'true', mediaRef: song.mediaRef, searchSession: search.body.searchSession }), { headers })
    const outcome = { keyword: sample.keyword, catalog: { source: song.source, id: song.sourceId,
      title: song.title, artists: song.artists, album: song.album.name, durationMs: song.durationMs },
      httpStatus: result.status, wallMs: Date.now() - began, catalogPreserved: result.body.catalogRef === song.mediaRef,
      playbackSource: result.body.playbackSource, audioIntegrity: result.body.audioIntegrity,
      playback: result.body.playback, events: [...events] }
    console.log(JSON.stringify(outcome))
  }
} finally { await gateway.close() }
