import { parseMediaRef } from '../mediaContract.js'
import { DIAGNOSTIC_STAGE_SOURCE_RESOLUTION } from '../playbackDiagnostics.js'

// Content belongs to the catalog; timing belongs to the concrete audio relation.
// Cross-resource timing remains uncertain even for a matched recording.
export async function resolveCatalogLyrics(orchestrator, { catalogRef, playbackRef = catalogRef, signal, user }) {
  const catalog = parseMediaRef(catalogRef)
  const playback = parseMediaRef(playbackRef)
  if (!catalog || !playback) {
    const error = new Error('invalid lyric identity')
    error.code = 'INVALID_MEDIA_REF'
    throw error
  }
  const sameResource = catalog.source === playback.source && catalog.sourceId === playback.sourceId
  const result = (status, body = {}, reason = status) => {
    const lrc = typeof body.lrc?.lyric === 'string' ? body.lrc.lyric : ''
    const yrc = typeof body.yrc?.lyric === 'string' ? body.yrc.lyric : ''
    const timed = /\[\d+:\d+(?:[.:]\d+)?\]/.test(lrc) || /\[\d+,\d+\]/.test(yrc)
    const available = status === 'available'
    const actualSource = available || status === 'instrumental' ? catalog.source : ''
    return { status: 200, body: { code: 200, mediaRef: catalogRef, catalogRef, playbackRef,
      lyricsRef: catalogRef, lyricsSource: actualSource,
      lrc: { lyric: available ? lrc : '' }, yrc: { lyric: available ? yrc : '' },
      nolyric: status === 'instrumental',
      lyrics: { status, timeline: available ? sameResource && timed ? 'trusted' : 'uncertain' : 'none',
        reason: available ? !timed ? 'plain_text' : sameResource ? 'same_resource' : 'audio_relation_unverified' : reason,
        catalogSource: catalog.source,
        fallback: { provider: 'lrclib', implemented: false,
          eligible: !['instrumental', 'cancelled'].includes(status) && (!available || !sameResource) } } } }
  }
  if (signal?.aborted) return result('cancelled')
  const source = orchestrator.registry.get(catalog.source)
  if (!source?.enabled) return result('unavailable')
  if (!source.capabilities.has('lyrics')) return result('unsupported')
  if (!orchestrator.registry.beginRequest(source)) return result('unavailable')
  const controller = new AbortController()
  const startedAt = Date.now()
  const timeoutMs = Math.min(source.timeoutMs, 5000)
  let timer, abortListener, status = 'failed'
  try {
    const stopped = new Promise((_, reject) => {
      const stop = code => { controller.abort(); const error = new Error(code); error.code = code; reject(error) }
      timer = setTimeout(() => stop('SOURCE_TIMEOUT'), timeoutMs)
      abortListener = () => stop('LYRICS_CANCELLED')
      signal?.addEventListener('abort', abortListener, { once: true })
      if (signal?.aborted) abortListener()
    })
    const response = await Promise.race([stopped, source.adapter.request({ path: 'lyric/new',
      query: { id: catalog.sourceId }, method: 'GET', user,
      timeoutMs, signal: controller.signal })])
    if (response.status < 200 || response.status >= 300 ||
      (response.body?.code !== undefined && response.body.code !== 200)) {
      status = 'failed'
      return result(status, {}, 'provider_rejected')
    }
    const body = response.body || {}
    const content = [body.lrc?.lyric, body.yrc?.lyric].filter(value => typeof value === 'string')
      .join('\n').replace(/\[[^\]]*\]|\(\d+,\d+,\d+\)/g, '').trim()
    status = body.nolyric === true || body.instrumental === true ? 'instrumental' : content ? 'available' : 'missing'
    return result(status, body)
  } catch (error) {
    status = signal?.aborted || error.code === 'LYRICS_CANCELLED' ? 'cancelled'
      : ['SOURCE_TIMEOUT', 'UPSTREAM_TIMEOUT'].includes(error.code) ? 'timeout' : 'failed'
    return result(status)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', abortListener)
    const ok = ['available', 'missing', 'instrumental'].includes(status)
    // A user cancellation is neither an outage nor a successful provider answer.
    if (status !== 'cancelled') {
      const durationMs = Date.now() - startedAt
      orchestrator.registry.recordResult(source, { capability: 'lyrics', durationMs, ok, errorCategory: ok ? '' : status })
      orchestrator.diagnostics.record({ source: source.id, capability: 'lyrics',
        stage: DIAGNOSTIC_STAGE_SOURCE_RESOLUTION, durationMs, ok, ...(ok ? {} : { errorCategory: status }) })
    }
    orchestrator.registry.endRequest(source)
  }
}
