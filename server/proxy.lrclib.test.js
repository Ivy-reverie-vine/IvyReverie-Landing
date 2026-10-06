// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'
import { createMediaRef, parseMediaRef } from './mediaContract.js'

let gateway
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const ref = (id = '123', source = 'api-enhanced') => createMediaRef({ source, sourceId: id })
const row = (extra = {}) => ({ id: 42, trackName: '目录歌曲', artistName: '原歌手', albumName: '目录专辑',
  duration: 90, instrumental: false, syncedLyrics: '[00:01]第一句\n[00:02]第二句', plainLyrics: '第一句\n第二句', ...extra })
const request = (catalog = ref(), audio = catalog) => gateway.request('/dreammusic/api/v2/lyric/new?' +
  new URLSearchParams({ catalogRef: catalog, playbackRef: audio }), { headers: { 'X-API-Key': gateway.apiKey } })
beforeAll(async () => { gateway = await startIdentityGateway({ lrclib: true }) })
afterAll(async () => { await gateway.close() })
beforeEach(() => {
  gateway.orchestrator.searchSessions.clear()
  gateway.controls.calls.length = 0
  gateway.controls.beforeResponse = async () => {}
  gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new' ? json({ code: 200, lrc: { lyric: '' } })
    : url.hostname === 'lrclib.net' ? json(row()) : null
  gateway.orchestrator.lrclib.cache.clear()
  gateway.orchestrator.lrclib.timeoutMs = 300
  for (const source of gateway.orchestrator.registry.sources.values()) {
    source.adapter.clearCache?.(); source.timeoutMs = 300; gateway.orchestrator.registry.resetCircuit(source.id)
  }
})

describe('T12 real HTTP catalog → LRCLIB fallback', () => {
  it('treats Netease JSON credit headers without verses as missing and continues to LRCLIB', async () => {
    gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new'
      ? json({ code: 200, lrc: { lyric: '{"t":-1,"c":[{"tx":"作词: "},{"tx":"原歌手"}]}\n' } })
      : url.hostname === 'lrclib.net' ? json(row()) : null
    const { body } = await request()
    expect(body.lyricsSource).toBe('lrclib')
    expect(body.lyrics.catalogStatus).toBe('missing')
  })
  it('hydrates missing duration from the selected catalog detail before live-style LRCLIB lookup', async () => {
    gateway.controls.thirdPartyResponse = url => url.pathname === '/search'
      ? json({ code: 200, result: { songs: [{ ...gateway.song, dt: 0 }], more: false } })
      : url.pathname === '/lyric/new' ? json({ code: 200, lrc: { lyric: '' } })
        : url.hostname === 'lrclib.net' ? json(row()) : null
    const search = await gateway.request('/dreammusic/api/v2/search?aggregate=true&merge=true&keywords=目录',
      { headers: { 'X-API-Key': gateway.apiKey } })
    const selected = search.body.data.find(song => song.source === 'api-enhanced')
    expect(selected.durationMs).toBe(0)
    const result = await request(selected.mediaRef)
    expect(result.body.lyricsSource).toBe('lrclib')
    const lookup = gateway.controls.calls.find(url => url.hostname === 'lrclib.net')
    expect(lookup.searchParams.get('duration')).toBe('90')
    expect(gateway.controls.calls.filter(url => url.pathname === '/song/detail')).toHaveLength(1)
  })
  it('uses server catalog metadata in order and retains actual lyric identity', async () => {
    const { body } = await request()
    expect(body.lyrics).toMatchObject({ status: 'available', timeline: 'trusted', textType: 'synced',
      catalogStatus: 'missing', fallback: { implemented: true, attempted: true, status: 'available' } })
    expect(body.lyricsSource).toBe('lrclib')
    expect(parseMediaRef(body.lyricsRef)).toMatchObject({ source: 'lrclib', sourceId: '42' })
    expect(body.catalogRef).toBe(ref())
    const urls = gateway.controls.calls
    expect(urls.map(url => url.pathname)).toEqual(['/lyric/new', '/song/detail', '/api/get'])
    const query = Object.fromEntries(urls[2].searchParams)
    expect(query).toEqual({ track_name: '目录歌曲', artist_name: '原歌手', album_name: '目录专辑', duration: '90' })
    expect(query).not.toHaveProperty('cookie')
  })

  it('suitable original timed/plain/instrumental answers never query LRCLIB', async () => {
    for (const payload of [{ lrc: { lyric: '[00:01]原词' } }, { lrc: { lyric: '原文本' } }, { nolyric: true }]) {
      gateway.controls.calls.length = 0
      gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new' ? json({ code: 200, ...payload }) : null
      expect((await request()).body.lyrics.fallback).toMatchObject({ attempted: false, status: 'skipped' })
      expect(gateway.controls.calls).toHaveLength(1)
    }
  })

  it.each([
    [{ syncedLyrics: null }, 'available', 'uncertain', 'plain'],
    [{ syncedLyrics: null, plainLyrics: null, instrumental: true }, 'instrumental', 'none', 'instrumental'],
    [{ syncedLyrics: '[01:20]最后\n[00:01]倒序' }, 'available', 'uncertain', 'synced'],
  ])('preserves content type %j', async (extra, status, timeline, textType) => {
    gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new' ? json({ code: 200 })
      : url.hostname === 'lrclib.net' ? json(row(extra)) : null
    const { body } = await request()
    expect(body.lyrics).toMatchObject({ status, timeline, textType })
    expect(body.nolyric).toBe(status === 'instrumental')
  })

  it('recomputes cached text timing on audio changes and never uses video/uploader metadata', async () => {
    expect((await request()).body.lyrics.timeline).toBe('trusted')
    const audio = ref('BV1GJ411x7h7:222', 'bilibili')
    const result = (await request(ref(), audio)).body
    expect(result.lyrics.timeline).toBe('uncertain')
    expect(result.playbackRef).toBe(audio)
    expect(gateway.controls.calls.filter(url => url.hostname === 'lrclib.net')).toHaveLength(1)
    expect((await request(audio, audio)).body.lyrics.fallback.reason).toBe('catalog_metadata_unavailable')
    expect(gateway.controls.calls.some(url => url.hostname === 'api.bilibili.com')).toBe(false)
  })

  it('search validates title, artist, album, duration and ambiguity instead of choosing first', async () => {
    const rejected = [row({ trackName: '目录歌曲 (Live)' }), row({ artistName: '翻唱歌手' }),
      row({ albumName: '另一专辑' }), row({ duration: 30 }), row({ duration: undefined })]
    gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new' ? json({ code: 200 })
      : url.pathname === '/api/get' ? json({ name: 'TrackNotFound' }, 404)
        : url.pathname === '/api/search' ? json([...rejected, row()]) : null
    expect((await request()).body.lyricsSource).toBe('lrclib')
    gateway.orchestrator.lrclib.cache.clear()
    gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new' ? json({ code: 200 })
      : url.pathname === '/api/get' ? json(rejected[0])
        : url.pathname === '/api/search' ? json([row(), row({ id: 43 })]) : null
    expect((await request()).body.lyrics).toMatchObject({ status: 'missing', fallback: { reason: 'ambiguous_candidates' } })
  })

  it('all missing stays distinct from failed requests; failures are retryable and not cached', async () => {
    gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new' ? json({ code: 200 })
      : url.pathname === '/api/get' ? json({}, 404) : url.pathname === '/api/search' ? json([]) : null
    expect((await request()).body.lyrics.status).toBe('missing')
    gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new' ? json({ code: 200 })
      : url.hostname === 'lrclib.net' ? json({}, 429) : null
    expect((await request()).body.lyrics).toMatchObject({ status: 'failed', retryable: true })
    expect(gateway.orchestrator.lrclib.cache.size).toBe(0)
    gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new' ? json({ code: 200 })
      : url.hostname === 'lrclib.net' ? json(row()) : null
    expect((await request()).body.lyrics.status).toBe('available')
  })

  it('failed optional timing upgrade preserves original static text and exposes retry', async () => {
    gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new' ? json({ code: 200, lrc: { lyric: '[00:01]原词' } })
      : url.hostname === 'lrclib.net' ? json({}, 503) : null
    const { body } = await request(ref(), ref('qq', 'meting-tencent'))
    expect(body.lyrics).toMatchObject({ status: 'available', timeline: 'uncertain', retryable: true, fallback: { status: 'failed' } })
    expect(body.lrc.lyric).toBe('[00:01]原词')
    expect(body.lyricsSource).toBe('api-enhanced')
  })

  it('one LRCLIB deadline covers get and search while audio starts independently', async () => {
    gateway.orchestrator.lrclib.timeoutMs = 80
    gateway.controls.beforeResponse = url => url.hostname === 'lrclib.net' ? delay(50) : Promise.resolve()
    gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new' ? json({ code: 200 })
      : url.pathname === '/api/get' ? json({}, 404) : url.pathname === '/api/search' ? json([row()]) : null
    const pending = request()
    const audio = await gateway.request('/dreammusic/api/v2/song/url/v1?mediaRef=' + ref(), { headers: { 'X-API-Key': gateway.apiKey } })
    expect(audio.body.data[0].url).toBeTruthy()
    expect((await pending).body.lyrics).toMatchObject({ status: 'timeout', retryable: true })
    await delay(120)
    expect(gateway.orchestrator.lrclib.cache.size).toBe(0)
    expect(gateway.orchestrator.lrclib.inFlight).toBe(0)
  })

  it('disconnect aborts LRCLIB and late success cannot enter cache', async () => {
    let began, release, aborted = false
    const started = new Promise(resolve => { began = resolve })
    const gate = new Promise(resolve => { release = resolve })
    gateway.controls.beforeResponse = async (url, signal) => {
      if (url.hostname !== 'lrclib.net') return
      began(); signal.addEventListener('abort', () => { aborted = true }, { once: true }); await gate
    }
    const controller = new AbortController()
    const pending = fetch(gateway.base + '/dreammusic/api/v2/lyric/new?catalogRef=' + ref(), {
      headers: { 'X-API-Key': gateway.apiKey }, signal: controller.signal }).catch(error => error.name)
    await started; controller.abort(); expect(await pending).toBe('AbortError')
    for (let i = 0; i < 30 && !aborted; i++) await delay(10)
    release(); await delay(20)
    expect(aborted).toBe(true)
    expect(gateway.orchestrator.lrclib.cache.size).toBe(0)
    expect(gateway.orchestrator.lrclib.inFlight).toBe(0)
  })
})
