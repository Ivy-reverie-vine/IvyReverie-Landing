import { assessAudio } from '../audioIntegrity.js'

const ROUTES = Object.freeze({
  search: 'search',
  'song/detail': 'detail',
  'song/url/v1': 'playback',
})

function asArray(value) {
  return Array.isArray(value) ? value : value ? [value] : []
}

export class AudiusSourceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AudiusSourceError'
    this.code = code
  }
}

/**
 * Audius read-only playback POC。
 *
 * API key/Bearer token stay on NightDream. The adapter never accepts user
 * cookies or returns Audius raw track objects to the public gateway.
 */
export class AudiusAdapter {
  constructor({
    baseUrl,
    apiKey = '',
    bearerToken = '',
    fetchImpl = globalThis.fetch,
    cacheTtlMs = 30000,
    minRequestIntervalMs = 100,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = () => Date.now(),
  }) {
    this.id = 'audius'
    this.baseUrl = String(baseUrl).replace(/\/$/, '')
    this.apiKey = apiKey
    this.bearerToken = bearerToken
    this.fetchImpl = fetchImpl
    this.cacheTtlMs = Math.max(1, Number(cacheTtlMs || 30000))
    this.minRequestIntervalMs = Math.max(0, Number(minRequestIntervalMs || 0))
    this.sleep = sleep
    this.now = now
    this.lastRequestAt = 0
    this.rateLimitTail = Promise.resolve()
    this.cache = new Map()
  }

  capabilities() {
    return ['search', 'detail', 'playback']
  }

  async request({ path, query = {}, timeoutMs = 8000 }) {
    const capability = ROUTES[path]
    if (!capability) throw new AudiusSourceError('CAPABILITY_UNSUPPORTED', `Audius does not support ${path}`)

    if (capability === 'search') {
      const keyword = String(query.keywords || query.q || '').trim()
      if (keyword === '') throw new AudiusSourceError('INVALID_REQUEST', 'missing Audius search query')
      const payload = await this.fetchJson('/tracks/search', {
        query: { query: keyword, limit: query.limit, offset: query.offset },
        timeoutMs,
      })
      return { status: 200, body: { code: 200, data: asArray(payload.data).map((track) => this.normalizeTrack(track)).filter(Boolean) } }
    }

    const trackId = String(query.id || '').trim()
    if (trackId === '') throw new AudiusSourceError('INVALID_REQUEST', 'missing Audius track id')
    const track = await this.getTrack(trackId, timeoutMs)
    if (capability === 'detail') {
      const normalized = this.normalizeTrack(track)
      if (normalized) normalized.album.pictureUrl = await this.resolveArtwork(track, normalized.album.pictureUrl, timeoutMs)
      return { status: 200, body: { code: 200, data: normalized ? [normalized] : [] } }
    }

    if (!this.isStreamable(track)) {
      throw new AudiusSourceError('NO_PLAYBACK', 'Audius track is not streamable')
    }
    const cacheKey = `playback|${trackId}`
    if (query.refresh === 'true') this.cache.delete(cacheKey)
    const cached = this.getCache(cacheKey)
    if (cached) return { status: 200, body: { code: 200, data: [cached],
      audioIntegrity: assessAudio({ url: cached.url, catalogDurationMs: Number(track.duration) * 1000 }) } }
    const stream = await this.fetchStream(trackId, timeoutMs)
    const playback = {
      url: stream,
      source: this.id,
      sourceId: trackId,
      expiresAt: this.now() + this.cacheTtlMs,
    }
    this.cache.set(cacheKey, { value: playback, expiresAt: this.now() + this.cacheTtlMs })
    return { status: 200, body: { code: 200, data: [playback],
      audioIntegrity: assessAudio({ url: stream, catalogDurationMs: Number(track.duration) * 1000 }) } }
  }

  normalizeTrack(track) {
    if (!track || typeof track !== 'object' || track.id === undefined || !track.title) return null
    const artwork = track.artwork || {}
    const artist = track.user?.name || track.user?.handle || ''
    return {
      source: this.id,
      sourceId: String(track.id),
      kind: 'song',
      title: String(track.title),
      artists: artist ? [String(artist)] : [],
      album: {
        name: '',
        pictureUrl: String(artwork['480x480'] || artwork._480x480 || artwork['1000x1000'] || artwork._1000x1000 || artwork['150x150'] || artwork._150x150 || ''),
      },
      durationMs: Number.isFinite(Number(track.duration)) ? Math.round(Number(track.duration) * 1000) : 0,
      capabilities: {
        search: true,
        detail: true,
        playback: this.isStreamable(track),
      },
      rights: {
        license: track.license ? String(track.license) : null,
        downloadable: (track.is_downloadable ?? track.isDownloadable ?? track.downloadable) === true,
        streamable: this.isStreamable(track),
        streamGated: (track.is_stream_gated ?? track.isStreamGated) === true,
        downloadGated: (track.is_download_gated ?? track.isDownloadGated) === true,
      },
    }
  }

  isStreamable(track) {
    const streamable = track?.is_streamable ?? track?.isStreamable
    return streamable === true || streamable === 'true'
  }

  async resolveArtwork(track, original, timeoutMs) {
    const mirrors = track.artwork?.mirrors
    if (!original || !Array.isArray(mirrors) || !mirrors.length) return original
    const key = `artwork|${track.id}`
    const cached = this.getCache(key)
    if (cached) return cached
    const candidates = [original]
    try {
      const path = new URL(original).pathname
      for (const mirror of mirrors.slice(0, 3)) {
        const url = new URL(path, mirror)
        if (url.protocol === 'https:' && !candidates.includes(url.href)) candidates.push(url.href)
      }
    } catch { return original }
    const deadline = this.now() + Math.min(timeoutMs, 6000)
    for (const url of candidates) {
      const remaining = deadline - this.now()
      if (remaining <= 0) break
      try {
        // Only provider-declared mirrors; never forward API credentials or disable TLS checks.
        const response = await this.fetchImpl(url, { method: 'HEAD', signal: AbortSignal.timeout(Math.min(2000, remaining)) })
        if (response.ok && response.headers.get('content-type')?.startsWith('image/')) {
          this.cache.set(key, { value: url, expiresAt: this.now() + this.cacheTtlMs })
          return url
        }
      } catch { /* Try the next provider-declared replica. */ }
    }
    return original
  }

  async getTrack(trackId, timeoutMs) {
    const cached = this.getCache(`track|${trackId}`)
    if (cached) return cached
    const payload = await this.fetchJson(`/tracks/${encodeURIComponent(trackId)}`, { timeoutMs })
    const track = payload.data
    if (!track || typeof track !== 'object') throw new AudiusSourceError('NO_MATCH', 'Audius track not found')
    this.cache.set(`track|${trackId}`, { value: track, expiresAt: this.now() + this.cacheTtlMs })
    return track
  }

  async fetchStream(trackId, timeoutMs) {
    const response = await this.fetchRaw(`/tracks/${encodeURIComponent(trackId)}/stream`, { timeoutMs })
    const streamUrl = response.url || response.headers?.get?.('location') || ''
    await response.body?.cancel()
    if (!streamUrl || streamUrl.endsWith(`/tracks/${encodeURIComponent(trackId)}/stream`)) {
      throw new AudiusSourceError('NO_PLAYBACK', 'Audius stream URL was not returned')
    }
    return streamUrl
  }

  getCache(key) {
    const cached = this.cache.get(key)
    if (!cached || cached.expiresAt <= this.now()) {
      this.cache.delete(key)
      return null
    }
    return cached.value
  }

  clearCache() {
    this.cache.clear()
  }

  async fetchJson(path, options = {}) {
    const response = await this.fetchRaw(path, options)
    let payload
    try {
      payload = await response.json()
    } catch {
      throw new AudiusSourceError('UPSTREAM_INVALID_RESPONSE', 'Audius returned invalid JSON')
    }
    return payload
  }

  async fetchRaw(path, { query = {}, timeoutMs = 8000 } = {}) {
    await this.waitForRateLimit()
    const url = new URL(`${this.baseUrl}${path}`)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value))
    }
    const headers = {}
    if (this.apiKey) headers['x-api-key'] = this.apiKey
    if (this.bearerToken) headers.Authorization = `Bearer ${this.bearerToken}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs || 8000)))
    try {
      const response = await this.fetchImpl(url, { method: 'GET', headers, signal: controller.signal })
      if (!response.ok) throw new AudiusSourceError('SOURCE_HTTP_ERROR', `Audius returned HTTP ${response.status}`)
      return response
    } catch (error) {
      if (controller.signal.aborted) throw new AudiusSourceError('SOURCE_TIMEOUT', 'Audius request timed out')
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
      const waitMs = Math.max(0, this.minRequestIntervalMs - (this.now() - this.lastRequestAt))
      if (waitMs > 0) await this.sleep(waitMs)
      this.lastRequestAt = this.now()
    } finally {
      release()
    }
  }
}
