// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createMediaRef, parseMediaRef } from './mediaContract.js'
import { startIdentityGateway } from './test-support/identityGateway.js'

let gateway
beforeAll(async () => { gateway = await startIdentityGateway() })
afterAll(async () => { await gateway?.close() })
beforeEach(() => {
  gateway.controls.emptyUrl = false
  gateway.controls.failure = false
  gateway.controls.calls.length = 0
  gateway.orchestrator.registry.setEnabled('meting-tencent', true)
  gateway.orchestrator.registry.resetCircuit('api-enhanced')
})
const request = (path, headers = { 'X-API-Key': gateway.apiKey }) => gateway.request(path, { headers })

describe('T01 identity through the real HTTP gateway and orchestration', () => {
  for (const source of ['api-enhanced', 'meting-tencent']) {
    it(`${source}: search → detail → audio → lyrics carries concrete role references`, async () => {
      const search = await request(`/dreammusic/api/v2/search?keywords=目录&source=${source}`)
      expect(search.status).toBe(200)
      const song = search.body.data[0]
      expect(parseMediaRef(song.mediaRef)).toMatchObject({ source })
      expect(song.catalogRef).toBe(song.mediaRef)
      expect(song.playbackRef).toBe(song.mediaRef)
      expect(song.lyricsRef).toBe(song.mediaRef)
      const detail = await request(`/dreammusic/api/v2/song/detail?mediaRef=${song.catalogRef}&ids=wrong-id`)
      expect(detail.body.data[0].catalogRef).toBe(song.catalogRef)
      expect(detail.body.data[0].title).toBe(song.title)
      const audio = await request(`/dreammusic/api/v2/song/url/v1?mediaRef=${song.playbackRef}&id=wrong-id&source=wrong-source`)
      expect(audio.status).toBe(200)
      expect(audio.body).toMatchObject({ catalogRef: song.catalogRef,
        playbackRef: song.playbackRef, lyricsRef: song.lyricsRef, playbackSource: source })
      expect(audio.body.data[0].url).toBeTruthy()
      const lyrics = await request(`/dreammusic/api/v2/lyric/new?mediaRef=${audio.body.lyricsRef}`)
      expect(lyrics.status).toBe(200)
      expect(lyrics.body).toMatchObject({ lyricsRef: song.lyricsRef, lyricsSource: source })
      expect(lyrics.body.lrc.lyric).toBeTruthy()
      for (const call of gateway.controls.calls) {
        expect(call.searchParams.get('id')).not.toBe('wrong-id')
        expect(call.searchParams.get('ids')).not.toBe('wrong-id')
      }
    })
  }

  it('keeps v1 binding, session/API-key auth, QR cookie stripping and response shape', async () => {
    expect((await request('/dreammusic/api/v2/search?keywords=a', {})).status).toBe(401)
    expect((await request('/dreammusic/api/v2/search?keywords=a', { 'X-API-Key': 'invalid' })).status).toBe(401)
    expect((await request('/dreammusic/api/v1/search?keywords=a')).status).toBe(403)
    const bound = await request('/dreammusic/api/v1/login/qr/check?key=controlled', { Cookie: gateway.cookie })
    expect(bound.status).toBe(200)
    expect(bound.body.cookie).toBeUndefined()
    const search = await request('/dreammusic/api/v1/search?keywords=a')
    expect(search.body).toEqual({ code: 200, result: { songs: [gateway.song], more: false } })
    const audio = await request('/dreammusic/api/v1/song/url/v1?id=123', { Cookie: gateway.cookie })
    expect(audio.body).toMatchObject({ code: 200, data: [{ id: 123, url: 'https://audio.test/123.mp3' }],
      audioIntegrity: { status: 'full' } })
    expect(gateway.controls.calls.findLast(call => call.pathname === '/song/url/v1').searchParams.get('cookie'))
      .toBe('MUSIC_U=controlled')
    gateway.users.markNeteaseInvalid(gateway.userId)
    expect((await request('/dreammusic/api/v1/search?keywords=a')).body.code).toBe(301)
    gateway.users.setNeteaseCookie(gateway.userId, '')
  })

  it('rejects missing, malformed, empty and unsupported references with machine-readable errors', async () => {
    const invalid = ['', 'broken', createMediaRef({ source: '', sourceId: '1' }),
      createMediaRef({ source: 'api-enhanced', sourceId: '' }),
      createMediaRef({ source: 'api-enhanced', sourceId: '1', kind: 'video' })]
    for (const mediaRef of invalid) {
      const response = await request(`/dreammusic/api/v2/song/url/v1?mediaRef=${mediaRef}`)
      expect(response.status).toBe(400)
      expect(response.body.errorCode).toBe(mediaRef ? 'INVALID_MEDIA_REF' : 'MEDIA_REF_REQUIRED')
    }
    const unavailable = await request(`/dreammusic/api/v2/lyric/new?mediaRef=${createMediaRef({ source: 'unknown', sourceId: '1' })}`)
    expect(unavailable.status).toBe(503)
    expect(unavailable.body.errorCode).toBe('SOURCE_UNAVAILABLE')
    const unsupported = await request(`/dreammusic/api/v2/lyric/new?mediaRef=${createMediaRef({ source: 'meting-kugou', sourceId: '1' })}`)
    expect(unsupported.status).toBe(501)
    expect(unsupported.body.errorCode).toBe('CAPABILITY_UNSUPPORTED')
    expect(gateway.controls.calls).toHaveLength(0)
  })

  it('does not silently change source on an empty URL, upstream failure or disabled source', async () => {
    const search = await request('/dreammusic/api/v2/search?keywords=a&source=api-enhanced')
    const mediaRef = search.body.data[0].playbackRef
    for (const failure of [false, true]) {
      gateway.controls.emptyUrl = !failure
      gateway.controls.failure = failure
      const audio = await request(`/dreammusic/api/v2/song/url/v1?mediaRef=${mediaRef}`)
      expect(audio.status).toBe(failure ? 503 : 200)
      expect(audio.body.playbackRef).toBe(mediaRef)
      expect(audio.body.data?.[0]?.url || '').toBe('')
    }
    gateway.orchestrator.registry.setEnabled('meting-tencent', false)
    const response = await request(`/dreammusic/api/v2/song/url/v1?mediaRef=${createMediaRef({ source: 'meting-tencent', sourceId: 'qq-001' })}`)
    expect(response.status).toBe(503)
    expect(gateway.controls.calls.every(call => call.host === 'upstream.test')).toBe(true)
  })

  it('rejects unimplemented cross-resource combinations before calling third parties', async () => {
    const ref = createMediaRef({ source: 'api-enhanced', sourceId: '123' })
    const other = createMediaRef({ source: 'meting-tencent', sourceId: 'qq-001' })
    const response = await request(`/dreammusic/api/v2/song/url/v1?mediaRef=${ref}&catalogRef=${other}`)
    expect(response.status).toBe(400)
    expect(response.body.errorCode).toBe('IDENTITY_UNSUPPORTED')
    expect(gateway.controls.calls).toHaveLength(0)
  })
})
