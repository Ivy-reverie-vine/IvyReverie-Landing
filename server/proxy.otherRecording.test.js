// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'
import { createMediaRef } from './mediaContract.js'

const bvid = 'BV1GJ411x7h7'
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
let gateway, params, mode
beforeEach(async () => {
  gateway = await startIdentityGateway({ bilibili: true, mediaProxy: true })
  for (const source of ['meting-tencent', 'meting-kugou']) gateway.orchestrator.setSourceEnabled(source, false)
  gateway.orchestrator.playbackBudget = { totalMs: 1500, reserveMs: 1000 }
  mode = 'full'
  gateway.controls.thirdPartyResponse = url => {
    if (url.pathname === '/song/url/v1') return json({ code: 200, data: [{ id: 123, url: '', time: 90000 }] })
    if (url.pathname === '/x/web-interface/nav') return json({ code: -101, data: { wbi_img: {
      img_url: 'https://i.test/' + 'a'.repeat(32) + '.png', sub_url: 'https://i.test/' + 'b'.repeat(32) + '.png' } } })
    if (url.pathname.endsWith('/search/type')) return json({ code: 0, data: { result: [{ bvid, title: '目录歌曲 MV 含对白', author: 'UP不是歌手' }] } })
    if (url.pathname === '/x/web-interface/view') return json({ code: 0, data: { bvid,
      title: '目录歌曲 MV 含对白', desc: '歌手：独立录音歌手\n含对白', pic: 'https://cover.test/mv.jpg',
      owner: { mid: 7, name: 'UP不是歌手' }, pages: [{ cid: 222, page: 2, part: '独立版本 MV', duration: 100 }] } })
    if (url.pathname === '/x/player/playurl') return mode === 'failure' ? json({ code: -404 }) : json({ code: 0, data: {
      cid: 222, timelength: mode === 'short' ? 30000 : 100000,
      ...(mode === 'unknown' ? {} : { isPreview: mode === 'preview' }),
      dash: { audio: [{ baseUrl: 'https://audio.test/mv.m4a', mimeType: 'audio/mp4', codecs: 'mp4a.40.2' }] } } })
    return null
  }
  const { body } = await gateway.request('/dreammusic/api/v2/search?aggregate=true&merge=true&keywords=目录',
    { headers: { 'X-API-Key': gateway.apiKey } })
  params = { catalogRef: body.data[0].mediaRef, searchSession: body.searchSession }
})
afterEach(async () => { await gateway.close() })
const request = params => gateway.request('/dreammusic/api/v2/song/url/v1?' + new URLSearchParams(params),
  { headers: { 'X-API-Key': gateway.apiKey } })
async function discover() {
  const { body } = await request({ automatic: 'true', mediaRef: params.catalogRef, searchSession: params.searchSession })
  expect(body.playback.status).toBe('exhausted')
  const candidate = body.playback.bilibili.candidates.find(candidate => candidate.resource?.cid === '222')
  expect(candidate.match.status).toBe('manual')
  expect(gateway.controls.calls.some(url => url.pathname === '/x/player/playurl')).toBe(false)
  gateway.controls.calls.length = 0
  return { ...params, manual: 'other', mediaRef: candidate.mediaRef }
}
describe('T10 explicit independent recording through authenticated HTTP', () => {
  it('rejects automatically, then resolves only the chosen part with its own identity, metadata and duration', async () => {
    const selected = await discover()
    const { body } = await request(selected)
    expect(body).toMatchObject({ catalogRef: selected.mediaRef, playbackRef: selected.mediaRef,
      mediaRef: selected.mediaRef, lyricsRef: '', lyricsSource: '', playbackSource: 'bilibili',
      audioIntegrity: { status: 'full', catalogDurationMs: 100000 },
      manualSelection: { originalCatalogRef: params.catalogRef, lyricsMode: 'none', match: { status: 'manual' },
        reason: 'different_recording_or_extra_segments',
        entry: { title: '独立版本 MV', artists: ['独立录音歌手'], durationMs: 100000 } } })
    expect(body.data[0].url).toContain('/dreammusic/media/stream/')
    expect(body.catalogRef).not.toBe(params.catalogRef)
    expect(JSON.stringify(body)).not.toMatch(/recordingCandidate|mediaTransport|audio\.test/)
    expect(gateway.controls.calls.map(url => url.pathname)).toEqual(['/x/web-interface/view', '/x/player/playurl'])
  })
  it.each(['preview', 'unknown', 'short'])('consent does not promote %s audio to full or silently fallback', async value => {
    const selected = await discover(); mode = value
    const { body } = await request(selected)
    expect(body.audioIntegrity.status).toBe(value === 'unknown' ? 'unknown' : 'preview')
    expect(body.manualSelection.match.status).toBe('manual')
    expect(gateway.controls.calls.every(url => url.host === 'api.bilibili.com')).toBe(true)
  })
  it('rejects undiscovered refs, wrong original catalog, foreign/expired sessions and same-recording mode', async () => {
    const forged = { ...params, manual: 'other', mediaRef: createMediaRef({ source: 'bilibili', sourceId: bvid + ':222' }) }
    expect((await request(forged)).body.errorCode).toBe('INVALID_SOURCE_SELECTION')
    const selected = await discover()
    expect((await request({ ...selected, catalogRef: selected.mediaRef })).body.errorCode).toBe('INVALID_SOURCE_SELECTION')
    expect((await request({ ...selected, manual: 'true' })).body.errorCode).toBe('INVALID_SOURCE_SELECTION')
    const session = gateway.orchestrator.searchSessions.get(params.searchSession)
    session.userId = -1
    expect((await request(selected)).body.errorCode).toBe('INVALID_SEARCH_SESSION')
    session.userId = gateway.userId; session.expiresAt = 0
    expect((await request(selected)).body.errorCode).toBe('INVALID_SEARCH_SESSION')
    expect(gateway.controls.calls).toHaveLength(0)
  })
  it('reports failure and respects disabled/saturated/open circuits; retry stays on the same candidate', async () => {
    const selected = await discover(); mode = 'failure'
    expect((await request(selected)).body.audioIntegrity.status).toBe('unavailable')
    const source = gateway.orchestrator.registry.get('bilibili')
    source.enabled = false
    expect((await request(selected)).body.errorCode).toBe('SOURCE_UNAVAILABLE')
    source.enabled = true; source.inFlight = source.maxConcurrent
    expect((await request(selected)).body.errorCode).toBe('SOURCE_UNAVAILABLE')
    source.inFlight = 0; source.openUntilMs = Date.now() + 30000
    expect((await request(selected)).body.errorCode).toBe('SOURCE_UNAVAILABLE')
    gateway.orchestrator.resetSourceCircuit('bilibili'); mode = 'full'
    expect((await request(selected)).body.audioIntegrity.status).toBe('full')
  })
  it('cancels selected part resolution on disconnect and releases the source slot', async () => {
    const selected = await discover()
    let started, aborted
    const entered = new Promise(resolve => { started = resolve })
    const cancelled = new Promise(resolve => { aborted = resolve })
    gateway.controls.beforeResponse = (url, signal) => url.pathname === '/x/player/playurl'
      ? new Promise((_, reject) => { started(); signal.addEventListener('abort', () => { aborted(); reject(new Error('cancelled')) }, { once: true }) })
      : Promise.resolve()
    const controller = new AbortController()
    const pending = fetch(gateway.base + '/dreammusic/api/v2/song/url/v1?' + new URLSearchParams(selected),
      { headers: { 'X-API-Key': gateway.apiKey }, signal: controller.signal }).catch(() => null)
    await entered; controller.abort(); await pending; await cancelled
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(gateway.orchestrator.registry.get('bilibili').inFlight).toBe(0)
    expect(gateway.orchestrator.registry.get('bilibili').failureStreak).toBe(0)
  })
})
