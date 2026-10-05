// Real gateway/auth/SQLite/orchestration; only third-party requests are controlled.
import express from 'express'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename, resolve } from 'node:path'
import { openDb, createUserStore } from '../db.js'
import { createSessionStore } from '../session.js'
import { createAuthRouter } from '../auth.js'
import { loadConfig } from '../config.js'
import { createProxyRouter, createConfiguredUpstreamFetcher } from '../proxy.js'
import { createMusicOrchestrator } from '../music/musicOrchestrator.js'
import { MetingAdapter } from '../music/sources/metingAdapter.js'
import { createPlaybackDiagnostics } from '../playbackDiagnostics.js'
import { MediaReferenceStore } from '../mediaReference.js'
import { createMediaProxyRouter } from '../mediaProxy.js'

export async function startIdentityGateway({ bilibili = false, mediaProxy = false, mediaTtlMs = 30000, lrclib = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'dreammusic-identity-'))
  const db = openDb(dir)
  const users = createUserStore(db)
  const controls = { beforeResponse: async () => {}, thirdPartyResponse: () => null,
    emptyUrl: false, failure: false, lyricsFailure: false, calls: [] }
  const song = { id: 123, name: '目录歌曲', ar: [{ name: '原歌手' }],
    al: { name: '目录专辑', picUrl: 'https://cover.test/catalog.jpg' }, dt: 90000 }
  const json = (body, status = 200) => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })
  const config = loadConfig({ DATA_DIR: dir, UPSTREAM: 'http://upstream.test', REGISTER_CODE: 'identity-test',
    BILIBILI_SOURCE_ENABLED: String(bilibili), MEDIA_PROXY_ENABLED: String(mediaProxy), MEDIA_PROXY_TTL_MS: String(mediaTtlMs) })
  config.fetch = async (input, init) => {
    const url = new URL(input)
    controls.calls.push(url)
    await controls.beforeResponse(url, init?.signal)
    const controlled = await controls.thirdPartyResponse(url, init)
    if (controlled) return controlled
    const path = url.pathname
    if (path === '/search') return json({ code: 200, result: { songs: [song], more: false } })
    if (path === '/song/detail') return json({ code: 200, songs: [{ ...song, id: Number(url.searchParams.get('ids') || song.id) }] })
    if (path === '/song/url/v1') return controls.failure ? json({ code: 503 }, 503)
      : json({ code: 200, data: [{ id: Number(url.searchParams.get('id') || 123), url: controls.emptyUrl ? '' : 'https://audio.test/123.mp3', time: 90000, freeTrialInfo: null }] })
    if (path === '/lyric/new') return controls.lyricsFailure ? json({ code: 502 }, 502)
      : json({ code: 200, lrc: { lyric: '[00:01]目录歌词' } })
    if (path === '/login/qr/check') return json({ code: 803, cookie: 'MUSIC_U=controlled; Path=/; HttpOnly' })
    if (path === '/user/account') return json({ code: 200, profile: { userId: 123 } })
    return json({ code: 200 })
  }
  const diagnostics = createPlaybackDiagnostics()
  const orchestrator = createMusicOrchestrator({ config, diagnostics, fetchUpstream: createConfiguredUpstreamFetcher(config) })
  if (!lrclib) orchestrator.lrclib = null // T01–T11 tests isolate their existing provider boundary
  for (const platform of ['tencent', 'kugou']) {
    const adapter = new MetingAdapter({ platform, baseUrl: 'http://meting.test/', minRequestIntervalMs: 0,
      fetchImpl: async (input, init) => {
        const url = new URL(input)
        controls.calls.push(url)
        await controls.beforeResponse(url, init?.signal)
        const controlled = await controls.thirdPartyResponse(url)
        if (controlled) return controlled
        const type = url.searchParams.get('type')
        if (type === 'url') return json({ url: 'https://audio.test/qq-001.mp3', durationMs: 90000, isPreview: false })
        if (type === 'lrc') return json({ lyric: '[00:01]QQ歌词' })
        if (type === 'song') return json([{ id: url.searchParams.get('id'), name: 'QQ目录', artist: ['QQ歌手'], duration: 90 }])
        return json([{ id: 'qq-001', name: 'QQ目录', artist: ['QQ歌手'], pic: 'https://cover.test/qq.jpg', duration: 90 }])
      } })
    orchestrator.registry.register(adapter, { priority: 10, capabilities: platform === 'kugou'
      ? ['search', 'detail', 'playback'] : adapter.capabilities() })
  }
  const auth = createAuthRouter({ users, sessions: createSessionStore(60000), config })
  const app = express()
  const mediaReferences = new MediaReferenceStore({ ttlMs: config.mediaProxy.ttlMs })
  app.use(express.json())
  app.use('/dreammusic/api/v1/auth', auth.router)
  for (const apiVersion of ['v1', 'v2']) app.use(`/dreammusic/api/${apiVersion}`,
    createProxyRouter({ users, auth, config, diagnostics, musicOrchestrator: orchestrator, apiVersion,
      mediaReferences: mediaProxy ? mediaReferences : null }))
  if (mediaProxy) app.use('/dreammusic/media', createMediaProxyRouter({ store: mediaReferences,
    config: config.mediaProxy, diagnostics, fetchImpl: config.fetch }))
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)) })
  const base = `http://127.0.0.1:${server.address().port}`
  async function request(path, { headers = {}, body, method = body ? 'POST' : 'GET' } = {}) {
    const response = await fetch(base + path, { method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined })
    return { status: response.status, body: await response.json(), headers: response.headers }
  }
  try {
    await request('/dreammusic/api/v1/auth/register', { body: {
      username: 'identity-user', password: 'identity-password', inviteCode: 'identity-test',
    } })
    const login = await request('/dreammusic/api/v1/auth/login', { body: {
      username: 'identity-user', password: 'identity-password',
    } })
    if (login.status !== 200) throw new Error('Identity fixture login failed')
    const cookie = login.headers.get('set-cookie').split(';')[0]
    const key = await request('/dreammusic/api/v1/auth/api-key', { headers: { Cookie: cookie } })
    const apiKey = key.body.data.apiKey
    return { app, base, request, controls, song, orchestrator, users, config, diagnostics,
      userId: users.findByUsername('identity-user').id, cookie, apiKey, close }
  } catch (error) { await close(); throw error }
  async function close() {
    await new Promise(resolve => server.close(resolve))
    db.close()
    const target = resolve(dir)
    if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('dreammusic-identity-')) {
      throw new Error('Unexpected identity fixture cleanup path')
    }
    rmSync(target, { recursive: true, force: true })
  }
}
