// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'
import { createMediaRef } from './mediaContract.js'
import { resolveCatalogLyrics } from './music/catalogLyrics.js'

let gateway
const json = body => new Response(JSON.stringify(body))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
beforeAll(async () => { gateway = await startIdentityGateway() })
afterAll(async () => { await gateway.close() })
beforeEach(() => {
  gateway.controls.calls.length = 0
  gateway.controls.beforeResponse = async () => {}
  gateway.controls.thirdPartyResponse = () => null
  for (const source of gateway.orchestrator.registry.sources.values()) {
    source.adapter.clearCache?.()
    gateway.orchestrator.registry.resetCircuit(source.id)
    source.timeoutMs = 300
  }
})
const headers = () => ({ 'X-API-Key': gateway.apiKey })
const ref = (source, sourceId) => createMediaRef({ source, sourceId })
const catalogRef = ref('api-enhanced', '123')
const qqRef = ref('meting-tencent', 'qq-001')
const lyricPath = (catalog = catalogRef, audio = catalog) => '/dreammusic/api/v2/lyric/new?' +
  new URLSearchParams({ mediaRef: catalog, catalogRef: catalog, playbackRef: audio, id: 'wrong-audio-id' })
const request = (catalog, audio) => gateway.request(lyricPath(catalog, audio), { headers: headers() })

describe('T11 catalog lyrics through actual HTTP/auth/SQLite/adapters', () => {
  it('search → cross-platform full audio → original catalog lyrics; timing is independent', async () => {
    gateway.controls.thirdPartyResponse = url => {
      if (url.searchParams.get('type') === 'search') return json([{ id: 'qq-001', name: gateway.song.name,
        artist: ['原歌手'], album: '目录专辑', duration: 90 }])
      if (url.pathname === '/song/url/v1') return json({ code: 200, data: [{ id: 123, url: '' }] })
      return null
    }
    const search = (await gateway.request('/dreammusic/api/v2/search?aggregate=true&merge=true&keywords=目录',
      { headers: headers() })).body
    const catalog = search.groups[0].entries.find(song => song.source === 'api-enhanced')
    const audio = (await gateway.request('/dreammusic/api/v2/song/url/v1?' + new URLSearchParams({
      automatic: 'true', mediaRef: catalog.mediaRef, searchSession: search.searchSession,
    }), { headers: headers() })).body
    expect(audio.playback.status).toBe('success')
    expect(audio.playbackSource).toBe('meting-tencent')
    gateway.controls.calls.length = 0
    const { body } = await request(audio.catalogRef, audio.playbackRef)
    expect(body).toMatchObject({ lyricsRef: catalog.mediaRef, lyricsSource: 'api-enhanced',
      playbackRef: audio.playbackRef, lrc: { lyric: '[00:01]目录歌词' },
      lyrics: { status: 'available', timeline: 'uncertain', fallback: { implemented: false } } })
    expect(gateway.controls.calls).toHaveLength(1)
    expect(gateway.controls.calls[0].pathname).toBe('/lyric/new')
    expect(gateway.controls.calls[0].searchParams.get('id')).toBe('123')
    expect([...gateway.controls.calls[0].searchParams.keys()]).not.toContain('playbackRef')
    expect((await request(catalog.mediaRef)).body.lyrics.timeline).toBe('trusted')
    // Timing is recomputed with cached provider text; another resource cannot inherit it.
    expect((await request(qqRef)).body.lyrics.timeline).toBe('trusted')
    expect((await request(qqRef, catalogRef)).body.lyrics.timeline).toBe('uncertain')
  })

  it('Bilibili audio and different IDs use only the original platform; plain text is static', async () => {
    gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new'
      ? json({ code: 200, lrc: { lyric: '第一句\n第二句' } }) : null
    for (const audio of [ref('bilibili', 'BV1GJ411x7h7:222'), ref('api-enhanced', '456')]) {
      const { body } = await request(catalogRef, audio)
      expect(body.lyrics).toMatchObject({ status: 'available', timeline: 'uncertain', reason: 'plain_text' })
      expect(body.lyricsSource).toBe('api-enhanced')
    }
    expect(gateway.controls.calls.every(url => url.host === 'upstream.test' && url.searchParams.get('id') === '123')).toBe(true)
  })

  it.each([
    [{ code: 200, lrc: { lyric: '' } }, 'missing'],
    [{ code: 200, nolyric: true, lrc: { lyric: '[00:00]instrumental' } }, 'instrumental'],
    [{ code: 301 }, 'failed'],
    [{ code: 503 }, 'failed'],
  ])('preserves empty/instrumental/failure semantics without rebind or another provider', async (body, status) => {
    gateway.controls.thirdPartyResponse = url => url.pathname === '/lyric/new' ? json(body) : null
    const result = await request(catalogRef, qqRef)
    expect(result.status).toBe(200)
    expect(result.body.lyrics.status).toBe(status)
    expect(result.body.lyrics.fallback).toMatchObject({ implemented: false, eligible: status !== 'instrumental' })
    expect(result.body.lrc.lyric).toBe('')
    expect(gateway.users.findByApiKey(gateway.apiKey).netease_invalid).toBe(0)
    expect(gateway.controls.calls).toHaveLength(1)
    expect((await gateway.request('/dreammusic/api/v2/song/url/v1?mediaRef=' + qqRef,
      { headers: headers() })).body.data[0].url).toBeTruthy()
  })

  it('unsupported and disabled catalogs return explicit fallback states without querying audio', async () => {
    expect((await request(ref('meting-kugou', 'hash'), qqRef)).body.lyrics.status).toBe('unsupported')
    gateway.orchestrator.registry.setEnabled('meting-tencent', false)
    expect((await request(qqRef, catalogRef)).body.lyrics.status).toBe('unavailable')
    gateway.orchestrator.registry.setEnabled('meting-tencent', true)
    expect(gateway.controls.calls).toHaveLength(0)
    const invalid = await gateway.request(lyricPath().replace('playbackRef=', 'playbackRef=broken'), { headers: headers() })
    expect(invalid.status).toBe(400)
  })

  it('slow lyrics cannot delay an independent audio request; timeout releases the source', async () => {
    gateway.orchestrator.registry.get('api-enhanced').timeoutMs = 60
    gateway.controls.beforeResponse = url => url.pathname === '/lyric/new' ? delay(200) : Promise.resolve()
    const pending = request(catalogRef, qqRef)
    const audio = await gateway.request('/dreammusic/api/v2/song/url/v1?mediaRef=' + qqRef, { headers: headers() })
    expect(audio.body.data[0].url).toBeTruthy()
    expect((await pending).body.lyrics.status).toBe('timeout')
    expect(gateway.orchestrator.registry.get('api-enhanced').inFlight).toBe(0)
    await delay(220)
  })

  it('disconnect cancels upstream without a circuit failure or a stale Meting cache', async () => {
    let began, aborted = 0
    const started = new Promise(resolve => { began = resolve })
    gateway.controls.beforeResponse = (url, signal) => {
      began()
      return new Promise((_, reject) => signal.addEventListener('abort', () => {
        aborted++; reject(new Error('cancelled'))
      }, { once: true }))
    }
    const controller = new AbortController()
    const promise = fetch(gateway.base + lyricPath(qqRef, catalogRef), { headers: headers(), signal: controller.signal })
    const rejected = promise.catch(error => error.name)
    await started
    controller.abort()
    expect(await rejected).toBe('AbortError')
    for (let i = 0; i < 30 && !aborted; i++) await delay(10)
    expect(aborted).toBe(1)
    const source = gateway.orchestrator.registry.get('meting-tencent')
    expect(source.inFlight).toBe(0)
    expect(source.failureStreak).toBe(0)
    expect(source.adapter.cache.size).toBe(0)
    const cancelled = new AbortController(); cancelled.abort()
    expect((await resolveCatalogLyrics(gateway.orchestrator, { catalogRef, signal: cancelled.signal })).body.lyrics.status).toBe('cancelled')
  })
})
