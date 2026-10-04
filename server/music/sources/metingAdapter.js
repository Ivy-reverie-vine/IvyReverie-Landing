import { createHmac } from 'node:crypto'

const ROUTE_TYPES = Object.freeze({
  search: 'search',
  'song/detail': 'song',
  'song/url/v1': 'url',
  'lyric/new': 'lrc',
})

function asArray(value) {
  if (Array.isArray(value)) return value
  if (value && typeof value === 'object') return [value]
  return []
}

function asArtists(raw) {
  if (Array.isArray(raw.artist)) return raw.artist.map((artist) => String(artist?.name || artist)).filter(Boolean)
  if (Array.isArray(raw.artists)) return raw.artists.map((artist) => String(artist?.name || artist)).filter(Boolean)
  return String(raw.author || raw.artist || '')
    .split('/')
    .map((name) => name.trim())
    .filter(Boolean)
}

function durationMs(raw) {
  const value = Number(raw.duration ?? raw.dt ?? 0)
  if (!Number.isFinite(value) || value <= 0) return 0
  return value < 1000 ? Math.round(value * 1000) : Math.round(value)
}

export class MetingSourceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MetingSourceError'
    this.code = code
  }
}

/**
 * Meting HTTP adapter。
 *
 * Meting 运行在独立 HTTP 服务或 sidecar 中，NightDream 只接收并归一化结果，
 * 不把 Meting 原始响应结构暴露给客户端，也不接收客户端 Cookie。
 */
export class MetingAdapter {
  constructor({
    platform,
    baseUrl,
    token = '',
    fetchImpl = globalThis.fetch,
    cacheTtlMs = 30000,
    minRequestIntervalMs = 200,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  }) {
    if (!['tencent', 'kugou', 'kuwo'].includes(platform)) {
      throw new Error(`unsupported meting platform: ${platform}`)
    }
    this.platform = platform
    this.id = `meting-${platform}`
    this.baseUrl = baseUrl
    this.token = token
    this.fetchImpl = fetchImpl
    this.cacheTtlMs = Math.max(1, Number(cacheTtlMs || 30000))
    this.minRequestIntervalMs = Math.max(0, Number(minRequestIntervalMs || 0))
    this.sleep = sleep
    this.lastRequestAt = 0
    this.rateLimitTail = Promise.resolve()
    this.cache = new Map()
  }

  capabilities() {
    return ['search', 'detail', 'lyrics', 'playback']
  }

  async request({ path, query = {}, timeoutMs = 8000 }) {
    const type = ROUTE_TYPES[path]
    if (!type) {
      throw new MetingSourceError('CAPABILITY_UNSUPPORTED', `Meting does not support ${path}`)
    }
    const resourceId = path === 'search'
      ? String(query.keywords || query.q || '')
      : String(query.id || '')
    if (!resourceId) {
      throw new MetingSourceError('INVALID_REQUEST', `missing Meting resource id for ${path}`)
    }

    const payload = await this.fetchResource(type, resourceId, query, timeoutMs)
    if (path === 'lyric/new') {
      return { status: 200, body: { code: 200, lrc: { lyric: String(payload?.lyric || '') }, tlyric: { lyric: String(payload?.tlyric || '') } } }
    }
    if (path === 'search' || path === 'song/detail') {
      const data = asArray(payload)
        .map((item) => this.normalizeSong(item))
        .filter(Boolean)
      // Resolve artwork on demand; searching must not fan out into one request per result.
      if (path === 'song/detail') {
        for (const song of data) {
          if (song.album.pictureUrl || !song.album.pictureId) continue
          try {
            const picture = await this.fetchResource('pic', song.album.pictureId, {}, timeoutMs)
            song.album.pictureUrl = String(picture?.url || '')
          } catch { /* Artwork can be unavailable independently of the song. */ }
        }
      }
      return { status: 200, body: { code: 200, data } }
    }

    const first = asArray(payload)[0] || payload
    const url = typeof first === 'string' ? first : String(first?.url || '')
    return {
      status: 200,
      body: {
        code: 200,
        data: url === '' ? [] : [{
          url,
          source: this.id,
          sourceId: resourceId,
          expiresAt: Date.now() + this.cacheTtlMs,
        }],
      },
    }
  }

  normalizeSong(raw) {
    if (!raw || typeof raw !== 'object') return null
    const sourceId = raw.url_id ?? raw.id
    const title = String(raw.name ?? raw.title ?? '').trim()
    if (sourceId === undefined || title === '') return null
    return {
      source: this.id,
      sourceId: String(sourceId),
      kind: 'song',
      title,
      artists: asArtists(raw),
      album: {
        name: String(raw.album?.name ?? raw.album ?? raw.albumName ?? '').trim(),
        pictureId: raw.pic_id === undefined ? '' : String(raw.pic_id),
        pictureUrl: String(raw.album?.pictureUrl || raw.pic || raw.picUrl || ''),
      },
      durationMs: durationMs(raw),
      capabilities: {
        search: true,
        detail: true,
        lyrics: true,
        playback: true,
      },
    }
  }

  clearCache() {
    this.cache.clear()
  }

  async fetchResource(type, resourceId, query, timeoutMs) {
    const page = query.page === undefined ? '' : String(query.page)
    const limit = query.limit === undefined ? '' : String(query.limit)
    const cacheKey = `${this.platform}|${type}|${resourceId}|${page}|${limit}`
    const now = Date.now()
    const cached = this.cache.get(cacheKey)
    if (cached && cached.expiresAt > now) return cached.payload

    const url = new URL(this.baseUrl)
    url.searchParams.set('server', this.platform)
    url.searchParams.set('type', type)
    url.searchParams.set('id', resourceId)
    if (query.page !== undefined) url.searchParams.set('page', String(query.page))
    if (query.limit !== undefined) url.searchParams.set('limit', String(query.limit))
    if (this.token && ['url', 'lrc', 'pic'].includes(type)) {
      const signature = createHmac('sha1', this.token)
        .update(`${this.platform}${type}${resourceId}`)
        .digest('hex')
      url.searchParams.set('auth', signature)
    }

    await this.waitForRateLimit()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs || 8000)))
    try {
      const response = await this.fetchImpl(url, { method: 'GET', signal: controller.signal })
      const text = await response.text()
      if (!response.ok) {
        throw new MetingSourceError('SOURCE_HTTP_ERROR', `Meting returned HTTP ${response.status}`)
      }
      let payload
      try {
        payload = JSON.parse(text)
      } catch {
        throw new MetingSourceError('UPSTREAM_INVALID_RESPONSE', 'Meting returned invalid JSON')
      }
      this.cache.set(cacheKey, { payload, expiresAt: Date.now() + this.cacheTtlMs })
      return payload
    } catch (error) {
      if (controller.signal.aborted) {
        throw new MetingSourceError('SOURCE_TIMEOUT', 'Meting request timed out')
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }

  async waitForRateLimit() {
    let release
    const previous = this.rateLimitTail
    this.rateLimitTail = new Promise((resolve) => {
      release = resolve
    })
    await previous
    try {
      const waitMs = Math.max(0, this.minRequestIntervalMs - (Date.now() - this.lastRequestAt))
      if (waitMs > 0) await this.sleep(waitMs)
      this.lastRequestAt = Date.now()
    } finally {
      release()
    }
  }
}

export function createMetingAdapters({ config, fetchImpl = globalThis.fetch }) {
  const platforms = Array.isArray(config.platforms) ? config.platforms : []
  return platforms.map((platform) => new MetingAdapter({
    platform,
    baseUrl: config.baseUrl,
    token: config.token,
    fetchImpl,
    cacheTtlMs: config.cacheTtlMs,
    minRequestIntervalMs: config.minRequestIntervalMs,
  }))
}
