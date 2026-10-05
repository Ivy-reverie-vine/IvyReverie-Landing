import { parseMediaRef } from '../mediaContract.js'
import { sameRecording } from './recordingMatcher.js'

const platforms = new Set(['api-enhanced', 'meting-tencent', 'meting-kugou'])
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback

async function boundedRequest(source, request, signal) {
  const controller = new AbortController()
  let timer, cancel
  try {
    return await Promise.race([
      source.adapter.request({ ...request, signal: AbortSignal.any([signal, controller.signal]) }),
      new Promise((_, reject) => {
        cancel = () => reject(new Error('automatic playback settled'))
        signal.addEventListener('abort', cancel, { once: true })
        if (signal.aborted) cancel()
        timer = setTimeout(() => {
          const error = new Error('source playback timed out'); error.code = 'SOURCE_TIMEOUT'
          reject(error); controller.abort()
        }, request.timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
  }
}

/** One immutable selection and deadline; provider work can never revise a settled result. */
export async function resolveAutomaticPlayback(orchestrator, { mediaRef, searchSession, user, signal }) {
  const session = orchestrator.searchSessions.get(searchSession)
  if (!session || session.userId !== user.id || session.expiresAt <= Date.now()) {
    const error = new Error('search session expired; search again')
    error.code = 'INVALID_SEARCH_SESSION'
    throw error
  }
  const group = session.groups.groups.find(group => group.entries.some(entry => entry.mediaRef === mediaRef))
  const catalog = group?.entries.find(entry => entry.mediaRef === mediaRef)
  if (!catalog) {
    const error = new Error('selected catalog entry is not in this search')
    error.code = 'INVALID_MEDIA_REF'
    throw error
  }
  const candidates = group.entries.filter(entry => platforms.has(entry.source) &&
    (entry.mediaRef === mediaRef || sameRecording(catalog, entry))).map(entry => ({ ...entry }))
  candidates.sort((a, b) => Number(b.mediaRef === mediaRef) - Number(a.mediaRef === mediaRef))
  const startedAt = Date.now()
  const totalBudgetMs = positive(orchestrator.playbackBudget?.totalMs, 10000)
  const reserveMs = Math.min(totalBudgetMs, positive(orchestrator.playbackBudget?.reserveMs, 3000))
  const stageBudgetMs = Math.max(1, totalBudgetMs - reserveMs)
  const controller = new AbortController()
  const attempts = []
  const lanes = [...new Set(candidates.map(entry => entry.source))]
  return new Promise(resolve => {
    let settled = false, pending = lanes.length, timer
    const finish = (status, selected = null, reason = status) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancelled)
      const remainingBudgetMs = Math.max(0, totalBudgetMs - (Date.now() - startedAt))
      const playback = { status, reason, totalBudgetMs, stageBudgetMs,
        elapsedMs: Date.now() - startedAt, remainingBudgetMs,
        attempts: attempts.map(attempt => ({ ...attempt,
          status: attempt.status === 'pending' ? status === 'success' ? 'cancelled' : status : attempt.status })),
        continuation: { stage: 'bilibili', enabled: false, eligible: status !== 'success' && status !== 'cancelled' && remainingBudgetMs > 0,
          catalogRef: mediaRef, candidates: candidates.map(entry => entry.mediaRef) } }
      const identity = { mediaRef, catalogRef: mediaRef, lyricsRef: mediaRef, lyricsSource: catalog.source }
      const body = selected ? { ...selected.result.body, ...identity,
        playbackRef: selected.entry.mediaRef, playbackSource: selected.entry.source,
        data: [{ ...selected.result.body.data[0], ...identity,
          playbackRef: selected.entry.mediaRef, playbackSource: selected.entry.source }], playback }
        : { code: 200, ...identity, data: [], playback,
          audioIntegrity: { status: 'unavailable', reason: 'automatic_' + reason,
            catalogDurationMs: catalog.durationMs, resourceDurationMs: 0, evidence: [] } }
      controller.abort()
      resolve({ status: 200, body })
    }
    const cancelled = () => finish('cancelled', null, 'request_cancelled')
    signal?.addEventListener('abort', cancelled, { once: true })
    if (signal?.aborted) { cancelled(); return }
    timer = setTimeout(() => finish('timeout', null, 'music_stage_budget'), stageBudgetMs)
    if (!pending) { finish('exhausted'); return }
    for (const sourceId of lanes) {
      void (async () => {
        for (const entry of candidates.filter(entry => entry.source === sourceId)) {
          if (settled) return
          const source = orchestrator.registry.get(sourceId)
          const attempt = { mediaRef: entry.mediaRef, source: sourceId, status: 'pending',
            matchReason: entry.mediaRef === mediaRef ? 'selected_resource' : 'same_recording_metadata' }
          attempts.push(attempt)
          if (!source?.capabilities.has('playback') || !orchestrator.registry.beginRequest(source)) {
            attempt.status = 'unavailable'; attempt.reason = 'SOURCE_UNAVAILABLE'; continue
          }
          const began = Date.now()
          const remainingMs = Math.max(1, stageBudgetMs - (began - startedAt))
          const timeoutMs = Math.min(source.timeoutMs, remainingMs)
          try {
            const parsed = parseMediaRef(entry.mediaRef)
            const result = await boundedRequest(source, { path: 'song/url/v1', method: 'GET', user,
              query: { id: parsed.sourceId, level: 'exhigh', randomCNIP: 'true' },
              timeoutMs,
            }, controller.signal)
            if (settled) return
            const ok = result.status >= 200 && result.status < 300 && result.body?.code === 200
            const integrity = result.body?.audioIntegrity
            attempt.status = ok ? integrity?.status ?? 'unknown' : 'unavailable'
            attempt.reason = ok ? integrity?.reason ?? 'missing_evidence' : 'SOURCE_REJECTED'
            attempt.audioIntegrity = integrity
            const full = ok && integrity?.status === 'full' && !!result.body?.data?.[0]?.url
            orchestrator.registry.recordResult(source, { capability: 'playback', durationMs: Date.now() - began,
              ok, playbackOk: full, circuitHealthy: ok && ['full', 'preview', 'unknown'].includes(integrity?.status),
              errorCategory: full ? '' : 'audio_' + attempt.status })
            orchestrator.diagnostics.record({ source: sourceId, capability: 'playback', stage: 'url_response',
              durationMs: Date.now() - began, ok: full, ...(full ? {} : { errorCategory: 'audio_' + attempt.status }) })
            if (full) { finish('success', { entry, result }); return }
          } catch (error) {
            if (settled) return
            // A provider deadline clipped by the shared stage is a stage timeout,
            // even if its timer fires just before the outer timer in the same tick.
            if (error.code === 'SOURCE_TIMEOUT' && timeoutMs === remainingMs) {
              attempt.status = 'timeout'; attempt.reason = 'music_stage_budget'
              finish('timeout', null, 'music_stage_budget'); return
            }
            attempt.status = 'unavailable'; attempt.reason = error.code || 'SOURCE_FAILURE'
            orchestrator.registry.recordResult(source, { capability: 'playback', durationMs: Date.now() - began,
              errorCategory: attempt.reason })
            orchestrator.diagnostics.record({ source: sourceId, capability: 'playback', stage: 'source_resolution',
              durationMs: Date.now() - began, ok: false, errorCategory: attempt.reason })
          } finally {
            orchestrator.registry.endRequest(source)
          }
        }
      })().finally(() => { if (--pending === 0) finish('exhausted') })
    }
  })
}
