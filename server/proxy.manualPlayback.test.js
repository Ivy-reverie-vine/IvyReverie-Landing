// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'
import { createMediaRef } from './mediaContract.js'

let gateway
const json = body => new Response(JSON.stringify(body), { status: 200 })
beforeAll(async () => { gateway = await startIdentityGateway() })
afterAll(async () => { await gateway.close() })
beforeEach(() => {
  gateway.controls.beforeResponse = async () => {}
  gateway.controls.thirdPartyResponse = () => null
  gateway.orchestrator.searchSessions.clear()
  for (const source of gateway.orchestrator.registry.sources.values()) {
    source.adapter.clearCache?.()
    source.inFlight = 0
    gateway.orchestrator.registry.resetCircuit(source.id)
    gateway.orchestrator.registry.setEnabled(source.id, true)
  }
})
async function selection(mismatch = false) {
  gateway.controls.thirdPartyResponse = url => url.searchParams.get('type') === 'search'
    ? json([{ id: url.searchParams.get('server') + '-001', name: mismatch ? '目录歌曲 Live' : gateway.song.name,
      artist: ['原歌手'], album: '目录专辑', duration: 90 }]) : null
  const { body } = await gateway.request('/dreammusic/api/v2/search?aggregate=true&merge=true&keywords=目录',
    { headers: { 'X-API-Key': gateway.apiKey } })
  const catalogRef = body.data.find(song => song.source === 'api-enhanced').mediaRef
  const mediaRef = body.data.find(song => song.source === 'meting-tencent').mediaRef
  gateway.controls.calls.length = 0
  return { manual: 'true', catalogRef, mediaRef, searchSession: body.searchSession }
}
const request = params => gateway.request('/dreammusic/api/v2/song/url/v1?' + new URLSearchParams(params),
  { headers: { 'X-API-Key': gateway.apiKey } })
function provider(status = 'full') {
  gateway.controls.thirdPartyResponse = url => {
    if (url.searchParams.get('type') === 'song') return json([{ id: url.searchParams.get('id'), duration: 90 }])
    if (url.searchParams.get('type') === 'url') return json({ url: status === 'unavailable' ? '' : 'https://audio.test/qq.mp3',
      durationMs: 90000, ...(status === 'unknown' ? {} : { isPreview: status === 'preview' }) })
    return null
  }
}
describe('T09 actual HTTP manual same-recording selection', () => {
  it('selects only the requested audio while retaining catalog and lyrics identity', async () => {
    const params = await selection(); provider()
    const { body } = await request(params)
    expect(body).toMatchObject({ catalogRef: params.catalogRef, lyricsRef: params.catalogRef,
      mediaRef: params.catalogRef, playbackRef: params.mediaRef, playbackSource: 'meting-tencent', lyricsSource: 'api-enhanced' })
    expect(body.audioIntegrity.status).toBe('full')
    expect(body.data[0].catalogRef).toBe(params.catalogRef)
    expect(gateway.controls.calls.every(url => url.searchParams.get('server') === 'tencent')).toBe(true)
  })
  it.each(['preview', 'unknown', 'unavailable'])('preserves %s and never silently falls back', async status => {
    const params = await selection(); provider(status)
    const { body } = await request(params)
    expect(body.audioIntegrity.status).toBe(status)
    expect(body.playbackSource).toBe('meting-tencent')
    expect(gateway.controls.calls.every(url => url.searchParams.get('server') === 'tencent')).toBe(true)
  })
  it('rejects other recordings, forged refs, foreign ownership and expired sessions before resolving', async () => {
    const wrong = await selection(true)
    expect((await request(wrong)).body.errorCode).toBe('INVALID_SOURCE_SELECTION')
    const params = await selection()
    expect((await request({ ...params, mediaRef: createMediaRef({ source: 'meting-tencent', sourceId: 'forged' }) })).status).toBe(400)
    const session = gateway.orchestrator.searchSessions.get(params.searchSession)
    session.userId = -1
    expect((await request(params)).body.errorCode).toBe('INVALID_SEARCH_SESSION')
    session.userId = gateway.userId; session.expiresAt = 0
    expect((await request(params)).body.errorCode).toBe('INVALID_SEARCH_SESSION')
    expect(gateway.controls.calls).toHaveLength(0)
  })
  it('enforces disabled, saturated and open-circuit sources', async () => {
    const params = await selection()
    const source = gateway.orchestrator.registry.get('meting-tencent')
    source.enabled = false
    expect((await request(params)).body.errorCode).toBe('SOURCE_UNAVAILABLE')
    source.enabled = true; source.inFlight = source.maxConcurrent
    expect((await request(params)).body.errorCode).toBe('SOURCE_UNAVAILABLE')
    source.inFlight = 0; source.openUntilMs = Date.now() + 30000
    expect((await request(params)).body.errorCode).toBe('SOURCE_UNAVAILABLE')
    expect(gateway.controls.calls).toHaveLength(0)
  })
  it('cancels upstream on HTTP disconnect without poisoning circuit health', async () => {
    const params = await selection(); provider()
    let started, aborted
    const entered = new Promise(resolve => { started = resolve })
    const cancelled = new Promise(resolve => { aborted = resolve })
    gateway.controls.beforeResponse = (url, signal) => url.searchParams.get('type') === 'url'
      ? new Promise((_, reject) => { started(); signal.addEventListener('abort', () => { aborted(); reject(new Error('cancelled')) }, { once: true }) })
      : Promise.resolve()
    const controller = new AbortController()
    const pending = fetch(gateway.base + '/dreammusic/api/v2/song/url/v1?' + new URLSearchParams(params),
      { headers: { 'X-API-Key': gateway.apiKey }, signal: controller.signal }).catch(() => null)
    await entered; controller.abort(); await pending; await cancelled
    await new Promise(resolve => setTimeout(resolve, 20))
    const source = gateway.orchestrator.registry.get('meting-tencent')
    expect(source.inFlight).toBe(0)
    expect(source.failureStreak).toBe(0)
  })
})
