// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'

let gateway
const json = body => new Response(JSON.stringify(body))
beforeAll(async () => { gateway = await startIdentityGateway({ mediaProxy: true }) })
afterAll(async () => { await gateway.close() })
beforeEach(() => {
  gateway.users.setNeteaseCookie(gateway.userId, 'MUSIC_U=controlled')
  gateway.controls.beforeResponse = async () => {}
  gateway.controls.calls.length = 0
  gateway.orchestrator.searchSessions.clear()
  for (const source of gateway.orchestrator.registry.sources.values()) {
    source.enabled = true; source.inFlight = 0; source.timeoutMs = 1000
    source.adapter.clearCache?.(); gateway.orchestrator.resetSourceCircuit(source.id)
    if (source.adapter.minRequestIntervalMs !== undefined) source.adapter.minRequestIntervalMs = 0
  }
  gateway.controls.thirdPartyResponse = url => {
    if (url.searchParams.get('type') === 'search') return json([{ id: 'selected', name: gateway.song.name,
      artist: ['原歌手'], album: '目录专辑', duration: 90 }])
    if (url.searchParams.get('type') === 'song') return json([{ id: 'selected', duration: 90 }])
    if (url.searchParams.get('type') === 'url') return json({ url: 'https://audio.test/selected.mp3', durationMs: 90000, isPreview: false })
    if (url.hostname === 'audio.test') return new Response('audio', { status: 206,
      headers: { 'content-type': 'audio/mpeg', 'content-range': 'bytes 0-4/90', 'accept-ranges': 'bytes' } })
    return null
  }
})
const request = (path, params) => gateway.request('/dreammusic/api/v2/' + path + '?' + new URLSearchParams(params),
  { headers: { 'X-API-Key': gateway.apiKey } })
async function selection() {
  const { body } = await request('search', { aggregate: 'true', merge: 'true', keywords: '目录' })
  const catalogRef = body.data.find(row => row.source === 'api-enhanced').mediaRef
  const mediaRef = body.data.find(row => row.source === 'meting-tencent').mediaRef
  return { manual: 'true', mediaRef, catalogRef, searchSession: body.searchSession }
}

describe('T14 shared source controls across playback chains', () => {
  it.each(['disabled', 'saturated', 'circuit'])('%s gates automatic, manual, recovery and lyrics independently', async control => {
    const selected = await selection()
    const { body: playing } = await request('song/url/v1', selected)
    const source = gateway.orchestrator.registry.get('meting-tencent')
    if (control === 'disabled') source.enabled = false
    if (control === 'saturated') source.inFlight = source.maxConcurrent
    if (control === 'circuit') source.openUntilMs = Date.now() + 30000
    gateway.controls.calls.length = 0
    expect((await request('song/url/v1', selected)).body.errorCode).toBe('SOURCE_UNAVAILABLE')
    expect((await request('song/url/v1', { recover: 'true', mediaRef: playing.playbackRef,
      recoveryToken: playing.recoveryToken })).body.errorCode).toBe('SOURCE_UNAVAILABLE')
    expect((await request('lyric/new', { mediaRef: selected.mediaRef, catalogRef: selected.mediaRef,
      playbackRef: selected.mediaRef })).body.lyrics.status).toBe('unavailable')
    // Other sources and legacy NetEase remain playable while the controlled source is gated.
    const automatic = await request('song/url/v1', { automatic: 'true', mediaRef: selected.catalogRef,
      searchSession: selected.searchSession })
    expect(automatic.body.playback.status).toBe('success')
    expect(automatic.body.playbackSource).not.toBe(source.id)
    expect(gateway.controls.calls.some(url => url.searchParams.get('server') === 'tencent')).toBe(false)
    const legacy = await gateway.request('/dreammusic/api/v1/song/url/v1?id=123',
      { headers: { 'X-API-Key': gateway.apiKey } })
    expect(legacy.body.data[0].url).toContain('/dreammusic/media/stream/')
  })

  it('manual and refreshed resources use the media proxy with Range and transport failures', async () => {
    const selected = await selection()
    const { body: initial } = await request('song/url/v1', selected)
    const { body: refreshed } = await request('song/url/v1', { recover: 'true', mediaRef: initial.playbackRef,
      recoveryToken: initial.recoveryToken })
    expect(refreshed.playbackRef).toBe(initial.playbackRef)
    expect(refreshed.data[0].url).not.toBe(initial.data[0].url)
    for (const body of [initial, refreshed]) {
      const response = await fetch(body.data[0].url, { headers: { Range: 'bytes=0-4' } })
      expect(response.status).toBe(206); expect(await response.text()).toBe('audio')
      expect(response.headers.get('content-range')).toBe('bytes 0-4/90')
    }
    gateway.controls.thirdPartyResponse = url => url.hostname === 'audio.test'
      ? new Response('', { status: 410 }) : null
    expect((await fetch(refreshed.data[0].url)).status).toBe(410)
    expect(refreshed.audioIntegrity.status).toBe('full') // resolution and media transport are distinct
  })

  it('provider throttling still serializes a manual choice and an exact-resource refresh', async () => {
    const selected = await selection()
    const { body: initial } = await request('song/url/v1', selected)
    const source = gateway.orchestrator.registry.get('meting-tencent')
    source.adapter.clearCache(); source.adapter.minRequestIntervalMs = 35
    const starts = []
    gateway.controls.beforeResponse = url => {
      if (url.searchParams.get('server') === 'tencent') starts.push(Date.now())
      return Promise.resolve()
    }
    const results = await Promise.all([
      request('song/url/v1', selected),
      request('song/url/v1', { recover: 'true', mediaRef: initial.playbackRef, recoveryToken: initial.recoveryToken }),
    ])
    expect(results.every(result => result.body.audioIntegrity.status === 'full')).toBe(true)
    expect(starts.length).toBeGreaterThanOrEqual(2)
    for (let index = 1; index < starts.length; index++) expect(starts[index] - starts[index - 1]).toBeGreaterThanOrEqual(30)
    expect(source.inFlight).toBe(0)
  })
})
