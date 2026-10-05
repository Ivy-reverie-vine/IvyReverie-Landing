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
import { BilibiliAdapter } from './sources/bilibiliAdapter.js'
import { createMetingAdapters } from './sources/metingAdapter.js'
import { parseMediaRef, toMediaV2Body } from '../mediaContract.js'
import { MusicSourceRegistry } from './sourceRegistry.js'
import { randomUUID } from 'node:crypto'
import { RecordingSearchGroups } from './recordingMatcher.js'
import { assessAudio } from './audioIntegrity.js'
import { resolveAutomaticPlayback } from './automaticPlayback.js'
import { LrclibClient } from './lrclib.js'

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
  constructor({ registry, diagnostics, playbackBudget }) {
    this.registry = registry
    this.diagnostics = diagnostics
    this.searchSessions = new Map()
    this.playbackBudget = playbackBudget
  }

  supportsPath(path) {
    return Object.prototype.hasOwnProperty.call(MUSIC_ROUTE_CAPABILITIES, path)
  }

  resolveAutomaticPlayback(selection) {
    return resolveAutomaticPlayback(this, selection)
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

  // T03: independent source pages, never a fallback or an estimated global total.
  async aggregateSearch({ query = {}, user }) {
    const ids = ['api-enhanced', 'meting-tencent', 'meting-kugou']
    const keywords = typeof query.keywords === 'string' ? query.keywords.trim() : ''
    const limit = query.limit === undefined ? 30 : Number(query.limit)
    let pages
    try { pages = query.pages === undefined ? Object.fromEntries(ids.map(id => [id, 0])) : JSON.parse(query.pages) }
    catch { throw new MusicSourceError('INVALID_SEARCH_PAGE', 'invalid source pages') }
    if (!keywords || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !pages || Array.isArray(pages) || typeof pages !== 'object' || !Object.keys(pages).length ||
      Object.entries(pages).some(([id, offset]) => !ids.includes(id) ||
        !Number.isSafeInteger(offset) || offset < 0 || offset > 100000 || offset % limit !== 0)) {
      throw new MusicSourceError('INVALID_SEARCH_PAGE', 'invalid keywords, limit or source pages')
    }
    // Opt-in so older aggregate clients retain their flat response semantics.
    let session, searchSession
    if (query.merge === 'true') {
      const now = Date.now()
      for (const [key, value] of this.searchSessions) {
        if (value.expiresAt <= now) this.searchSessions.delete(key)
      }
      searchSession = query.searchSession
      if (searchSession !== undefined) {
        session = this.searchSessions.get(searchSession)
        if (!session || session.userId !== user.id || session.keywords !== keywords || session.limit !== limit) {
          throw new MusicSourceError('INVALID_SEARCH_SESSION', 'search session expired or does not match this search')
        }
      } else {
        if (Object.values(pages).some(offset => offset !== 0) || this.searchSessions.size >= 200) {
          throw new MusicSourceError('INVALID_SEARCH_SESSION', 'start a new search from the first page')
        }
        searchSession = randomUUID()
        session = { userId: user.id, keywords, limit, expiresAt: now + 15 * 60 * 1000, groups: new RecordingSearchGroups() }
        this.searchSessions.set(searchSession, session)
      }
      if (session.groups.seen.size + Object.keys(pages).length * limit > 10000) {
        throw new MusicSourceError('INVALID_SEARCH_SESSION', 'search session entry limit reached; narrow your search')
      }
    }
    const sources = await Promise.all(Object.entries(pages).map(async ([id, offset]) => {
      const failed = errorCode => ({ source: id, status: 'failed', offset, nextOffset: offset,
        hasMore: false, errorCode, data: [] })
      const source = this.registry.get(id)
      if (!source?.capabilities.has('search') || !this.registry.beginRequest(source)) return failed('SOURCE_UNAVAILABLE')
      const startedAt = Date.now()
      let timer
      let ok = false
      let category = ''
      try {
        const timeoutMs = Math.min(source.timeoutMs, 10000)
        const result = await Promise.race([
          source.adapter.request({ path: 'search', method: 'GET', user, timeoutMs,
            query: { keywords, limit: String(limit), offset: String(offset), page: String(offset / limit + 1) } }),
          new Promise((_, reject) => { timer = setTimeout(() => reject(
            new MusicSourceError('SOURCE_TIMEOUT', 'source search timed out')), timeoutMs) }),
        ])
        if (!sourceResponseOk(result)) throw new MusicSourceError('SOURCE_REJECTED', 'source rejected search')
        const raw = id === 'api-enhanced'
          ? result.body?.result?.songs ?? (result.body?.result?.songCount === 0 ? [] : undefined)
          : result.body?.data
        if (!Array.isArray(raw) || raw.some(song => !song ||
          (id === 'api-enhanced'
            ? !Number.isSafeInteger(song.id) || song.id <= 0 || typeof song.name !== 'string' || !song.name.trim()
            : typeof song.sourceId !== 'string' || !song.sourceId.trim() || song.source !== id ||
              typeof song.title !== 'string' || !song.title.trim()))) {
          throw new MusicSourceError('UPSTREAM_INVALID_RESPONSE', 'invalid search entries')
        }
        const data = toMediaV2Body('search', result.body).data
        const hasMore = raw.length > 0 && (id === 'api-enhanced'
          ? result.body.result.more === true : result.body.hasMore === true)
        ok = true
        return { source: id, status: data.length ? 'ok' : 'empty', offset,
          nextOffset: offset + limit, hasMore, data }
      } catch (error) {
        category = error.code || errorCategory(error)
        return failed(category)
      } finally {
        clearTimeout(timer)
        const durationMs = Math.max(0, Date.now() - startedAt)
        this.registry.recordResult(source, { capability: 'search', durationMs, ok, errorCategory: category })
        this.diagnostics.record({ source: id, capability: 'search', stage: DIAGNOSTIC_STAGE_SOURCE_RESOLUTION,
          durationMs, ok, ...(ok ? {} : { errorCategory: category }) })
        this.registry.endRequest(source)
      }
    }))
    const data = sources.flatMap(source => source.data)
    const failures = sources.filter(source => source.status === 'failed').length
    return { status: 200, body: { code: 200, data,
      ...(session ? { searchSession, groups: session.groups.append(data) } : {}),
      sources: sources.map(({ data: _data, ...page }) => page),
      status: failures === sources.length ? 'all_failed' : failures ? 'partial_failure' : data.length ? 'success' : 'empty' } }
  }

  async dispatch({ path, query, method, body, user, sourceId = '' }) {
    const capability = MUSIC_ROUTE_CAPABILITIES[path]
    const candidates = this.registry.list({ capability })
    // A legacy numeric ID is a NetEase resource, not an ID shared by every platform.
    const sources = sourceId ? candidates.filter(source => source.id === sourceId)
      : capability === 'playback' ? candidates.filter(source => source.id === 'api-enhanced') : candidates
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
          result.body.audioIntegrity ??= assessAudio({ url })
          const mediaOk = ok && result.body.audioIntegrity.status === 'full'
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
                    ? url === '' ? DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL : `audio_${result.body.audioIntegrity.status}`
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
            // Preview/unknown is a valid provider answer, not a service outage.
            circuitHealthy: ok && url !== '' && result.body.audioIntegrity.status !== 'unavailable',
            errorCategory: mediaOk
              ? ''
              : ok
                ? url === '' ? DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL : `audio_${result.body.audioIntegrity.status}`
                : DIAGNOSTIC_CATEGORY_SOURCE_FAILURE,
          })
          if (ok) return result
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
  const bilibiliConfig = config.musicSources?.bilibili
  registry.register(new BilibiliAdapter({ fetchImpl: config.fetch || globalThis.fetch }), {
    ...bilibiliConfig, enabled: bilibiliConfig?.enabled === true,
  })
  const orchestrator = new MusicOrchestrator({ registry, diagnostics, playbackBudget: config.automaticPlayback })
  orchestrator.lrclib = new LrclibClient({ fetchImpl: config.fetch || globalThis.fetch })
  return orchestrator
}
