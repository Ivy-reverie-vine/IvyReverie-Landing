/** Opt-in live acceptance: real providers, production auth/router/adapters, disposable local DB. */
import express from 'express'
import { fork } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../server/config.js'
import { openDb, createUserStore } from '../server/db.js'
import { createSessionStore } from '../server/session.js'
import { createAuthRouter } from '../server/auth.js'
import { createConfiguredUpstreamFetcher, createProxyRouter } from '../server/proxy.js'
import { createMusicOrchestrator } from '../server/music/musicOrchestrator.js'
import { createPlaybackDiagnostics } from '../server/playbackDiagnostics.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
if (existsSync(join(root, 'music-test.env.local'))) process.loadEnvFile(join(root, 'music-test.env.local'))
const sources = (process.env.VERIFY_SOURCES || 'api-enhanced,meting-tencent,meting-kugou,meting-kuwo,audius').split(',')
const temp = mkdtempSync(join(tmpdir(), 'nightdream-source-qa-'))
const reportPath = resolve(root, process.env.VERIFY_REPORT || 'docs/evidence/music-sources-live.json')
const port = Number(process.env.VERIFY_PORT || 18001)
const metingPort = Number(process.env.VERIFY_METING_PORT || 18000)
const localMeting = !process.env.METING_API_URL
const token = process.env.METING_TOKEN || randomBytes(32).toString('hex')
let child, server, db
let closed = false
async function cleanup() {
  if (closed) return
  closed = true
  if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)) }
  if (child && child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)) }
  db?.close()
  // Only the unique directory created by this invocation is removed.
  if (dirname(temp) === tmpdir() && temp.startsWith(join(tmpdir(), 'nightdream-source-qa-'))) rmSync(temp, { recursive: true, force: true })
}
process.on('SIGINT', () => void cleanup().then(() => process.exit(0)))
process.on('SIGTERM', () => void cleanup().then(() => process.exit(0)))
process.stdin.on('data', data => {
  if (String(data).trim().toLowerCase() === 'q') void cleanup().then(() => process.exit(0))
})

async function mediaProbe(url, kind) {
  if (!url) return { status: 'unavailable' }
  let reader
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-65535' }, signal: AbortSignal.timeout(15000) })
    const mime = res.headers.get('content-type') || ''
    reader = res.body?.getReader()
    const chunks = []
    let bytes = 0
    while (reader && bytes < 65536) {
      const part = await reader.read()
      if (part.done) break
      chunks.push(Buffer.from(part.value)); bytes += part.value.length
    }
    const prefix = Buffer.concat(chunks).subarray(0, 16)
    const signature = kind === 'audio'
      ? prefix.subarray(0, 3).toString() === 'ID3' || (prefix[0] === 255 && (prefix[1] & 224) === 224) || ['fLaC', 'OggS', 'RIFF'].includes(prefix.subarray(0, 4).toString()) || prefix.subarray(4, 8).toString() === 'ftyp'
      : prefix[0] === 255 && prefix[1] === 216 || prefix.subarray(1, 4).toString() === 'PNG' || prefix.subarray(0, 4).toString() === 'RIFF'
    return { status: res.ok && bytes > 0 && signature ? 'passed' : 'failed', http: res.status, mime, bytes, signature }
  } catch (error) { return { status: 'failed', error: error.cause?.code || error.code || error.name } }
  finally { await reader?.cancel().catch(() => {}) }
}

try {
  if (localMeting) {
    child = fork(join(root, 'scripts/meting-runtime/server.mjs'), [], {
      cwd: root, env: { ...process.env, METING_TOKEN: token, METING_LOCAL_PORT: String(metingPort) }, stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
    })
    // Wait for this child's successful listen, never reuse another sidecar.
    await new Promise((resolveReady, reject) => {
      const timer = setTimeout(() => reject(new Error('Sidecar startup timeout')), 10000)
      child.once('error', reject)
      child.once('exit', () => { clearTimeout(timer); reject(new Error('Sidecar exited before ready')) })
      child.once('message', msg => { if (msg === 'ready') { clearTimeout(timer); resolveReady() } })
    })
  }
  const config = loadConfig({ ...process.env, DATA_DIR: temp, COOKIE_SECURE: 'false',
    UPSTREAM: process.env.UPSTREAM || 'http://127.0.0.1:3000',
    API_ENHANCED_SOURCE_ENABLED: 'true', AUDIUS_SOURCE_ENABLED: 'true', METING_SOURCE_ENABLED: 'true',
    METING_PLATFORMS: 'tencent,kugou,kuwo', METING_API_URL: localMeting ? `http://127.0.0.1:${metingPort}/api` : process.env.METING_API_URL,
    METING_TOKEN: token,
  })
  db = openDb(temp)
  const users = createUserStore(db)
  // This disposable account has no third-party credentials and cannot access the user's database.
  users.create('source-smoke', 'source-smoke-local')
  const user = users.findByUsername('source-smoke')
  const auth = createAuthRouter({ users, sessions: createSessionStore(config.sessionTtlMs), config })
  const diagnostics = createPlaybackDiagnostics()
  const musicOrchestrator = createMusicOrchestrator({ config, diagnostics, fetchUpstream: createConfiguredUpstreamFetcher(config) })
  const app = express()
  app.use(express.json())
  app.use('/dreammusic/api/v1/auth', auth.router)
  for (const apiVersion of ['v1', 'v2']) app.use(`/dreammusic/api/${apiVersion}`, createProxyRouter({ users, auth, config, diagnostics, musicOrchestrator, apiVersion }))
  app.use(express.static(join(root, 'dist')))
  app.get('/dreammusic', (_req, res) => res.sendFile(join(root, 'dist/index.html')))
  server = await new Promise((resolveServer, reject) => { const s = app.listen(port, '127.0.0.1', () => resolveServer(s)); s.once('error', reject) })
  const base = `http://127.0.0.1:${port}`
  async function api(path, query) {
    const r = await fetch(`${base}/dreammusic/api/v2/${path}?${new URLSearchParams(query)}`, { headers: { 'X-API-Key': user.api_key }, signal: AbortSignal.timeout(25000) })
    const b = await r.json()
    if (!r.ok || b.code !== 200) throw new Error(`HTTP ${r.status}: ${b.message || b.code}`)
    return b
  }
  const report = { date: new Date().toISOString(), mode: 'real providers / disposable unbound account', sources: [] }
  for (const source of sources) {
    const row = { source, samples: [] }
    report.sources.push(row)
    try {
      const keyword = process.env.VERIFY_KEYWORD || (source === 'audius' ? 'hello' : '童年')
      row.keyword = keyword
      const search = await api('search', { keywords: keyword, source, limit: '2' })
      row.search = { count: search.data.length, status: search.data.length ? 'passed' : 'empty' }
      for (const song of search.data.slice(0, 2)) {
        if (song.source !== source || !song.mediaRef) throw new Error('Source identity mismatch')
        const sample = { sourceId: song.sourceId, title: song.title, identity: 'passed' }
        row.samples.push(sample)
        const query = { mediaRef: song.mediaRef }
        try {
          const detail = await api('song/detail', query)
          sample.detail = { status: detail.data.length ? 'passed' : 'empty' }
          sample.cover = await mediaProbe(detail.data[0]?.album?.pictureUrl, 'image')
        } catch (e) { sample.detail = { status: 'failed', error: e.message } }
        try {
          const lyrics = await api('lyric/new', query)
          const text = lyrics.lrc?.lyric || lyrics.yrc?.lyric || ''
          sample.lyrics = { status: text ? 'passed' : 'empty', characters: text.length, timed: /\[\d/.test(text) }
        } catch (e) { sample.lyrics = { status: e.message.startsWith('HTTP 501') ? 'unsupported' : 'failed', error: e.message } }
        try {
          const playback = await api('song/url/v1', { ...query, level: 'standard' })
          const media = playback.data?.[0]
          sample.playback = { trial: !!media?.freeTrialInfo, durationMs: media?.time ?? null, level: media?.level ?? null }
          sample.audio = await mediaProbe(media?.url, 'audio')
        } catch (e) { sample.audio = { status: 'failed', error: e.message } }
        console.log(JSON.stringify({ source, ...sample }))
      }
    } catch (e) { row.error = e.message; console.log(source, e.message) }
  }
  mkdirSync(dirname(reportPath), { recursive: true })
  report.passed = report.sources.every(row => !row.error && row.search?.status === 'passed' && row.samples.length > 0 && row.samples.every(sample =>
    sample.detail?.status === 'passed' && sample.cover?.status === 'passed' && sample.audio?.status === 'passed' && ['passed', 'unsupported', 'empty'].includes(sample.lyrics?.status)))
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  console.log(`Report: ${reportPath}`)
  if (args.includes('--serve')) {
    console.log(`Browser QA: ${base}/dreammusic (disposable account: source-smoke / source-smoke-local). Enter q or Ctrl+C to clean up.`)
    await new Promise(() => {})
  }
  process.exitCode = report.passed ? 0 : 1
  process.stdin.pause()
} finally { await cleanup() }
