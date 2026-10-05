import { randomUUID } from 'node:crypto'
import { parseMediaRef, toMediaV2Body } from '../mediaContract.js'
import { boundedRequest } from './automaticPlayback.js'
import { assessBilibiliRecording } from './bilibiliMatcher.js'

function reject(code) { const error = new Error(code); error.code = code; throw error }

// Queue playback outlives search pages and transport signatures. Keep only the
// authorized identity/evidence, never a URL; receipts are user-bound and bounded.
export function rememberPlayback(orchestrator, result, user, query = {}) {
  const body = result.body
  if (body?.audioIntegrity?.status !== 'full' || !body.data?.[0]?.url || !body.playbackRef) return result
  const store = orchestrator.playbackReceipts ??= new Map()
  for (const [key, value] of store) if (value.expiresAt <= Date.now()) store.delete(key)
  if (store.size >= 1000) store.delete(store.keys().next().value)
  const token = randomUUID()
  const session = orchestrator.searchSessions.get(query.searchSession)
  const catalog = session?.groups.groups.flatMap(group => group.entries).find(row => row.mediaRef === body.catalogRef)
  const identity = Object.fromEntries(['mediaRef', 'catalogRef', 'playbackRef', 'lyricsRef', 'playbackSource', 'lyricsSource']
    .map(key => [key, body[key]]))
  store.set(token, { userId: user.id, expiresAt: Date.now() + 24 * 60 * 60 * 1000,
    identity, catalog, automatic: query.automatic === 'true', manualSelection: body.manualSelection })
  return { ...result, body: { ...body, recoveryToken: token } }
}

/** Refresh exactly the resource that actually played, including its Bilibili part. */
export async function recoverPlayback(orchestrator, { token, mediaRef, user, signal }) {
  const receipt = orchestrator.playbackReceipts?.get(token)
  if (!receipt || receipt.userId !== user.id || receipt.expiresAt <= Date.now() ||
    receipt.identity.playbackRef !== mediaRef) reject('INVALID_PLAYBACK_RECEIPT')
  const parsed = parseMediaRef(mediaRef)
  const source = orchestrator.registry.get(parsed.source)
  if (!source?.capabilities.has('playback') || !orchestrator.registry.beginRequest(source)) reject('SOURCE_UNAVAILABLE')
  const startedAt = Date.now()
  try {
    const result = await boundedRequest(source, { path: 'song/url/v1', method: 'GET', user,
      query: { id: parsed.sourceId, level: 'exhigh', randomCNIP: 'true', refresh: 'true',
        timestamp: String(Date.now()), recordingEvidence: parsed.source === 'bilibili' },
      timeoutMs: Math.min(source.timeoutMs, 8000) }, signal)
    if (signal.aborted) reject('PLAYBACK_CANCELLED')
    if (!source.enabled) reject('SOURCE_UNAVAILABLE')
    if (result.status !== 200 || result.body?.code !== 200) reject('PLAYBACK_RECOVERY_FAILED')
    const full = result.body?.audioIntegrity?.status === 'full' && !!result.body?.data?.[0]?.url
    if (receipt.automatic && parsed.source === 'bilibili' &&
      (!receipt.catalog || !result.body.recordingCandidate ||
        assessBilibiliRecording(receipt.catalog, result.body.recordingCandidate).status !== 'same_recording')) {
      reject('IDENTITY_MISMATCH')
    }
    const { recordingCandidate: _private, ...body } = toMediaV2Body('song/url/v1', result.body, mediaRef)
    orchestrator.registry.recordResult(source, { capability: 'playback', durationMs: Date.now() - startedAt,
      ok: true, playbackOk: full, circuitHealthy: true })
    return { ...result, body: { ...body, ...receipt.identity, recoveryToken: token,
      ...(receipt.manualSelection ? { manualSelection: receipt.manualSelection } : {}),
      data: body.data.map(row => ({ ...row, ...receipt.identity })) } }
  } catch (error) {
    if (!signal.aborted) orchestrator.registry.recordResult(source, { capability: 'playback',
      durationMs: Date.now() - startedAt, ok: false, errorCategory: error.code || 'PLAYBACK_RECOVERY_FAILED' })
    throw error
  } finally { orchestrator.registry.endRequest(source) }
}
