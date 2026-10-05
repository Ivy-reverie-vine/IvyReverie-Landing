import { parseMediaRef, toMediaV2Body } from '../mediaContract.js'
import { sameRecording } from './recordingMatcher.js'
import { boundedRequest } from './automaticPlayback.js'

const platforms = new Set(['api-enhanced', 'meting-tencent', 'meting-kugou'])
function reject(code) { const error = new Error(code); error.code = code; throw error }

/** A queue-local choice selects exactly one confirmed recording, never another fallback. */
export async function resolveManualPlayback(orchestrator, { catalogRef, mediaRef, searchSession, user, signal }) {
  const session = orchestrator.searchSessions.get(searchSession)
  if (!session || session.userId !== user.id || session.expiresAt <= Date.now()) reject('INVALID_SEARCH_SESSION')
  const group = session.groups.groups.find(group => group.entries.some(entry => entry.mediaRef === catalogRef))
  const catalog = group?.entries.find(entry => entry.mediaRef === catalogRef)
  const selected = group?.entries.find(entry => entry.mediaRef === mediaRef)
  if (!catalog || !selected || !platforms.has(selected.source) ||
    (mediaRef !== catalogRef && !sameRecording(catalog, selected))) reject('INVALID_SOURCE_SELECTION')
  const source = orchestrator.registry.get(selected.source)
  if (!source?.capabilities.has('playback') || !orchestrator.registry.beginRequest(source)) reject('SOURCE_UNAVAILABLE')
  const startedAt = Date.now()
  try {
    const parsed = parseMediaRef(mediaRef)
    const result = await boundedRequest(source, { path: 'song/url/v1', method: 'GET', user,
      query: { id: parsed.sourceId, level: 'exhigh', randomCNIP: 'true' }, timeoutMs: source.timeoutMs }, signal)
    if (signal.aborted) reject('PLAYBACK_CANCELLED')
    if (!source.enabled) reject('SOURCE_UNAVAILABLE')
    const ok = result.status >= 200 && result.status < 300 && result.body?.code === 200
    const full = ok && result.body?.audioIntegrity?.status === 'full' && !!result.body?.data?.[0]?.url
    orchestrator.registry.recordResult(source, { capability: 'playback', durationMs: Date.now() - startedAt,
      ok, playbackOk: full, circuitHealthy: ok, errorCategory: full ? '' : 'audio_' + (result.body?.audioIntegrity?.status || 'unavailable') })
    const body = toMediaV2Body('song/url/v1', result.body, mediaRef)
    const identity = { mediaRef: catalogRef, catalogRef, lyricsRef: catalogRef,
      lyricsSource: catalog.source, playbackRef: mediaRef, playbackSource: selected.source }
    return { ...result, body: { ...body, ...identity, data: body.data?.map(item => ({ ...item, ...identity })) || [] } }
  } catch (error) {
    if (!signal.aborted) orchestrator.registry.recordResult(source, { capability: 'playback',
      durationMs: Date.now() - startedAt, ok: false, errorCategory: error.code || 'SOURCE_FAILURE' })
    throw error
  } finally { orchestrator.registry.endRequest(source) }
}
