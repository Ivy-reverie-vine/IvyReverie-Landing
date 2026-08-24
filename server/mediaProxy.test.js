// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import { createPlaybackDiagnostics } from './playbackDiagnostics.js'
import { MediaReferenceStore } from './mediaReference.js'
import { createMediaProxyRouter } from './mediaProxy.js'

const diagnostics = createPlaybackDiagnostics()
const store = new MediaReferenceStore({ secret: 'media-test-secret', ttlMs: 1000 })
const calls = []
const app = express()
app.use('/dreammusic/media', createMediaProxyRouter({
  store,
  config: { timeoutMs: 50 },
  diagnostics,
  fetchImpl: async (url, init) => {
    calls.push({ url, init })
    return {
      ok: true,
      status: 206,
      headers: new Headers({
        'content-type': 'audio/mpeg',
        'content-length': '5',
        'content-range': 'bytes 0-4/100',
        'accept-ranges': 'bytes',
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('audio'))
          controller.close()
        },
      }),
    }
  },
}))
let server
let base

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  base = `http://127.0.0.1:${server.address().port}/dreammusic/media`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('media proxy', () => {
  it('forwards Range and compatible media headers without leaking the upstream URL', async () => {
    const token = store.issue({ userId: 1, upstreamUrl: 'https://cdn.test/private?token=secret' })
    const response = await fetch(`${base}/stream/${token}`, { headers: { Range: 'bytes=0-4' } })
    const body = await response.text()

    expect(response.status).toBe(206)
    expect(response.headers.get('content-type')).toBe('audio/mpeg')
    expect(response.headers.get('content-range')).toBe('bytes 0-4/100')
    expect(body).toBe('audio')
    expect(calls[0].url).toContain('cdn.test/private')
    expect(calls[0].init.headers.Range).toBe('bytes=0-4')
    expect(JSON.stringify(diagnostics.recent())).not.toContain('secret')
  })

  it('returns 404 for an invalid media reference', async () => {
    const response = await fetch(`${base}/stream/not-a-valid-token`)

    expect(response.status).toBe(404)
  })
})
