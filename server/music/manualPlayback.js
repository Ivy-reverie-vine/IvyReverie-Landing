import { parseMediaRef, toMediaV2Body } from '../mediaContract.js'
import { sameRecording } from './recordingMatcher.js'
import { boundedRequest } from './automaticPlayback.js'
import { assessBilibiliRecording } from './bilibiliMatcher.js'

const platforms = new Set(['api-enhanced', 'meting-tencent', 'meting-kugou'])
function reject(code) { const error = new Error(code); error.code = code; throw error }

/** A queue-local choice resolves exactly one authorized resource, never another fallback. */
export async function resolveManualPlayback(orchestrator, { catalogRef, mediaRef, searchSession, user, signal, otherRecording = false }) {
  const session = orchestrator.searchSessions.get(searchSession)
  if (!session || session.userId !== user.id || session.expiresAt <= Date.now()) reject('INVALID_SEARCH_SESSION')
  const group = session.groups.groups.find(group => group.entries.some(entry => entry.mediaRef === catalogRef))
  const catalog = group?.entries.find(entry => entry.mediaRef === catalogRef)
  const selected = otherRecording
    ? session.manualCandidates?.get(catalogRef)?.find(entry => entry.mediaRef === mediaRef)
    : group?.entries.find(entry => entry.mediaRef === mediaRef)
  if (!catalog || !selected || (otherRecording ? selected.source !== 'bilibili'
    : !platforms.has(selected.source) || (mediaRef !== catalogRef && !sameRecording(catalog, selected)))) reject('INVALID_SOURCE_SELECTION')
  const source = orchestrator.registry.get(selected.source)
  if (!source?.capabilities.has('playback') || !orchestrator.registry.beginRequest(source)) reject('SOURCE_UNAVAILABLE')
  const startedAt = Date.now()
  try {
    const parsed = parseMediaRef(mediaRef)
    const result = await boundedRequest(source, { path: 'song/url/v1', method: 'GET', user,
      query: { id: parsed.sourceId, level: 'exhigh', randomCNIP: 'true', recordingEvidence: otherRecording }, timeoutMs: source.timeoutMs }, signal)
    if (signal.aborted) reject('PLAYBACK_CANCELLED')
    if (!source.enabled) reject('SOURCE_UNAVAILABLE')
    const ok = result.status >= 200 && result.status < 300 && result.body?.code === 200
    const full = ok && result.body?.audioIntegrity?.status === 'full' && !!result.body?.data?.[0]?.url
    orchestrator.registry.recordResult(source, { capability: 'playback', durationMs: Date.now() - startedAt,
      ok, playbackOk: full, circuitHealthy: ok, errorCategory: full ? '' : 'audio_' + (result.body?.audioIntegrity?.status || 'unavailable') })
    const body = toMediaV2Body('song/url/v1', result.body, mediaRef)
    const identity = otherRecording
      ? { mediaRef, catalogRef: mediaRef, lyricsRef: '', lyricsSource: '', playbackRef: mediaRef, playbackSource: selected.source }
      : { mediaRef: catalogRef, catalogRef, lyricsRef: catalogRef,
        lyricsSource: catalog.source, playbackRef: mediaRef, playbackSource: selected.source }
    const current = result.body.recordingCandidate
    const { recordingCandidate: _private, ...publicBody } = body
    // Integrity is assessed against the selected part's own duration by its adapter.
    // Consent to a different recording never promotes preview/unknown to full.
    const manualSelection = otherRecording ? { originalCatalogRef: catalogRef,
      reason: selected.reason, match: selected.match, lyricsMode: 'none',
      entry: current ? { title: current.title, artists: assessBilibiliRecording(catalog, current).evidence.artists,
        album: current.album, durationMs: current.durationMs, resource: current.resource } : null } : undefined
    return { ...result, body: { ...publicBody, ...identity, ...(manualSelection ? { manualSelection } : {}),
      data: publicBody.data?.map(item => ({ ...item, ...identity })) || [] } }
  } catch (error) {
    if (!signal.aborted) orchestrator.registry.recordResult(source, { capability: 'playback',
      durationMs: Date.now() - startedAt, ok: false, errorCategory: error.code || 'SOURCE_FAILURE' })
    throw error
  } finally { orchestrator.registry.endRequest(source) }
}
