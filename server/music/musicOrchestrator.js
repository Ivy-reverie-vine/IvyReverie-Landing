import {
  DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL,
  DIAGNOSTIC_CATEGORY_SOURCE_FAILURE,
  DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT,
  DIAGNOSTIC_CATEGORY_URL_EXPIRED_OR_UNREACHABLE,
  DIAGNOSTIC_STAGE_SOURCE_RESOLUTION,
  DIAGNOSTIC_STAGE_URL_RESPONSE,
} from '../playbackDiagnostics.js'
import { ApiEnhancedAdapter } from './sources/apiEnhancedAdapter.js'
import { AudiusAdapter } from './sources/audiusAdapter.js'
import { createMetingAdapters } from './sources/metingAdapter.js'
import { parseMediaRef } from '../mediaContract.js'
import { MusicSourceRegistry } from './sourceRegistry.js'

export const MUSIC_ROUTE_CAPABILITIES = Object.freeze({
  search: 'search',
  'song/detail': 'detail',
  'song/url/v1': 'playback',
  'lyric/new': 'lyrics',
})

function playbackUrl(body) {
  const first = Array.isArray(body?.data) ? body.data[0] : null
  return typeof first?.url === 'string' ? first.url : ''
}

function sourceResponseOk(result) {
  return result.status >= 200 && result.status < 300 &&
    (result.body?.code === undefined || result.body.code === 200)
}

function errorCategory(error) {
  if (error?.code === 'UPSTREAM_TIMEOUT' || error?.code === 'SOURCE_TIMEOUT' || error?.name === 'AbortError') {
    return DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT
  }
  return DIAGNOSTIC_CATEGORY_SOURCE_FAILURE
}

export class MusicSourceError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'MusicSourceError'
    this.code = code
  }
}

export class MusicOrchestrator {
  constructor({ registry, diagnostics }) {
    this.registry = registry
    this.diagnostics = diagnostics
  }

  supportsPath(path) {
    return Object.prototype.hasOwnProperty.call(MUSIC_ROUTE_CAPABILITIES, path)
  }

  sourceStatuses() {
    return this.registry.statuses()
  }

  setSourceEnabled(id, enabled) {
    return this.registry.setEnabled(id, enabled)
  }

  setSourcePriority(id, priority) {
    return this.registry.setPriority(id, priority)
  }

  resetSourceCircuit(id) {
    return this.registry.resetCircuit(id)
  }

  async dispatch({ path, query, method, body, user, sourceId = '' }) {
    const capability = MUSIC_ROUTE_CAPABILITIES[path]
    const candidates = this.registry.list({ capability })
    const sources = sourceId ? candidates.filter(source => source.id === sourceId) : candidates
    if (sourceId && sources.length === 0) throw new MusicSourceError('SOURCE_UNAVAILABLE', 'selected source is unavailable')
    const sourceQuery = { ...query }
    if (sourceId) delete sourceQuery.source
    return this.dispatchFromSources(sources, {
      path, query: sourceQuery, method, body, user,
    })
  }

  async dispatchMediaRef({ path, mediaRef, query = {}, method, body, user }) {
    const parsed = parseMediaRef(mediaRef)
    if (!parsed) throw new MusicSourceError('INVALID_MEDIA_REF', 'invalid media reference')
    const source = this.registry.get(parsed.source)
    const capability = MUSIC_ROUTE_CAPABILITIES[path]
    if (!source || !source.enabled) {
      throw new MusicSourceError('SOURCE_UNAVAILABLE', 'media source is unavailable')
    }
    if (!source.capabilities.has(capability)) {
      throw new MusicSourceError('CAPABILITY_UNSUPPORTED', 'media source does not support this capability')
    }
    // A concrete resource cannot be overridden by legacy ids or source hints.
    const sourceQuery = { ...query, id: parsed.sourceId }
    delete sourceQuery.mediaRef
    delete sourceQuery.ids
    delete sourceQuery.source
    for (const role of ['catalogRef', 'playbackRef', 'lyricsRef']) {
      if (query[role] !== undefined) {
        const identity = parseMediaRef(query[role])
        if (!identity) throw new MusicSourceError('INVALID_MEDIA_REF', `invalid ${role}`)
        if (identity.source !== parsed.source || identity.sourceId !== parsed.sourceId) {
          throw new MusicSourceError('IDENTITY_UNSUPPORTED', 'cross-source identity is not supported by this slice')
        }
      }
      delete sourceQuery[role]
    }
    const sourceBody = body && typeof body === 'object' ? { ...body } : body
    if (sourceBody) {
      for (const key of ['id', 'ids', 'mediaRef', 'source', 'catalogRef', 'playbackRef', 'lyricsRef']) delete sourceBody[key]
    }
    return this.dispatchFromSources([source], { path, query: sourceQuery, method, body: sourceBody, user })
  }

  async dispatchFromSources(sources, { path, query, method, body, user }) {
    const capability = MUSIC_ROUTE_CAPABILITIES[path]
    if (sources.length === 0) {
      throw new MusicSourceError('NO_SOURCE', `no enabled music source supports ${capability}`)
    }

    let lastEmptyPlayback = null
    let lastFailedResponse = null
    for (const source of sources) {
      if (!this.registry.beginRequest(source)) continue
      const startedAt = Date.now()
      try {
        const result = await source.adapter.request({
          path,
          query,
          method,
          body,
          user,
          timeoutMs: source.timeoutMs,
        })
        const ok = sourceResponseOk(result)
        const durationMs = Math.max(0, Date.now() - startedAt)
        this.diagnostics.record({
          source: source.id,
          capability,
          stage: DIAGNOSTIC_STAGE_SOURCE_RESOLUTION,
          durationMs,
          ok,
          ...(ok ? {} : { errorCategory: DIAGNOSTIC_CATEGORY_SOURCE_FAILURE }),
        })

        if (capability === 'playback') {
          const url = playbackUrl(result.body)
          const mediaOk = ok && url !== ''
          this.diagnostics.record({
            source: source.id,
            capability,
            stage: DIAGNOSTIC_STAGE_URL_RESPONSE,
            durationMs,
            ok: mediaOk,
            ...(mediaOk
              ? {}
              : {
                  errorCategory: ok
                    ? DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL
                    : result.status >= 400
                      ? DIAGNOSTIC_CATEGORY_URL_EXPIRED_OR_UNREACHABLE
                      : DIAGNOSTIC_CATEGORY_SOURCE_FAILURE,
                }),
            })
          this.registry.recordResult(source, {
            capability,
            durationMs,
            ok,
            playbackOk: mediaOk,
            errorCategory: mediaOk
              ? ''
              : ok
                ? DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL
                : DIAGNOSTIC_CATEGORY_SOURCE_FAILURE,
          })
          if (mediaOk) return result
          if (ok && url === '') {
            lastEmptyPlayback = result
            continue
          }
        } else {
          this.registry.recordResult(source, {
            capability,
            durationMs,
            ok,
            errorCategory: ok ? '' : DIAGNOSTIC_CATEGORY_SOURCE_FAILURE,
          })
        }

        if (!ok && (result.status >= 500 || result.status === 429)) {
          lastFailedResponse = result
          continue
        }

        // 保持客户端可识别的业务错误和 HTTP 状态；仅 5xx/429 继续尝试低优先级来源。
        return result
      } catch (error) {
        const durationMs = Math.max(0, Date.now() - startedAt)
        const category = errorCategory(error)
        this.registry.recordResult(source, {
          capability,
          durationMs,
          ok: false,
          playbackOk: false,
          errorCategory: category,
        })
        this.diagnostics.record({
          source: source.id,
          capability,
          stage: DIAGNOSTIC_STAGE_SOURCE_RESOLUTION,
          durationMs,
          ok: false,
          errorCategory: category,
        })
        if (capability === 'playback') {
          this.diagnostics.record({
            source: source.id,
            capability,
            stage: DIAGNOSTIC_STAGE_URL_RESPONSE,
            durationMs,
            ok: false,
            errorCategory: category,
          })
        }
        // 网络/超时错误才允许继续尝试低优先级来源。
        continue
      } finally {
        this.registry.endRequest(source)
      }
    }

    if (lastEmptyPlayback) return lastEmptyPlayback
    if (lastFailedResponse) return lastFailedResponse
    throw new MusicSourceError('SOURCE_UNAVAILABLE', 'all enabled music sources are unavailable')
  }
}

export function createMusicOrchestrator({ config, diagnostics, fetchUpstream }) {
  const registry = new MusicSourceRegistry()
  const sourceConfig = config.musicSources?.apiEnhanced || {
    enabled: true,
    priority: 100,
    timeoutMs: config.upstreamTimeoutMs,
    capabilities: ['search', 'detail', 'lyrics', 'playback'],
  }
  if (sourceConfig.enabled !== false) {
    registry.register(new ApiEnhancedAdapter({
      upstream: config.upstream,
      fetchUpstream,
    }), sourceConfig)
  }
  const metingConfig = config.musicSources?.meting
  if (metingConfig?.enabled === true && metingConfig.baseUrl) {
    for (const adapter of createMetingAdapters({ config: metingConfig })) {
      registry.register(adapter, {
        enabled: true,
        priority: metingConfig.priority,
        timeoutMs: metingConfig.timeoutMs,
        maxConcurrent: metingConfig.maxConcurrent,
        circuitFailureThreshold: metingConfig.circuitFailureThreshold,
        circuitOpenMs: metingConfig.circuitOpenMs,
        capabilities: adapter.capabilities(),
      })
    }
  }
  const audiusConfig = config.musicSources?.audius
  if (audiusConfig?.enabled === true && audiusConfig.baseUrl) {
    registry.register(new AudiusAdapter(audiusConfig), {
      enabled: true,
      priority: audiusConfig.priority,
      timeoutMs: audiusConfig.timeoutMs,
      maxConcurrent: audiusConfig.maxConcurrent,
      circuitFailureThreshold: audiusConfig.circuitFailureThreshold,
      circuitOpenMs: audiusConfig.circuitOpenMs,
      capabilities: ['search', 'detail', 'playback'],
    })
  }
  return new MusicOrchestrator({ registry, diagnostics })
}
