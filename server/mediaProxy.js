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

async function pipeBody(body, res) {
  if (!body) return res.end()
  const stream = Readable.fromWeb(body)
  stream.on('error', () => res.destroy())
  stream.pipe(res)
  await once(stream, 'end').catch(() => {})
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
    const timer = setTimeout(() => controller.abort(), Math.max(1, Number(config.timeoutMs || 15000)))
    const headers = {}
    if (req.get('range')) headers.Range = req.get('range')
    if (req.get('if-range')) headers['If-Range'] = req.get('if-range')
    try {
      const upstream = await fetchImpl(reference.upstreamUrl, {
        method: 'GET',
        headers,
        redirect: 'follow',
        signal: controller.signal,
      })
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
      await pipeBody(upstream.body, res)
    } catch (error) {
      const timedOut = controller.signal.aborted || error?.name === 'AbortError'
      diagnostics.record({
        source: 'media-proxy',
        capability: 'playback',
        stage: 'media_transport',
        durationMs: elapsed(startedAt),
        ok: false,
        errorCategory: timedOut ? 'media_upstream_timeout' : 'media_upstream_failure',
      })
      if (!res.headersSent) res.status(timedOut ? 504 : 502).json({ code: timedOut ? 504 : 502, message: '媒体上游不可达' })
    } finally {
      clearTimeout(timer)
    }
  })
  return router
}
