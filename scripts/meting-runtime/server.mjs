/** Local JSON sidecar for NightDream's MetingAdapter; raw provider data stays on loopback. */
import { createServer } from 'node:http'
import { createHmac, timingSafeEqual } from 'node:crypto'
import Meting from '@meting/core'
import { preserveRecordingEvidence } from './recording-evidence.mjs'

const port = Number(process.env.METING_LOCAL_PORT || 8000)
const token = process.env.METING_TOKEN
if (!token) throw new Error('Meting sidecar requires a server-side signing token')
const platforms = new Set(['tencent', 'kugou', 'kuwo'])
let active = 0

function json(res, status, body) {
  if (res.destroyed || res.writableEnded) return
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  if (req.method !== 'GET') return json(res, 405, { message: 'GET required' })
  if (url.pathname === '/health') return json(res, 200, { service: 'nightdream-local-meting', version: Meting.prototype.VERSION || '1.6.1' })
  if (url.pathname !== '/api') return json(res, 404, { message: 'Not found' })
  const platform = url.searchParams.get('server')
  const type = url.searchParams.get('type')
  const id = url.searchParams.get('id') || ''
  if (!platforms.has(platform) || !['search', 'song', 'url', 'lrc', 'pic'].includes(type) || !id.trim() || id.length > 512) {
    return json(res, 400, { message: 'Invalid server/type/id' })
  }
  if (['url', 'lrc', 'pic'].includes(type)) {
    const auth = url.searchParams.get('auth') || ''
    const expected = createHmac('sha1', token).update(`${platform}${type}${id}`).digest('hex')
    if (!/^[a-f0-9]{40}$/.test(auth) || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
      return json(res, 401, { message: 'Invalid signature' })
    }
  }
  if (active >= 4) return json(res, 429, { message: 'Meting sidecar busy' })
  active += 1
  const timer = setTimeout(() => {
    console.error(`[meting] ${platform} ${type}: provider timed out`)
    json(res, 504, { message: 'Music provider timed out' })
  }, 6500)
  let failureReason = 'PROVIDER_RESPONSE_INVALID'
  const meting = preserveRecordingEvidence(new Meting(platform)).format(true)
  try {
    const cookie = process.env[`METING_COOKIE_${platform.toUpperCase()}`]
    if (cookie) meting.cookie(cookie)
    const boundedInt = (name, fallback, max) => {
      const value = Number(url.searchParams.get(name) || fallback)
      return Number.isInteger(value) && value > 0 ? Math.min(value, max) : fallback
    }
    const raw = type === 'search'
      ? await meting.search(id, { page: boundedInt('page', 1, 1000), limit: boundedInt('limit', 20, 100) })
      : type === 'song' ? await meting.song(id)
        : type === 'lrc' ? await meting.lyric(id)
          : type === 'pic' ? await meting.pic(id, 300) : await meting.url(id, 320)
    if (meting.error || meting.info?.statusCode >= 400) {
      failureReason = meting.error ? 'PROVIDER_NETWORK_ERROR' : 'PROVIDER_HTTP_ERROR'
      throw new Error('Provider request failed')
    }
    const body = JSON.parse(raw)
    if (type === 'lrc') {
      if (typeof body?.lyric !== 'string') throw new Error('Invalid provider lyrics')
      return json(res, 200, { lyric: body.lyric, tlyric: String(body.tlyric || '') })
    }
    if (type === 'url' || type === 'pic') {
      const mediaUrl = typeof body?.url === 'string' ? body.url : ''
      if (mediaUrl && !['http:', 'https:'].includes(new URL(mediaUrl).protocol)) throw new Error('Invalid provider URL')
      // Return JSON instead of fetching the audio through an upstream 302 redirect.
      return json(res, 200, { url: mediaUrl, br: Number(body?.br || 0) })
    }
    if (!Array.isArray(body) || body.some(song => !song?.id || !song?.name)) throw new Error('Invalid provider list')
    json(res, 200, body)
    console.log(`[meting] ${platform} ${type}: ${body.length} results`)
  } catch {
    const httpStatus = Number(meting.info?.statusCode || 0)
    console.error(`[meting] ${platform} ${type}: ${failureReason}, upstream HTTP ${httpStatus || 'unavailable'}`)
    json(res, 502, { message: 'Music provider request failed', errorCategory: failureReason, upstreamStatus: httpStatus })
  } finally {
    clearTimeout(timer)
    active -= 1
  }
})
server.listen(port, '127.0.0.1', () => {
  console.log(`[meting] local JSON sidecar listening on http://127.0.0.1:${port}/api`)
  process.send?.('ready')
})
server.on('error', (error) => {
  console.error(`[meting] unable to listen (${error.code || 'unknown'})`)
  process.exit(1)
})
