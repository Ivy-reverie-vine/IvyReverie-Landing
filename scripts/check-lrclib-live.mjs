// Small live public LRCLIB sample via real local business HTTP/auth/SQLite.
// Catalog details and original-platform missing lyrics are controlled; LRCLIB is live.
import { writeFileSync } from 'node:fs'
import { startIdentityGateway } from '../server/test-support/identityGateway.js'
import { createMediaRef } from '../server/mediaContract.js'

const samples = [
  { title: 'Never Gonna Give You Up', artist: 'Rick Astley', album: 'Whenever You Need Somebody', duration: 213 },
  { title: '晴天', artist: '周杰伦', album: '叶惠美', duration: 269 },
  { title: '七里香', artist: '周杰伦', album: '七里香', duration: 299 },
  { title: 'DreamMusic LRCLIB nonexistent sample 20261005', artist: 'DreamMusic Test', album: 'Synthetic Missing Probe', duration: 90, synthetic: true },
]
const gateway = await startIdentityGateway({ lrclib: true })
const records = [], responses = []
try {
  gateway.controls.thirdPartyResponse = async (url, init) => {
    if (url.pathname === '/lyric/new') return new Response(JSON.stringify({ code: 200, lrc: { lyric: '' } }))
    if (url.hostname !== 'lrclib.net') return null
    const started = Date.now()
    const response = await fetch(url, init)
    const data = await response.clone().json()
    responses.push({ endpoint: url.pathname, httpStatus: response.status, elapsedMs: Date.now() - started,
      query: Object.fromEntries(url.searchParams), candidates: (Array.isArray(data) ? data.slice(0, 10) : [data]).map(row => ({
        id: row.id, title: row.trackName, artist: row.artistName, album: row.albumName, duration: row.duration,
        instrumental: row.instrumental, hasSynced: !!row.syncedLyrics, hasPlain: !!row.plainLyrics,
      })) })
    return response
  }
  let id = 1000
  for (const sample of samples) {
    gateway.song.name = sample.title; gateway.song.ar = [{ name: sample.artist }]
    gateway.song.al.name = sample.album; gateway.song.dt = sample.duration * 1000
    const catalogRef = createMediaRef({ source: 'api-enhanced', sourceId: String(id++) })
    const started = Date.now(), startIndex = responses.length
    const { status, body } = await gateway.request('/dreammusic/api/v2/lyric/new?' + new URLSearchParams({ catalogRef }),
      { headers: { 'X-API-Key': gateway.apiKey } })
    const record = { sample, businessHttpStatus: status, elapsedMs: Date.now() - started,
      status: body.lyrics.status, source: body.lyricsSource, textType: body.lyrics.textType || 'none',
      timeline: body.lyrics.timeline, fallback: body.lyrics.fallback, publicResponses: responses.slice(startIndex) }
    records.push(record)
    console.log(JSON.stringify({ title: sample.title, status: record.status, textType: record.textType, elapsedMs: record.elapsedMs }))
  }
  const evidence = { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()), timezone: 'Asia/Shanghai', capturedAt: new Date().toISOString(),
    boundary: 'Real business HTTP/auth/SQLite and live LRCLIB. Catalog metadata and original missing lyrics controlled; no real audio/device or coverage claim.', records }
  const output = process.argv[2]
  if (output) writeFileSync(output, JSON.stringify(evidence, null, 2) + '\n')
} finally { await gateway.close() }
