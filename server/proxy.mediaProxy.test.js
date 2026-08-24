// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import { createPlaybackDiagnostics } from './playbackDiagnostics.js'
import { MediaReferenceStore } from './mediaReference.js'
import { createProxyRouter } from './proxy.js'

const user = { id: 1, status: 'active', netease_cookie: 'MUSIC_U=server-secret', netease_invalid: 0 }
const users = { findByApiKey: () => user, markNeteaseInvalid: () => {} }
const auth = { currentUser: () => null }
const config = {
  allowed: new Set(['song/url/v1']),
  upstream: 'http://upstream.test',
  upstreamTimeoutMs: 100,
  mediaProxy: { enabled: true, publicBaseUrl: 'https://music.test' },
}
const diagnostics = createPlaybackDiagnostics()
const mediaReferences = new MediaReferenceStore({ secret: 'proxy-test-secret', ttlMs: 1000 })
const app = express()
app.use(express.json())
app.use('/dreammusic/api/v1', createProxyRouter({ users, auth, config, diagnostics, mediaReferences }))
let server
let base

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  base = `http://127.0.0.1:${server.address().port}/dreammusic/api/v1`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('proxy media reference integration', () => {
  it('replaces a direct playback URL only when the media proxy is enabled', async () => {
    config.fetch = async () => new Response(
      JSON.stringify({ code: 200, data: [{ url: 'https://cdn.test/original.mp3?sig=secret' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )

    const response = await fetch(`${base}/song/url/v1?id=123`, { headers: { 'X-API-Key': 'test-key' } })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.data[0].url).toBe('https://music.test/dreammusic/media/stream/' + body.data[0].url.split('/').pop())
    expect(body.data[0].url).not.toContain('cdn.test')
  })

  it('falls back to the direct URL when the media proxy is disabled', async () => {
    config.mediaProxy.enabled = false
    config.fetch = async () => new Response(
      JSON.stringify({ code: 200, data: [{ url: 'https://cdn.test/direct.mp3' }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )

    const response = await fetch(`${base}/song/url/v1?id=124`, { headers: { 'X-API-Key': 'test-key' } })
    const body = await response.json()
    config.mediaProxy.enabled = true

    expect(body.data[0].url).toBe('https://cdn.test/direct.mp3')
  })
})
