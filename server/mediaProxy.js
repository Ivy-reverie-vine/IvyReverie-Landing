import { once } from 'node:events'
import { Readable } from 'node:stream'
import { Router } from 'express'

const RESPONSE_HEADERS = [
  'accept-ranges',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
]

function elapsed(startedAt) {
  return Math.max(0, Date.now() - startedAt)
}

async function pipeBody(body, res, onChunk) {
  if (!body) return res.end()
  const stream = Readable.fromWeb(body)
  stream.on('data', onChunk)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
  await once(stream, 'end')
}

/**
 * 短时签名媒体传输层。token 只引用服务端内存中的上游 URL，客户端永远看不到原始地址。
 */
export function createMediaProxyRouter({ store, config, diagnostics, fetchImpl = globalThis.fetch }) {
  const router = Router()
  router.get('/stream/:token', async (req, res) => {
    const reference = store.resolve(req.params.token)
    if (!reference) return res.status(404).json({ code: 404, message: '媒体引用已失效' })

    const startedAt = Date.now()
    const controller = new AbortController()
    let timer
    const resetTimeout = () => {
      clearTimeout(timer)
      timer = setTimeout(() => controller.abort(), Math.max(1, Number(config.timeoutMs || 15000)))
    }
    resetTimeout()
    let clientDisconnected = false
    const disconnect = () => { if (!res.writableEnded) { clientDisconnected = true; controller.abort() } }
    res.on('close', disconnect)
    const headers = { ...reference.headers }
    if (req.get('range')) headers.Range = req.get('range')
    if (req.get('if-range')) headers['If-Range'] = req.get('if-range')
    try {
      const upstream = await fetchImpl(reference.upstreamUrl, {
        method: 'GET',
        headers,
        redirect: 'follow',
        signal: controller.signal,
      })
      resetTimeout()
      for (const name of RESPONSE_HEADERS) {
        const value = upstream.headers?.get?.(name)
        if (value) res.setHeader(name, value)
      }
      diagnostics.record({
        source: 'media-proxy',
        capability: 'playback',
        stage: 'media_transport',
        durationMs: elapsed(startedAt),
        ok: upstream.ok || upstream.status === 206,
        ...((upstream.ok || upstream.status === 206) ? {} : { errorCategory: 'media_upstream_failure' }),
      })
      res.status(upstream.status)
      await pipeBody(upstream.body, res, resetTimeout)
    } catch (error) {
      const timedOut = controller.signal.aborted || error?.name === 'AbortError'
      diagnostics.record({
        source: 'media-proxy',
        capability: 'playback',
        stage: 'media_transport',
        durationMs: elapsed(startedAt),
        ok: false,
        errorCategory: clientDisconnected ? 'media_client_cancelled' : timedOut ? 'media_upstream_timeout' : 'media_upstream_failure',
      })
      if (!clientDisconnected && !res.headersSent) res.status(timedOut ? 504 : 502).json({ code: timedOut ? 504 : 502, message: '媒体上游不可达' })
    } finally {
      clearTimeout(timer)
      res.off('close', disconnect)
    }
  })
  return router
}
