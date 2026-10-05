// T15: production gateway/adapters and browser player; no provider response fixtures.
import express from 'express'
import { fork, spawn } from 'node:child_process'
import { randomBytes, createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { loadConfig } from '../server/config.js'
import { openDb, createUserStore } from '../server/db.js'
import { createSessionStore } from '../server/session.js'
import { createAuthRouter } from '../server/auth.js'
import { createConfiguredUpstreamFetcher, createProxyRouter } from '../server/proxy.js'
import { createMusicOrchestrator } from '../server/music/musicOrchestrator.js'
import { createPlaybackDiagnostics } from '../server/playbackDiagnostics.js'
import { MediaReferenceStore } from '../server/mediaReference.js'
import { createMediaProxyRouter } from '../server/mediaProxy.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temp = mkdtempSync(join(tmpdir(), 'nightdream-matching-live-'))
const output = resolve(root, process.env.LIVE_MATCHING_REPORT || 'docs/evidence/issue34-live.json')
const samples = [
  { key: 'full', keyword: 'Kevin MacLeod', id: '33984241' },
  { key: 'trial', keyword: 'Never Gonna Give You Up Rick Astley', id: '18520488' },
  { key: 'lyrics', keyword: '晴天 周杰伦', id: '2652820720' },
]
const report = { capturedAt: new Date().toISOString(), timezone: 'Asia/Shanghai',
  boundary: 'Live providers; disposable unbound local account; production gateway/player. Range is not completeness.',
  configuration: { sources: ['api-enhanced', 'meting-tencent', 'meting-kugou', 'bilibili'],
    totalBudgetMs: 10000, bilibiliReserveMs: 3000 }, scenarios: [], http: [], browser: [], media: [] }
let db, sidecar, server, vite, closed = false
const selected = new Map()
function save() { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n') }
async function close() {
  if (closed) return
  closed = true
  save()
  await vite?.close()
  if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)) }
  if (sidecar && sidecar.exitCode === null) { sidecar.kill(); await new Promise(r => sidecar.once('exit', r)) }
  db?.close()
  if (dirname(temp) !== resolve(tmpdir()) || !temp.startsWith(join(tmpdir(), 'nightdream-matching-live-'))) throw new Error('Unexpected cleanup path')
  rmSync(temp, { recursive: true, force: true })
}
process.on('SIGINT', () => void close().then(() => process.exit(0)))
process.on('SIGTERM', () => void close().then(() => process.exit(0)))
process.stdin.on('data', data => { if (String(data).trim() === 'q') void close().then(() => process.exit(0)) })

try {
  const token = randomBytes(32).toString('hex')
  sidecar = fork(join(root, 'scripts/meting-runtime/server.mjs'), [], { env: { ...process.env,
    METING_TOKEN: token, METING_LOCAL_PORT: '30328' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  await new Promise((ready, reject) => {
    const timer = setTimeout(() => reject(new Error('Sidecar startup timeout')), 10000)
    sidecar.once('message', message => { if (message === 'ready') { clearTimeout(timer); ready() } })
    sidecar.once('error', error => { clearTimeout(timer); reject(error) })
    sidecar.once('exit', () => { clearTimeout(timer); reject(new Error('Sidecar exited')) })
  })
  const config = loadConfig({ DATA_DIR: temp, UPSTREAM: process.env.LIVE_NETEASE_UPSTREAM || 'http://127.0.0.1:30325',
    COOKIE_SECURE: 'false', METING_SOURCE_ENABLED: 'true', METING_PLATFORMS: 'tencent,kugou',
    METING_API_URL: 'http://127.0.0.1:30328/api', METING_TOKEN: token,
    BILIBILI_SOURCE_ENABLED: 'true', MEDIA_PROXY_ENABLED: 'true' })
  config.fetch = async (input, init) => {
    const url = new URL(input), began = Date.now()
    const event = { host: ['127.0.0.1', 'localhost'].includes(url.hostname) ? 'local-provider' : url.hostname,
      path: url.hostname === 'api.bilibili.com' || url.hostname === 'lrclib.net' || ['127.0.0.1', 'localhost'].includes(url.hostname)
        ? url.pathname : '[media path redacted]', method: init?.method || 'GET' }
    try {
      const response = await fetch(input, init)
      event.httpStatus = response.status
      if (response.headers.get('content-type')?.includes('json')) {
        const body = await response.clone().json().catch(() => ({}))
        event.providerCode = body.code
        if (url.pathname.endsWith('/search/type')) { event.dataKeys = Object.keys(body.data || {}); event.resultCount = body.data?.result?.length ?? null }
      }
      return response
    } catch (error) { event.error = error.cause?.code || error.name; throw error }
    finally { event.elapsedMs = Date.now() - began; report.http.push(event) }
  }
  db = openDb(temp)
  const users = createUserStore(db)
  users.create('matching-live', 'matching-live-local')
  const user = users.findByUsername('matching-live')
  const auth = createAuthRouter({ users, sessions: createSessionStore(config.sessionTtlMs), config })
  const diagnostics = createPlaybackDiagnostics()
  const orchestrator = createMusicOrchestrator({ config, diagnostics, fetchUpstream: createConfiguredUpstreamFetcher(config) })
  const references = new MediaReferenceStore({ ttlMs: config.mediaProxy.ttlMs })
  const app = express()
  app.use(express.json({ limit: '64kb' }))
  app.use('/dreammusic/api/v1/auth', auth.router)
  for (const apiVersion of ['v1', 'v2']) app.use(`/dreammusic/api/${apiVersion}`,
    createProxyRouter({ users, auth, config, diagnostics, musicOrchestrator: orchestrator, apiVersion, mediaReferences: references }))
  app.use('/dreammusic/media', createMediaProxyRouter({ store: references, config: config.mediaProxy, diagnostics, fetchImpl: config.fetch }))
  app.get('/test/samples', (_req, res) => res.json(samples))
  app.get('/test/select/:key', async (req, res) => {
    const sample = samples.find(item => item.key === req.params.key)
    if (!sample) return res.sendStatus(404)
    try {
      const began = Date.now()
      const search = await api('search', { aggregate: 'true', merge: 'true', keywords: sample.keyword, limit: '10' })
      const catalog = search.groups?.flatMap(group => group.entries).find(item => item.source === 'api-enhanced' && item.sourceId === sample.id)
      if (!catalog) throw new Error('Fixed catalog ID absent from real search')
      const started = Date.now()
      const body = await api('song/url/v1', { automatic: 'true', mediaRef: catalog.mediaRef, searchSession: search.searchSession })
      const lyrics = await api('lyric/new', { catalogRef: catalog.mediaRef, playbackRef: body.playbackRef || catalog.mediaRef })
      const record = { key: sample.key, capturedAt: new Date().toISOString(),
        catalog: { mediaRef: catalog.mediaRef, source: catalog.source, sourceId: catalog.sourceId, title: catalog.title,
          artists: catalog.artists, album: catalog.album.name, searchDurationMs: catalog.durationMs },
        searchMs: started - began, sources: search.sources, groups: search.groups.map(group => ({
          id: group.id, entries: group.entries.map(entry => ({ source: entry.source, sourceId: entry.sourceId,
            mediaRef: entry.mediaRef, title: entry.title, artists: entry.artists, album: entry.album.name, durationMs: entry.durationMs })) })),
        catalogRef: body.catalogRef, playbackRef: body.playbackRef, playbackSource: body.playbackSource,
        audioIntegrity: body.audioIntegrity, playback: body.playback,
        lyrics: { state: lyrics.lyrics, source: lyrics.lyricsSource, ref: lyrics.lyricsRef,
          characters: lyrics.lrc?.lyric?.length || 0 } }
      report.scenarios.push(record); selected.set(sample.key, { body, catalog, searchSession: search.searchSession }); save()
      res.json({ catalog, body, record })
    } catch (error) {
      const record = { key: sample.key, error: error.message }; report.scenarios.push(record); save()
      res.status(502).json({ record })
    }
  })
  app.post('/test/manual/:key', async (req, res) => {
    const prior = selected.get(req.params.key)
    const candidate = prior?.body.playback?.bilibili?.candidates?.find(item => item.mediaRef === req.body.mediaRef)
    if (!candidate) return res.sendStatus(400)
    try {
      const began = Date.now()
      const body = await api('song/url/v1', { manual: 'other',
        catalogRef: prior.catalog.mediaRef, mediaRef: candidate.mediaRef, searchSession: prior.searchSession })
      const record = { key: req.params.key, mode: 'manual_other_recording', selectedSourceId: candidate.sourceId,
        capturedAt: new Date().toISOString(), elapsedMs: Date.now() - began, catalogRef: body.catalogRef,
        playbackRef: body.playbackRef, lyricsRef: body.lyricsRef, playbackSource: body.playbackSource,
        audioIntegrity: body.audioIntegrity, manualSelection: body.manualSelection }
      report.scenarios.push(record); save(); res.json({ body, record })
    } catch (error) { const record = { key: req.params.key, mode: 'manual_other_recording', error: error.message }; report.scenarios.push(record); save(); res.status(502).json({ record }) }
  })
  app.post('/test/browser', (req, res) => {
    // Whitelist only native media state. Never store a source URL, cookies or recoveryToken.
    const { key, event, time, duration, paused, ended, readyState, error, sinceSelectionMs, sinceHandoffMs } = req.body
    if (!samples.some(sample => sample.key === key) || !['playing', 'progress', 'error', 'pause', 'ended'].includes(event)) return res.sendStatus(400)
    report.browser.push({ key, event, time, duration, paused, ended, readyState, error, sinceSelectionMs,
      sinceHandoffMs, capturedAt: new Date().toISOString() })
    save(); res.sendStatus(204)
  })
  app.post('/test/full-media/:key', async (req, res) => {
    const sample = selected.get(req.params.key), url = sample?.body.data?.[0]?.url
    if (!url || sample.body.audioIntegrity?.status !== 'full') return res.sendStatus(409)
    const began = Date.now(), hash = createHash('sha256'); let bytes = 0, httpStatus
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90000) })
      httpStatus = response.status
      if (response.status !== 200 || !response.body) throw new Error('Complete GET requires HTTP 200')
      const file = join(temp, 'complete-media.bin'), chunks = []
      for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 32 * 1024 * 1024) throw new Error('Media exceeds test size bound'); hash.update(chunk); chunks.push(chunk) }
      writeFileSync(file, Buffer.concat(chunks))
      const decode = await new Promise(resolveDecode => {
        const child = spawn('ffmpeg', ['-v', 'error', '-xerror', '-i', file, '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
        let errors = ''; const timer = setTimeout(() => child.kill(), 60000)
        child.stderr.on('data', data => { errors += data.toString() })
        child.once('error', () => { clearTimeout(timer); resolveDecode({ status: 'unavailable' }) })
        child.once('exit', code => { clearTimeout(timer); resolveDecode({ status: code === 0 && !errors ? 'passed' : 'failed', exitCode: code }) })
      })
      const record = { key: req.params.key, kind: 'complete_get_and_decode', httpStatus: response.status,
        bytes, contentLength: Number(response.headers.get('content-length')) || null,
        sha256: hash.digest('hex'), elapsedMs: Date.now() - began, decode }
      report.media.push(record); save(); rmSync(file, { force: true }); res.json(record)
    } catch (error) { const record = { key: req.params.key, kind: 'complete_get_and_decode', status: 'failed', httpStatus, bytes, error: error.cause?.code || error.name }; report.media.push(record); save(); res.status(502).json(record) }
  })
  app.post('/test/shutdown', (_req, res) => { res.end('stopping'); setTimeout(() => void close().then(() => process.exit(0)), 100) })
  server = await new Promise((ready, reject) => { const s = app.listen(0, '127.0.0.1', () => ready(s)); s.once('error', reject) })
  const base = `http://127.0.0.1:${server.address().port}`
  async function api(path, params) {
    const response = await fetch(`${base}/dreammusic/api/v2/${path}?${new URLSearchParams(params)}`,
      { headers: { 'X-API-Key': user.api_key }, signal: AbortSignal.timeout(25000) })
    const body = await response.json()
    if (!response.ok) throw new Error(`Business HTTP ${response.status}`)
    return body
  }
  vite = await createServer({ server: { port: 5187, host: '127.0.0.1', strictPort: true,
    proxy: Object.fromEntries(['/test', '/dreammusic/api', '/dreammusic/media'].map(path => [path, { target: base, changeOrigin: true }])) } })
  await vite.listen(); save()
  console.log('Live matching: http://127.0.0.1:5187/server/test-support/matching-live.html (q to stop)')
} catch (error) { console.error(error.message); await close(); process.exitCode = 1 }
