// Read-only HTTP relay for native-device acceptance. Credentials and media URLs are never recorded.
import http from 'node:http'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const upstream = new URL(process.env.DEVICE_GATEWAY_UPSTREAM || 'http://127.0.0.1:5187')
if (!['127.0.0.1', 'localhost'].includes(upstream.hostname) || upstream.protocol !== 'http:') {
  throw new Error('The relay requires a loopback HTTP gateway')
}
const output = resolve(process.env.DEVICE_GATEWAY_REPORT || 'docs/evidence/issue35-native-gateway.json')
const report = { capturedAt: new Date().toISOString(), boundary: 'Native HAP requests through a transparent loopback relay; real providers, no response substitution.', requests: [] }
const safeEntry = e => ({ mediaRef: e.mediaRef, source: e.source, sourceId: e.sourceId, title: e.title,
  artists: e.artists, durationMs: e.durationMs })
const server = http.createServer((req, res) => {
  const started = Date.now()
  const pathname = new URL(req.url, upstream).pathname
  const record = { capturedAt: new Date().toISOString(), method: req.method,
    path: pathname.startsWith('/dreammusic/media/') ? '/dreammusic/media/[resource]' : pathname }
  const target = http.request(new URL(req.url, upstream), { method: req.method,
    headers: { ...req.headers, host: upstream.host } }, response => {
    res.writeHead(response.statusCode, response.headers)
    const chunks = []; let bytes = 0
    const isContract = pathname.startsWith('/dreammusic/api/v2/')
    response.on('data', chunk => {
      if (isContract && bytes <= 1024 * 1024) chunks.push(chunk)
      bytes += chunk.length
    })
    response.on('end', () => {
      record.httpStatus = response.statusCode
      record.elapsedMs = Date.now() - started
      if (isContract && bytes <= 1024 * 1024) {
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString())
          record.code = body.code
          record.catalogRef = body.catalogRef; record.playbackRef = body.playbackRef
          record.lyricsRef = body.lyricsRef; record.playbackSource = body.playbackSource
          record.lyricsSource = body.lyricsSource
          if (body.audioIntegrity) record.audioIntegrity = { status: body.audioIntegrity.status,
            reason: body.audioIntegrity.reason, evidence: body.audioIntegrity.evidence }
          if (body.playback) record.playback = { status: body.playback.status, reason: body.playback.reason,
            elapsedMs: body.playback.elapsedMs,
            candidates: body.playback.bilibili?.candidates?.map(c => ({ ...safeEntry(c), reason: c.reason })) }
          if (body.manualSelection) record.manualSelection = { mode: body.manualSelection.mode,
            entry: safeEntry(body.manualSelection.entry || {}) }
          if (body.sources) record.sources = body.sources.map(s => ({ source: s.source, status: s.status, errorCode: s.errorCode }))
          if (body.groups) record.groups = body.groups.map(g => ({ id: g.id, reason: g.reason, entries: g.entries.map(safeEntry) }))
          if (body.lyrics) record.lyrics = body.lyrics
          if (body.lrc) record.lyricCharacters = body.lrc.lyric?.length || 0
        } catch { record.contractParseFailed = true }
      }
      // Authentication routes record status only. Query strings, request bodies and headers are excluded.
      report.requests.push(record)
      writeFileSync(output, JSON.stringify(report, null, 2) + '\n')
    })
    response.pipe(res)
  })
  target.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
  req.pipe(target)
})
server.listen(Number(process.env.DEVICE_GATEWAY_PORT || 5188), '127.0.0.1', () => console.log('Native acceptance relay ready'))
process.on('SIGINT', () => server.close(() => process.exit(0)))
process.on('SIGTERM', () => server.close(() => process.exit(0)))
