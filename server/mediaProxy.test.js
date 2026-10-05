// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import { createServer } from 'node:http'
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

  it.each([false, true])('uses idle deadlines for a real streaming response (stalled=%s)', async stalled => {
    const upstream = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'audio/mp4' })
      res.write('a')
      let chunks = 0
      const interval = setInterval(() => {
        res.write('a'); chunks++
        if (chunks === 8) { clearInterval(interval); res.end() }
      }, stalled ? 300 : 40)
      res.on('close', () => clearInterval(interval))
    })
    await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
    const localStore = new MediaReferenceStore()
    const localApp = express()
    localApp.use(createMediaProxyRouter({ store: localStore, config: { timeoutMs: 150 }, diagnostics }))
    const proxy = await new Promise(resolve => { const instance = localApp.listen(0, '127.0.0.1', () => resolve(instance)) })
    try {
      const token = localStore.issue({ userId: 1, upstreamUrl: `http://127.0.0.1:${upstream.address().port}/audio` })
      const response = await fetch(`http://127.0.0.1:${proxy.address().port}/stream/${token}`)
      if (stalled) await expect(response.text()).rejects.toThrow()
      else expect(await response.text()).toBe('aaaaaaaaa')
    } finally {
      await new Promise(resolve => proxy.close(resolve))
      await new Promise(resolve => upstream.close(resolve))
    }
  })
})
