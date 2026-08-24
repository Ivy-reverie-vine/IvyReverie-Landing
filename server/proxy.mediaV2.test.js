// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import { createMediaRef, parseMediaRef } from './mediaContract.js'
import { createPlaybackDiagnostics } from './playbackDiagnostics.js'
import { createProxyRouter } from './proxy.js'

const user = { id: 1, status: 'active', netease_cookie: '', netease_invalid: 0 }
const users = { findByApiKey: () => user, markNeteaseInvalid: () => {} }
const auth = { currentUser: () => null }
const config = {
  allowed: new Set(['search', 'song/url/v1', 'lyric/new']),
  upstream: 'http://upstream.test',
  upstreamTimeoutMs: 100,
  mediaProxy: { enabled: false, publicBaseUrl: '' },
}
const diagnostics = createPlaybackDiagnostics()
const calls = []
const orchestrator = {
  supportsPath: (path) => ['search', 'song/url/v1', 'lyric/new'].includes(path),
  async dispatch(request) {
    calls.push({ type: 'dispatch', ...request })
    if (request.path === 'search') {
      return {
        status: 200,
        body: {
          code: 200,
          data: [{ source: 'audius', sourceId: 'track-1', title: 'Free song', artists: ['Artist'] }],
        },
      }
    }
    return { status: 200, body: { code: 200, data: [{ url: 'https://cdn.test/free.mp3' }] } }
  },
  async dispatchMediaRef(request) {
    calls.push({ type: 'dispatchMediaRef', ...request })
    const parsed = parseMediaRef(request.mediaRef)
    return {
      status: 200,
      body: request.path === 'song/url/v1'
        ? { code: 200, data: [{ url: `https://cdn.test/${parsed.sourceId}.mp3` }] }
        : { code: 200, lrc: { lyric: 'free lyrics' } },
    }
  },
}
const app = express()
app.use(express.json())
app.use('/dreammusic/api/v2', createProxyRouter({
  users, auth, config, diagnostics, musicOrchestrator: orchestrator, apiVersion: 'v2',
}))
let server
let base

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  base = `http://127.0.0.1:${server.address().port}/dreammusic/api/v2`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('versioned media API', () => {
  it('allows source-neutral search without a NetEase binding', async () => {
    const response = await fetch(`${base}/search?keywords=free`, { headers: { 'X-API-Key': 'test-key' } })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data[0].mediaRef).toBeTruthy()
    expect(parseMediaRef(body.data[0].mediaRef)).toMatchObject({
      source: 'audius', sourceId: 'track-1',
    })
  })

  it('dispatches playback by mediaRef and preserves it in the response', async () => {
    const mediaRef = createMediaRef({ source: 'audius', sourceId: 'track-1' })
    const response = await fetch(`${base}/song/url/v1?mediaRef=${encodeURIComponent(mediaRef)}`, {
      headers: { 'X-API-Key': 'test-key' },
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.mediaRef).toBe(mediaRef)
    expect(body.data[0].url).toBe('https://cdn.test/track-1.mp3')
    expect(calls.at(-1)).toMatchObject({ type: 'dispatchMediaRef', path: 'song/url/v1', mediaRef })
  })

  it('rejects metadata/playback calls without a mediaRef', async () => {
    const response = await fetch(`${base}/lyric/new`, { headers: { 'X-API-Key': 'test-key' } })
    expect(response.status).toBe(400)
  })
})
