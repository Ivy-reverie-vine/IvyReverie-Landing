// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { createMediaRef, parseMediaRef, toMediaV2Body } from './mediaContract.js'

describe('versioned mediaRef contract', () => {
  it('creates an opaque, versioned reference', () => {
    const mediaRef = createMediaRef({ source: 'audius', sourceId: 'track-1' })

    expect(mediaRef).not.toContain('track-1')
    expect(parseMediaRef(mediaRef)).toEqual({
      version: 1,
      source: 'audius',
      sourceId: 'track-1',
      kind: 'song',
    })
  })

  it('rejects malformed or unsupported references', () => {
    expect(parseMediaRef('not-a-media-ref')).toBeNull()
    expect(parseMediaRef(Buffer.from(JSON.stringify({
      version: 2, source: 'audius', sourceId: 'track-1', kind: 'song',
    })).toString('base64url'))).toBeNull()
  })

  it('normalizes api-enhanced search results without leaking the raw response', () => {
    const body = toMediaV2Body('search', {
      code: 200,
      result: {
        more: true,
        songs: [{
          id: 123,
          name: 'Test song',
          ar: [{ name: 'Artist' }],
          al: { name: 'Album', picUrl: 'https://cover.test/album.jpg' },
          dt: 187000,
        }],
      },
    })

    expect(body).toEqual({
      code: 200,
      hasMore: true,
      data: [{
        mediaRef: expect.any(String),
        catalogRef: expect.any(String),
        playbackRef: expect.any(String),
        lyricsRef: expect.any(String),
        playbackSource: 'api-enhanced',
        lyricsSource: 'api-enhanced',
        source: 'api-enhanced',
        sourceId: '123',
        legacyId: 123,
        title: 'Test song',
        versionTags: [],
        artists: ['Artist'],
        album: { name: 'Album', pictureUrl: 'https://cover.test/album.jpg' },
        durationMs: 187000,
      }],
    })
    expect(body.result).toBeUndefined()
  })

  it('keeps source identity on normalized internal records', () => {
    const body = toMediaV2Body('search', {
      code: 200,
      data: [{
        source: 'audius',
        sourceId: 'track-1',
        title: 'Free song',
        artists: ['Artist'],
        album: { pictureUrl: 'https://cover.test/free.jpg' },
      }],
    })

    expect(body.data[0].mediaRef).toBeTruthy()
    expect(parseMediaRef(body.data[0].mediaRef)).toMatchObject({
      source: 'audius',
      sourceId: 'track-1',
    })
  })
})
