import { describe, expect, it } from 'vitest'
import { AudiusAdapter } from './audiusAdapter.js'

const track = {
  id: 'audius-1',
  title: 'Open Track',
  duration: 123,
  isStreamable: true,
  downloadable: true,
  isStreamGated: false,
  license: 'CC BY',
  artwork: { _480x480: 'https://img.test/cover.jpg' },
  user: { name: 'Open Artist' },
}

function jsonResponse(payload) {
  return {
    ok: true,
    status: 200,
    url: 'https://api.audius.co/v1/test',
    headers: { get: () => null },
    json: async () => payload,
  }
}

describe('AudiusAdapter', () => {
  it('uses a provider-declared artwork mirror when the primary image host fails TLS', async () => {
    const calls = []
    const adapter = new AudiusAdapter({ baseUrl: 'https://api.audius.co/v1', minRequestIntervalMs: 0,
      fetchImpl: async (url, init) => {
        if (init.method === 'HEAD') {
          calls.push(String(url))
          if (new URL(url).hostname === 'broken.test') throw new TypeError('TLS error')
          return new Response(null, { headers: { 'content-type': 'image/jpeg' } })
        }
        return jsonResponse({ data: { ...track, artwork: { '480x480': 'https://broken.test/content/cid/480x480.jpg', mirrors: ['https://mirror.test'] } } })
      },
    })
    const result = await adapter.request({ path: 'song/detail', query: { id: track.id } })
    expect(result.body.data[0].album.pictureUrl).toBe('https://mirror.test/content/cid/480x480.jpg')
    expect(calls).toHaveLength(2)
  })

  it('accepts real REST snake_case fields for playable tracks and artwork', async () => {
    const adapter = new AudiusAdapter({ baseUrl: 'https://api.audius.co/v1', minRequestIntervalMs: 0,
      fetchImpl: async (url) => new URL(url).pathname.endsWith('/stream')
        ? { ok: true, url: 'https://cdn.test/song.mp3', body: { cancel: async () => {} } }
        : jsonResponse({ data: { id: 'live-1', title: 'Live', is_streamable: true, is_stream_gated: false, is_downloadable: true, artwork: { '480x480': 'https://images.test/cover.jpg' } } }),
    })
    const detail = await adapter.request({ path: 'song/detail', query: { id: 'live-1' } })
    expect(detail.body.data[0]).toMatchObject({ album: { pictureUrl: 'https://images.test/cover.jpg' }, rights: { streamable: true, downloadable: true } })
    const stream = await adapter.request({ path: 'song/url/v1', query: { id: 'live-1' } })
    expect(stream.body.data[0].url).toBe('https://cdn.test/song.mp3')
  })

  it('normalizes search metadata and preserves rights information', async () => {
    const requests = []
    const adapter = new AudiusAdapter({
      baseUrl: 'https://api.audius.co/v1',
      apiKey: 'server-api-key',
      bearerToken: 'server-bearer-token',
      minRequestIntervalMs: 0,
      fetchImpl: async (url, init) => {
        requests.push({ url: new URL(url), init })
        return jsonResponse({ data: [track] })
      },
    })

    const result = await adapter.request({ path: 'search', query: { keywords: 'Open Track' } })

    expect(result.body.data[0]).toMatchObject({
      source: 'audius',
      sourceId: 'audius-1',
      title: 'Open Track',
      artists: ['Open Artist'],
      durationMs: 123000,
      rights: { license: 'CC BY', downloadable: true, streamable: true },
    })
    expect(result.body.data[0].album.pictureUrl).toContain('cover.jpg')
    expect(requests[0].url.pathname).toBe('/v1/tracks/search')
    expect(requests[0].init.headers).toEqual({
      'x-api-key': 'server-api-key',
      Authorization: 'Bearer server-bearer-token',
    })
  })

  it('caches stream URLs briefly and reparses after expiry', async () => {
    let now = 1000
    let streamCalls = 0
    const adapter = new AudiusAdapter({
      baseUrl: 'https://api.audius.co/v1',
      cacheTtlMs: 100,
      minRequestIntervalMs: 0,
      now: () => now,
      fetchImpl: async (url) => {
        if (new URL(url).pathname.endsWith('/stream')) {
          streamCalls += 1
          return { ok: true, status: 200, url: `https://cdn.test/track-${streamCalls}.mp3`, headers: { get: () => null } }
        }
        return jsonResponse({ data: track })
      },
    })

    const first = await adapter.request({ path: 'song/url/v1', query: { id: 'audius-1' } })
    const second = await adapter.request({ path: 'song/url/v1', query: { id: 'audius-1' } })
    now = 1201
    const third = await adapter.request({ path: 'song/url/v1', query: { id: 'audius-1' } })

    expect(first.body.data[0].url).toContain('track-1')
    expect(second.body.data[0].url).toContain('track-1')
    expect(third.body.data[0].url).toContain('track-2')
    expect(streamCalls).toBe(2)
  })

  it('rejects tracks that are not streamable', async () => {
    const adapter = new AudiusAdapter({
      baseUrl: 'https://api.audius.co/v1',
      minRequestIntervalMs: 0,
      fetchImpl: async () => jsonResponse({ data: { ...track, isStreamable: false } }),
    })

    await expect(adapter.request({ path: 'song/url/v1', query: { id: 'blocked' } }))
      .rejects.toMatchObject({ code: 'NO_PLAYBACK' })
  })
})
