import { createMediaRef, parseMediaRef } from '../mediaContract.js'
import { sameRecording } from './recordingMatcher.js'
import { assessBilibiliRecording } from './bilibiliMatcher.js'
import { assessAudio } from './audioIntegrity.js'

const platforms = new Set(['api-enhanced', 'meting-tencent', 'meting-kugou'])
const positive = (value, fallback) => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback

export async function boundedRequest(source, request, signal) {
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
async function resolveMusicPlayback(orchestrator, { mediaRef, searchSession, user, signal }, startedAt) {
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

/** Music and Bilibili share the original deadline; no second automatic operation. */
export async function resolveAutomaticPlayback(orchestrator, selection) {
  const startedAt = Date.now()
  const result = await resolveMusicPlayback(orchestrator, selection, startedAt)
  const playback = result.body.playback
  const source = orchestrator.registry.get('bilibili')
  if (!playback.continuation.eligible || !source?.enabled) return result
  const catalog = { ...orchestrator.searchSessions.get(selection.searchSession).groups.groups
    .flatMap(group => group.entries).find(entry => entry.mediaRef === selection.mediaRef) }
  // Some real search responses omit dt. Use only the selected resource's verified
  // provider detail evidence, never another candidate's duration or audio length.
  if (!catalog.durationMs) {
    catalog.durationMs = playback.attempts.find(attempt => attempt.mediaRef === selection.mediaRef)?.audioIntegrity?.catalogDurationMs || 0
  }
  const deadline = startedAt + playback.totalBudgetMs
  const controller = new AbortController()
  const combined = selection.signal ? AbortSignal.any([selection.signal, controller.signal]) : controller.signal
  const candidates = []
  playback.bilibili = { status: 'pending', query: [catalog.title, ...(catalog.artists || []), ...(catalog.versionTags || [])].join(' '), candidates }
  playback.continuation.enabled = true
  playback.continuation.eligible = false
  let selected = null
  const finish = (status, reason) => {
    playback.status = status; playback.reason = reason
    playback.elapsedMs = Date.now() - startedAt
    playback.remainingBudgetMs = Math.max(0, deadline - Date.now())
    playback.bilibili.status = status === 'success' ? 'success' : status
    playback.bilibili.reason = reason
    result.body.audioIntegrity.reason = 'automatic_' + reason
    if (selected) {
      const { recordingCandidate: _candidate, ...body } = selected.result.body
      const identity = { mediaRef: selection.mediaRef, catalogRef: selection.mediaRef,
        lyricsRef: selection.mediaRef, lyricsSource: catalog.source,
        playbackRef: selected.entry.mediaRef, playbackSource: 'bilibili' }
      result.body = { ...body, ...identity, data: [{ ...body.data[0], ...identity }], playback }
    }
    controller.abort()
    return result
  }
  async function request(path, query, capability) {
    if (combined.aborted) throw Object.assign(new Error('cancelled'), { code: 'REQUEST_CANCELLED' })
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw Object.assign(new Error('total deadline'), { code: 'TOTAL_TIMEOUT' })
    if (!source.capabilities.has(capability) || !orchestrator.registry.beginRequest(source)) {
      throw Object.assign(new Error('source unavailable'), { code: 'SOURCE_UNAVAILABLE' })
    }
    const began = Date.now(), timeoutMs = Math.min(source.timeoutMs, remaining)
    let response, errorCategory = '', ok = false, full = false
    try {
      response = await boundedRequest(source, { path, query, method: 'GET', user: selection.user, timeoutMs }, combined)
      if (combined.aborted) throw Object.assign(new Error('cancelled'), { code: 'REQUEST_CANCELLED' })
      if (Date.now() >= deadline) throw Object.assign(new Error('total deadline'), { code: 'TOTAL_TIMEOUT' })
      ok = response.status >= 200 && response.status < 300 && response.body?.code === 200
      full = ok && response.body.audioIntegrity?.status === 'full'
      if (!ok) throw Object.assign(new Error('Bilibili rejected request'), { code: response.body?.errorCode || 'SOURCE_REJECTED' })
      return response
    } catch (error) {
      errorCategory = combined.aborted ? 'REQUEST_CANCELLED' : error.code || 'SOURCE_FAILURE'
      if (errorCategory === 'SOURCE_TIMEOUT' && timeoutMs === remaining) errorCategory = 'TOTAL_TIMEOUT'
      throw Object.assign(error, { code: errorCategory })
    } finally {
      // Cancellation is neutral; it must not poison a source circuit.
      if (!combined.aborted) {
        const metricCapability = capability === 'fallbackSearch' ? 'search' : capability
        orchestrator.registry.recordResult(source, { capability: metricCapability, durationMs: Date.now() - began, ok,
          playbackOk: full, circuitHealthy: ok, errorCategory })
        orchestrator.diagnostics.record({ source: source.id, capability: metricCapability, stage: 'bilibili_fallback',
          durationMs: Date.now() - began, ok, errorCategory })
      }
      orchestrator.registry.endRequest(source)
    }
  }
  if (selection.mediaProxyAvailable === false) return finish('exhausted', 'MEDIA_PROXY_REQUIRED')
  try {
    const search = await request('search', { keywords: playback.bilibili.query }, 'fallbackSearch')
    // Retain all discovered videos even if detail discovery later times out.
    candidates.push(...search.body.data.map(video => ({ source: 'bilibili', bvid: video.bvid,
      title: video.title, uploader: video.uploader, status: 'manual', reason: 'part_not_inspected' })))
    for (const video of search.body.data) {
      let parts
      try { parts = await request('song/parts', { id: video.bvid }, 'detail') }
      catch (error) {
        candidates.find(candidate => candidate.bvid === video.bvid && !candidate.mediaRef).reason = error.code
        if (['TOTAL_TIMEOUT', 'REQUEST_CANCELLED', 'SOURCE_UNAVAILABLE'].includes(error.code)) throw error
        continue
      }
      for (const raw of parts.body.data) {
        const entry = { ...raw, mediaRef: createMediaRef(raw) }
        const match = assessBilibiliRecording(catalog, entry)
        const candidate = { mediaRef: entry.mediaRef, source: 'bilibili', sourceId: entry.sourceId,
          resource: entry.resource, title: entry.title, artists: entry.artists, durationMs: entry.durationMs,
          status: 'manual', reason: match.reason, match }
        candidates.push(candidate)
        if (match.status !== 'same_recording') continue
        const attempt = { source: 'bilibili', mediaRef: entry.mediaRef, status: 'pending', matchReason: match.reason }
        playback.attempts.push(attempt)
        try {
          const resolved = await request('song/url/v1', { id: entry.sourceId, recordingEvidence: true }, 'playback')
          // Recheck the details obtained with this fresh playurl, not stale search text.
          const currentMatch = assessBilibiliRecording(catalog, resolved.body.recordingCandidate)
          candidate.match = currentMatch
          const original = resolved.body.audioIntegrity
          const audioIntegrity = assessAudio({ url: resolved.body.data[0]?.url,
            catalogDurationMs: catalog.durationMs, resourceDurationMs: original.resourceDurationMs,
            trial: original.evidence.includes('provider_trial') ? true
              : original.evidence.includes('provider_non_trial') ? false : undefined })
          candidate.audioIntegrity = audioIntegrity
          attempt.audioIntegrity = audioIntegrity
          attempt.status = audioIntegrity.status
          candidate.reason = currentMatch.status !== 'same_recording' ? currentMatch.reason : 'audio_' + audioIntegrity.status
          attempt.reason = candidate.reason
          if (currentMatch.status === 'same_recording' && audioIntegrity.status === 'full') {
            candidate.status = 'automatic'; candidate.reason = 'same_recording_full_audio'
            resolved.body.audioIntegrity = audioIntegrity
            selected = { entry, result: resolved }
            return finish('success', 'bilibili_full_recording')
          }
        } catch (error) {
          attempt.status = error.code === 'TOTAL_TIMEOUT' ? 'timeout' : 'unavailable'
          candidate.reason = attempt.reason = error.code
          if (['TOTAL_TIMEOUT', 'REQUEST_CANCELLED', 'SOURCE_UNAVAILABLE'].includes(error.code)) throw error
        }
      }
      const hint = candidates.find(candidate => candidate.bvid === video.bvid && !candidate.mediaRef)
      hint.reason = parts.body.data.length ? 'parts_inspected' : 'no_valid_parts'
    }
    return finish('exhausted', candidates.length ? 'bilibili_manual_candidates' : 'bilibili_no_candidates')
  } catch (error) {
    if (selection.signal?.aborted || error.code === 'REQUEST_CANCELLED') return finish('cancelled', 'request_cancelled')
    if (error.code === 'TOTAL_TIMEOUT') return finish('timeout', 'total_budget')
    return finish('exhausted', error.code || 'bilibili_failure')
  }
}
