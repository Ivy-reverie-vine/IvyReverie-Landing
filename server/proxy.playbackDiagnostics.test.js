// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import express from 'express'
import {
  createPlaybackDiagnostics,
  DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL,
  DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT,
  DIAGNOSTIC_STAGE_URL_RESPONSE,
} from './playbackDiagnostics.js'
import { createProxyRouter } from './proxy.js'

const user = { id: 1, status: 'active', netease_cookie: 'MUSIC_U=server-secret', netease_invalid: 0 }
const users = {
  findByApiKey: () => user,
  markNeteaseInvalid: vi.fn(),
}
const auth = { currentUser: () => null }
const config = {
  allowed: new Set(['song/url/v1']),
  upstream: 'http://upstream.test',
  upstreamTimeoutMs: 20,
}
const diagnostics = createPlaybackDiagnostics()
const app = express()
app.use(express.json())
app.use('/dreammusic/api/v1', createProxyRouter({ users, auth, config, diagnostics }))
let server
let base

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  base = `http://127.0.0.1:${server.address().port}/dreammusic/api/v1`
})

afterEach(() => {
  diagnostics.clear()
  delete config.fetch
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

async function request(path) {
  const response = await fetch(`${base}${path}`, { headers: { 'X-API-Key': 'test-key' } })
  return { response, body: await response.json() }
}

describe('proxy playback diagnostics', () => {
  it('records an empty URL without retaining upstream secrets', async () => {
    config.fetch = async () => new Response(
      JSON.stringify({ code: 200, data: [{ url: '' }], cookie: 'MUSIC_U=upstream-secret' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )

    const result = await request('/song/url/v1?id=123')
    expect(result.response.status).toBe(200)
    expect(diagnostics.recent()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stage: DIAGNOSTIC_STAGE_URL_RESPONSE,
        ok: false,
        errorCategory: DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL,
      }),
    ]))
    expect(JSON.stringify(diagnostics.recent())).not.toContain('secret')
  })

  it('records a source timeout as a repeatable failure fixture', async () => {
    config.fetch = (_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    })

    const result = await request('/song/url/v1?id=456')
    expect(result.response.status).toBe(502)
    expect(diagnostics.recent()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ok: false,
        errorCategory: DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT,
      }),
    ]))
  })
})
