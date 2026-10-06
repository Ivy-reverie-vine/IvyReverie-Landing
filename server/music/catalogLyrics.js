import { parseMediaRef, createMediaRef, toMediaV2Body } from '../mediaContract.js'
import { boundedRequest } from './automaticPlayback.js'
import { DIAGNOSTIC_STAGE_SOURCE_RESOLUTION } from '../playbackDiagnostics.js'

function withoutCreditHeaders(value) {
  if (typeof value !== 'string') return ''
  return value.split(/\r?\n/).filter(line => {
    if (!line.trim().startsWith('{')) return true
    try { const header = JSON.parse(line); return !(header.t === -1 && Array.isArray(header.c)) }
    catch { return true }
  }).join('\n')
}

// Content belongs to the catalog; timing belongs to the concrete audio relation.
// Cross-resource timing remains uncertain even for a matched recording.
async function resolveOriginalCatalogLyrics(orchestrator, { catalogRef, playbackRef = catalogRef, signal, user }) {
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
    const raw = response.body || {}
    const body = { ...raw, lrc: { ...raw.lrc, lyric: withoutCreditHeaders(raw.lrc?.lyric) },
      yrc: { ...raw.yrc, lyric: withoutCreditHeaders(raw.yrc?.lyric) } }
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

async function catalogMetadata(orchestrator, catalogRef, user, signal) {
  const catalog = parseMediaRef(catalogRef)
  // A Bilibili video's title/uploader are not recording metadata.
  if (!['api-enhanced', 'meting-tencent', 'meting-kugou'].includes(catalog.source)) return null
  for (const session of orchestrator.searchSessions.values()) {
    if (session.userId !== user?.id || session.expiresAt <= Date.now()) continue
    const entry = session.groups.groups.flatMap(group => group.entries).find(row => row.mediaRef === catalogRef)
    if (entry && entry.durationMs > 0 && entry.title && entry.artists?.length && entry.album?.name) return entry
  }
  const source = orchestrator.registry.get(catalog.source)
  if (!source?.enabled || !source.capabilities.has('detail') || !orchestrator.registry.beginRequest(source)) return null
  try {
    const response = await boundedRequest(source, { path: 'song/detail', query: { id: catalog.sourceId },
      method: 'GET', user, timeoutMs: Math.min(2000, source.timeoutMs) }, signal || new AbortController().signal)
    if (response.status !== 200 || (response.body?.code !== undefined && response.body.code !== 200)) return null
    return toMediaV2Body('song/detail', response.body, catalogRef).data.find(row => row.mediaRef === catalogRef) || null
  } finally { orchestrator.registry.endRequest(source) }
}

export async function resolveCatalogLyrics(orchestrator, selection) {
  const original = await resolveOriginalCatalogLyrics(orchestrator, selection)
  const body = original.body, initial = body.lyrics
  if (!orchestrator.lrclib) return original // isolated T11 compatibility harness
  initial.fallback.implemented = true
  // Readable plain text is already suitable for static display on its own resource.
  const eligible = initial.fallback.eligible
  initial.fallback.attempted = eligible
  initial.catalogStatus = initial.status
  if (!eligible) { initial.fallback.status = 'skipped'; return original }
  const startedAt = Date.now()
  let fallback
  try {
    const song = await catalogMetadata(orchestrator, body.catalogRef, selection.user, selection.signal)
    fallback = selection.signal?.aborted ? { status: 'cancelled' } : song
      ? await orchestrator.lrclib.lookup(song, selection.signal)
      : { status: 'unavailable', reason: 'catalog_metadata_unavailable' }
  } catch (error) {
    fallback = { status: selection.signal?.aborted ? 'cancelled' : error.code === 'SOURCE_TIMEOUT' ? 'timeout' : 'failed' }
  }
  initial.fallback.status = fallback.status
  initial.fallback.reason = fallback.reason || fallback.status
  initial.retryable = ['failed', 'timeout', 'unavailable'].includes(fallback.status)
  orchestrator.diagnostics.record({ source: 'lrclib', capability: 'lyrics', stage: 'lyrics_fallback',
    durationMs: Date.now() - startedAt, ok: ['available', 'instrumental', 'missing'].includes(fallback.status),
    errorCategory: fallback.status })
  if (fallback.status === 'cancelled') {
    return { status: 200, body: { ...body, lrc: { lyric: '' }, yrc: { lyric: '' },
      lyricsSource: '', nolyric: false, lyrics: { ...initial, status: 'cancelled', timeline: 'none' } } }
  }
  if (['available', 'instrumental'].includes(fallback.status)) {
    const trusted = fallback.timed && body.catalogRef === body.playbackRef
    return { status: 200, body: { ...body,
      lyricsRef: createMediaRef({ source: 'lrclib', sourceId: fallback.id }), lyricsSource: 'lrclib',
      lrc: { lyric: fallback.status === 'available' ? fallback.lrc : '' }, yrc: { lyric: '' },
      nolyric: fallback.status === 'instrumental',
      lyrics: { ...initial, status: fallback.status, textType: fallback.textType,
        timeline: fallback.status === 'available' ? trusted ? 'trusted' : 'uncertain' : 'none',
        reason: trusted ? 'lrclib_catalog_metadata_match' : fallback.status === 'instrumental' ? 'instrumental'
          : fallback.textType === 'plain' ? 'plain_text' : 'audio_relation_unverified' } } }
  }
  // A failed optional upgrade must not discard usable original static lyrics.
  if (initial.status === 'available') return original
  initial.status = fallback.status === 'missing' && !['missing', 'unsupported'].includes(initial.catalogStatus)
    ? initial.catalogStatus : fallback.status
  initial.reason = fallback.reason || fallback.status
  return original
}
