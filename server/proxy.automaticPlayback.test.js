// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'

let gateway
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
beforeAll(async () => { gateway = await startIdentityGateway() })
afterAll(async () => { await gateway.close() })
beforeEach(() => {
  gateway.controls.calls.length = 0
  gateway.controls.beforeResponse = async () => {}
  gateway.controls.thirdPartyResponse = () => null
  gateway.orchestrator.searchSessions.clear()
  gateway.orchestrator.playbackBudget = { totalMs: 1000, reserveMs: 300 }
  for (const source of gateway.orchestrator.registry.sources.values()) {
    source.adapter.clearCache?.()
    gateway.orchestrator.registry.resetCircuit(source.id)
    gateway.orchestrator.registry.setEnabled(source.id, true)
  }
  gateway.orchestrator.setSourceEnabled('bilibili', false)
})

async function selection({ mismatch = false } = {}) {
  gateway.controls.thirdPartyResponse = url => {
    if (url.searchParams.get('type') !== 'search') return null
    return json([{ id: url.searchParams.get('server') + '-001', name: mismatch ? '目录歌曲 (Live)' : gateway.song.name,
      artist: ['原歌手'], album: '目录专辑', duration: 90 }])
  }
  const search = await gateway.request('/dreammusic/api/v2/search?aggregate=true&merge=true&keywords=目录',
    { headers: { 'X-API-Key': gateway.apiKey } })
  const catalog = search.body.groups[0].entries[0]
  const params = new URLSearchParams({ automatic: 'true', mediaRef: catalog.mediaRef, searchSession: search.body.searchSession })
  return { path: '/dreammusic/api/v2/song/url/v1?' + params, catalog, search: search.body }
}
const resolve = selection => gateway.request(selection.path, { headers: { 'X-API-Key': gateway.apiKey } })
function provider({ netease = 'unavailable', qq = 'full', kugou = 'unknown' } = {}) {
  const states = { tencent: qq, kugou }
  gateway.controls.thirdPartyResponse = url => {
    const api = url.host === 'upstream.test'
    const state = api ? netease : states[url.searchParams.get('server')]
    if (api && url.pathname === '/song/url/v1') return json({ code: 200, data: [{ id: 123,
      url: state === 'unavailable' ? '' : 'https://audio.test/netease.mp3', time: 90000,
      ...(state === 'unknown' ? {} : { freeTrialInfo: state === 'preview' ? { start: 0, end: 30 } : null }) }] })
    if (!api && url.searchParams.get('type') === 'url') return json({ url: state === 'unavailable' ? '' : 'https://audio.test/' + url.searchParams.get('server') + '.mp3',
      durationMs: 90000, ...(state === 'unknown' ? {} : { isPreview: state === 'preview' }) })
    if (!api && url.searchParams.get('type') === 'song') return json([{ id: url.searchParams.get('id'), duration: 90 }])
    return null
  }
}

describe('T06 actual HTTP automatic playback', () => {
  it('fails the original then selects a full recording, retaining catalog/lyrics and attempt evidence', async () => {
    const selected = await selection()
    provider()
    gateway.controls.beforeResponse = url => url.searchParams.get('type') === 'url' ? delay(30) : Promise.resolve()
    const { body } = await resolve(selected)
    expect(body.playback.status).toBe('success')
    expect(body.catalogRef).toBe(selected.catalog.mediaRef)
    expect(body.mediaRef).toBe(selected.catalog.mediaRef)
    expect(body.lyricsRef).toBe(selected.catalog.mediaRef)
    expect(body.playbackSource).toBe('meting-tencent')
    expect(body.playbackRef).not.toBe(body.catalogRef)
    expect(body.audioIntegrity.status).toBe('full')
    expect(body.playback.attempts.some(attempt => attempt.source === 'api-enhanced' && attempt.status === 'unavailable')).toBe(true)
    expect(body.playback.continuation.enabled).toBe(false)
  })

  it('skips preview and unknown, reporting exhausted and continuation rather than false success', async () => {
    const selected = await selection()
    provider({ netease: 'preview', qq: 'unknown', kugou: 'unavailable' })
    const { body } = await resolve(selected)
    expect(body.data).toEqual([])
    expect(body.playback.status).toBe('exhausted')
    expect(body.playback.attempts.map(attempt => attempt.status).sort()).toEqual(['preview', 'unavailable', 'unknown'])
    expect(body.playback.continuation).toMatchObject({ stage: 'bilibili', enabled: false, eligible: true, catalogRef: selected.catalog.mediaRef })
    expect(body.playback.remainingBudgetMs).toBeGreaterThan(300)
  })

  it('never attempts uncertain recordings and rejects forged, foreign or expired selection context', async () => {
    const selected = await selection({ mismatch: true })
    provider({ netease: 'unavailable' })
    gateway.controls.calls.length = 0
    const result = await resolve(selected)
    expect(result.body.playback.status).toBe('exhausted')
    expect(result.body.playback.attempts).toHaveLength(1)
    expect(gateway.controls.calls.every(url => url.host === 'upstream.test')).toBe(true)
    const original = gateway.orchestrator.searchSessions.get(selected.search.searchSession)
    original.userId = -1
    expect((await resolve(selected)).body.errorCode).toBe('INVALID_SEARCH_SESSION')
    original.userId = gateway.userId; original.expiresAt = 0
    expect((await resolve(selected)).body.errorCode).toBe('INVALID_SEARCH_SESSION')
    original.expiresAt = Date.now() + 10000
    expect((await resolve({ path: selected.path.replace(selected.catalog.mediaRef, 'forged') })).body.errorCode).toBe('INVALID_MEDIA_REF')
  })

  it('returns the first full immediately; late high quality cannot revise the response or cache', async () => {
    const selected = await selection()
    provider({ netease: 'full', qq: 'full', kugou: 'full' })
    gateway.controls.beforeResponse = url => url.pathname === '/song/url/v1' || url.searchParams.get('server') === 'kugou'
      ? delay(180) : Promise.resolve()
    const start = Date.now()
    const { body } = await resolve(selected)
    expect(Date.now() - start).toBeLessThan(160)
    expect(body.playbackSource).toBe('meting-tencent')
    const snapshot = JSON.stringify(body)
    await delay(220)
    expect(JSON.stringify(body)).toBe(snapshot)
    expect(gateway.orchestrator.registry.get('meting-kugou').adapter.cache.size).toBe(1) // Only prior search.
    expect(gateway.orchestrator.sourceStatuses().every(source => source.inFlight === 0)).toBe(true)
  })

  it('enforces one adjustable budget and leaves time for the unimplemented Bilibili stage', async () => {
    const selected = await selection()
    provider({ netease: 'full', qq: 'full', kugou: 'full' })
    gateway.orchestrator.playbackBudget = { totalMs: 200, reserveMs: 80 }
    gateway.controls.beforeResponse = () => delay(250)
    const start = Date.now()
    const { body } = await resolve(selected)
    expect(Date.now() - start).toBeLessThan(220)
    expect(body.playback).toMatchObject({ status: 'timeout', reason: 'music_stage_budget', totalBudgetMs: 200, stageBudgetMs: 120 })
    expect(body.playback.remainingBudgetMs).toBeGreaterThan(35)
    expect(body.data).toEqual([])
    await delay(280)
    expect(gateway.orchestrator.sourceStatuses().every(source => source.inFlight === 0)).toBe(true)
  })

  it('HTTP disconnect aborts providers, and cancellation is an explicit orchestration terminal', async () => {
    const selected = await selection()
    provider()
    let started, observedAbort = 0
    const began = new Promise(resolve => { started = resolve })
    gateway.controls.beforeResponse = (url, signal) => {
      started()
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => { observedAbort++; reject(new Error('aborted')) }, { once: true })
      })
    }
    const controller = new AbortController()
    const response = fetch(gateway.base + selected.path, { headers: { 'X-API-Key': gateway.apiKey }, signal: controller.signal })
    await began; controller.abort()
    await expect(response).rejects.toThrow()
    await delay(30)
    expect(observedAbort).toBeGreaterThan(0)
    const cancelled = new AbortController(); cancelled.abort()
    const result = await gateway.orchestrator.resolveAutomaticPlayback({ mediaRef: selected.catalog.mediaRef,
      searchSession: selected.search.searchSession, user: { id: gateway.userId }, signal: cancelled.signal })
    expect(result.body.playback.status).toBe('cancelled')
    expect(result.body.playback.continuation.eligible).toBe(false)
  })

  it('source enable/concurrency/circuit controls remain authoritative and legacy requests stay single-source', async () => {
    const selected = await selection()
    provider({ netease: 'unavailable', qq: 'full', kugou: 'full' })
    gateway.orchestrator.setSourceEnabled('meting-tencent', false)
    const kugou = gateway.orchestrator.registry.get('meting-kugou')
    kugou.openUntilMs = Date.now() + 10000
    const { body } = await resolve(selected)
    expect(body.playback.status).toBe('exhausted')
    expect(body.playback.attempts.filter(attempt => attempt.reason === 'SOURCE_UNAVAILABLE')).toHaveLength(2)
    kugou.openUntilMs = 0; kugou.inFlight = kugou.maxConcurrent
    expect((await resolve(selected)).body.playback.status).toBe('exhausted')
    kugou.inFlight = 0
    const legacy = await gateway.request('/dreammusic/api/v2/song/url/v1?mediaRef=' + selected.catalog.mediaRef,
      { headers: { 'X-API-Key': gateway.apiKey } })
    expect(legacy.body.playback).toBeUndefined()
    expect(legacy.body.playbackRef).toBe(selected.catalog.mediaRef)
  })

  it('one source timeout covers URL and detail together, allowing the next confirmed same-source candidate', async () => {
    gateway.controls.thirdPartyResponse = url => url.searchParams.get('type') === 'search'
      ? json(url.searchParams.get('server') === 'kugou' ? [] : ['slow', 'fast'].map(id => ({ id,
        name: gateway.song.name, artist: ['原歌手'], album: '目录专辑', duration: 90 }))) : null
    const search = await gateway.request('/dreammusic/api/v2/search?aggregate=true&merge=true&keywords=目录',
      { headers: { 'X-API-Key': gateway.apiKey } })
    const mediaRef = search.body.groups[0].entries[0].mediaRef
    provider()
    gateway.orchestrator.registry.get('meting-tencent').timeoutMs = 35
    gateway.controls.beforeResponse = (url, signal) => url.searchParams.get('id') === 'slow'
      ? new Promise((resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }) })
      : Promise.resolve()
    const result = await resolve({ path: '/dreammusic/api/v2/song/url/v1?' + new URLSearchParams({
      automatic: 'true', mediaRef, searchSession: search.body.searchSession }) })
    expect(result.body.playback.status).toBe('success')
    expect(result.body.playback.attempts.some(attempt => attempt.reason === 'SOURCE_TIMEOUT')).toBe(true)
    expect(result.body.playbackRef).toBe(search.body.groups[0].entries.find(entry => entry.sourceId === 'fast').mediaRef)
  })
})
