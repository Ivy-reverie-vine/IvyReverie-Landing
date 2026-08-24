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
