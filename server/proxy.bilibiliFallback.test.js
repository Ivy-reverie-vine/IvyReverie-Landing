// @vitest-environment node
import { beforeEach, afterEach, describe, it, expect } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'
import { parseMediaRef } from './mediaContract.js'

const bvid = 'BV1GJ411x7h7'
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let gateway, path, catalog, mode
beforeEach(async () => {
  gateway = await startIdentityGateway({ bilibili: true, mediaProxy: true })
  for (const id of ['meting-tencent', 'meting-kugou']) gateway.orchestrator.setSourceEnabled(id, false)
  gateway.orchestrator.playbackBudget = { totalMs: 600, reserveMs: 250 }
  const search = await gateway.request('/dreammusic/api/v2/search?aggregate=true&merge=true&keywords=目录', { headers: { 'X-API-Key': gateway.apiKey } })
  catalog = search.body.data[0]
  path = '/dreammusic/api/v2/song/url/v1?' + new URLSearchParams({ automatic: 'true', mediaRef: catalog.mediaRef, searchSession: search.body.searchSession })
  mode = 'full'
  gateway.controls.calls.length = 0
  gateway.controls.thirdPartyResponse = url => {
    if (url.pathname === '/song/url/v1') return json({ code: 200, data: [{ id: 123, url: mode === 'platform-full' ? 'https://audio.test/original.mp3' : '', time: 90000, freeTrialInfo: null }] })
    if (url.pathname === '/x/web-interface/nav') return json({ code: -101, data: { wbi_img: {
      img_url: 'https://i.test/' + 'a'.repeat(32) + '.png', sub_url: 'https://i.test/' + 'b'.repeat(32) + '.png' } } })
    if (url.pathname === '/x/web-interface/wbi/search/type') return json({ code: 0, data: { result: mode === 'none' ? [] : [{ bvid, title: '<em>目录歌曲</em>', author: '上传者不是歌手' }] } })
    if (url.pathname === '/x/web-interface/view') return json({ code: 0, data: { bvid, title: ['cover', 'live', 'remix', 'mv'].includes(mode) ? '目录歌曲 ' + mode : '目录歌曲',
      desc: mode === 'missing' ? 'UP：原歌手' : '歌名：目录歌曲\n歌手：原歌手\n专辑：目录专辑\nhttps://music.163.com/song?id=123' +
        (mode === 'content-unknown' ? '' : '\n音频：原专辑音轨') + (mode === 'dialogue' ? '\n含对白' : ''),
      owner: { mid: 9, name: '上传者不是歌手' }, pages: [
        { cid: 111, page: 1, part: '其他曲目', duration: 200 },
        { cid: 222, page: 2, part: '原歌手 - 目录歌曲', duration: mode === 'extra' ? 95 : 90 },
      ] } })
    if (url.pathname === '/x/player/playurl') return json({ code: 0, data: { cid: 222, timelength: mode === 'short' ? 30000 : 90000,
      ...(mode === 'unknown' ? {} : { isPreview: mode === 'preview' }),
      dash: { duration: 90, audio: [{ baseUrl: 'https://audio.test/bili.m4a', mimeType: 'audio/mp4', codecs: 'mp4a.40.2', id: 30280 }] } } })
    return null
  }
})
afterEach(async () => { await gateway.close() })
const resolve = () => gateway.request(path, { headers: { 'X-API-Key': gateway.apiKey } })

describe('T08 automatic Bilibili fallback through actual HTTP/auth/SQLite/registry/adapters', () => {
  it('does not use another provider resource as the selected catalog audio reference', async () => {
    const original = gateway.controls.thirdPartyResponse
    gateway.controls.thirdPartyResponse = url => url.pathname === '/song/url/v1'
      ? json({ code: 200, data: [{ id: 124, url: 'https://audio.test/wrong-preview.mp3', time: 27000,
        freeTrialInfo: { start: 1, end: 28 } }] }) : original(url)
    const { body } = await resolve()
    expect(body.playback.attempts[0].audioIntegrity.reason).toBe('resource_identity_mismatch')
    expect(gateway.controls.calls.some(url => url.href === 'https://audio.test/wrong-preview.mp3')).toBe(false)
  })
  it('does no Bilibili work when an ordinary platform supplies full audio', async () => {
    mode = 'platform-full'
    const { body } = await resolve()
    expect(body.playbackSource).toBe('api-enhanced')
    expect(body.playback.status).toBe('success')
    expect(gateway.controls.calls.some(url => url.host === 'api.bilibili.com')).toBe(false)
    const publicSearch = await gateway.request('/dreammusic/api/v2/search?source=bilibili&keywords=目录', { headers: { 'X-API-Key': gateway.apiKey } })
    expect(publicSearch.body.errorCode).toBe('SOURCE_UNAVAILABLE')
  })
  it('searches from the catalog, selects the proven second part and preserves original identity', async () => {
    const { body } = await resolve()
    expect(body.playback).toMatchObject({ status: 'success', reason: 'bilibili_full_recording' })
    expect(body.catalogRef).toBe(catalog.mediaRef)
    expect(body.lyricsRef).toBe(catalog.mediaRef)
    expect(body.playbackSource).toBe('bilibili')
    expect(parseMediaRef(body.playbackRef).sourceId).toBe(bvid + ':222')
    expect(body.audioIntegrity.status).toBe('full')
    expect(body.data[0].resource).toMatchObject({ page: 2, cid: '222', uploader: { name: '上传者不是歌手' } })
    expect(body.data[0].url).toContain('/dreammusic/media/stream/')
    expect(body.playback.bilibili.candidates.find(candidate => candidate.mediaRef === body.playbackRef)).toMatchObject({ status: 'automatic', match: { status: 'same_recording' } })
    const search = gateway.controls.calls.find(url => url.pathname.endsWith('/search/type'))
    expect(search.searchParams.get('keyword')).toBe('目录歌曲 原歌手')
    expect(search.searchParams.get('w_rid')).toMatch(/^[a-f0-9]{32}$/)
    expect(gateway.controls.calls.filter(url => url.pathname === '/x/player/playurl').map(url => url.searchParams.get('cid'))).toEqual(['222'])
    expect(JSON.stringify(body)).not.toMatch(/recordingCandidate|mediaTransport|audio\.test/)
  })
  it.each(['cover', 'live', 'remix', 'mv', 'dialogue', 'missing', 'content-unknown', 'extra', 'unknown', 'preview', 'short'])('keeps %s candidates manual without false automatic success', async value => {
    mode = value
    const { body } = await resolve()
    expect(body.playback.status).toBe('exhausted')
    expect(body.data).toEqual([])
    const part = body.playback.bilibili.candidates.find(candidate => candidate.resource?.cid === '222')
    expect(part.status).toBe('manual')
    expect(part.reason).not.toBe('same_recording_full_audio')
    expect(part.match.evidence.artists).not.toContain('上传者不是歌手')
    if (['unknown', 'preview', 'short'].includes(value)) expect(part.audioIntegrity.status).not.toBe('full')
    else expect(gateway.controls.calls.some(url => url.pathname === '/x/player/playurl')).toBe(false)
  })
  it('reports no candidates and respects disabled/open/saturated source controls', async () => {
    mode = 'none'
    expect((await resolve()).body.playback.reason).toBe('bilibili_no_candidates')
    const source = gateway.orchestrator.registry.get('bilibili')
    for (const change of [() => { source.enabled = false }, () => { source.enabled = true; source.openUntilMs = Date.now() + 10000 },
      () => { source.openUntilMs = 0; source.inFlight = source.maxConcurrent }]) {
      gateway.controls.calls.length = 0; change()
      expect((await resolve()).body.playback.status).toBe('exhausted')
      expect(gateway.controls.calls.some(url => url.host === 'api.bilibili.com')).toBe(false)
    }
    source.inFlight = 0
    gateway.config.mediaProxy.enabled = false
    gateway.controls.calls.length = 0
    expect((await resolve()).body.playback.reason).toBe('MEDIA_PROXY_REQUIRED')
    expect(gateway.controls.calls.some(url => url.host === 'api.bilibili.com')).toBe(false)
  })
  it('uses the selected provider detail duration when search omitted dt; missing search data is a failure', async () => {
    const session = [...gateway.orchestrator.searchSessions.values()][0]
    session.groups.groups[0].entries[0].durationMs = 0
    expect((await resolve()).body.playback.status).toBe('success')
    const original = gateway.controls.thirdPartyResponse
    gateway.controls.thirdPartyResponse = url => url.pathname.endsWith('/search/type')
      ? json({ code: 0, data: { v_voucher: 'controlled-risk-control' } }) : original(url)
    const result = await resolve()
    expect(result.body.playback.reason).toBe('BILIBILI_SEARCH_INCOMPLETE')
    expect(result.body.playback.status).toBe('exhausted')
  })
  it('rechecks source controls and current recording metadata after discovery', async () => {
    let views = 0
    gateway.controls.beforeResponse = url => {
      if (url.pathname === '/x/web-interface/view' && ++views === 2) mode = 'cover'
      return Promise.resolve()
    }
    const { body } = await resolve()
    expect(body.playback.status).toBe('exhausted')
    expect(body.playback.bilibili.candidates.find(candidate => candidate.resource?.cid === '222').reason).toBe('different_recording_or_extra_segments')
    views = 0; mode = 'full'
    gateway.controls.calls.length = 0
    gateway.controls.beforeResponse = url => {
      if (url.pathname.endsWith('/search/type')) gateway.orchestrator.setSourceEnabled('bilibili', false)
      return Promise.resolve()
    }
    const disabled = await resolve()
    expect(disabled.body.playback.reason).toBe('SOURCE_UNAVAILABLE')
    expect(gateway.controls.calls.some(url => url.pathname === '/x/player/playurl')).toBe(false)
  })
  it('enters fallback on music-stage timeout and never resets the total budget; late full is ignored', async () => {
    gateway.orchestrator.playbackBudget = { totalMs: 170, reserveMs: 90 }
    gateway.controls.beforeResponse = url => url.pathname === '/song/url/v1' ? delay(130)
      : url.pathname === '/x/player/playurl' ? delay(250) : Promise.resolve()
    const began = Date.now()
    const { body } = await resolve()
    expect(Date.now() - began).toBeLessThan(250)
    expect(body.playback).toMatchObject({ status: 'timeout', reason: 'total_budget', totalBudgetMs: 170, stageBudgetMs: 80 })
    expect(body.playback.bilibili.candidates.some(candidate => candidate.resource?.cid === '222')).toBe(true)
    expect(body.data).toEqual([])
    const snapshot = JSON.stringify(body)
    await delay(280)
    expect(JSON.stringify(body)).toBe(snapshot)
    expect(gateway.orchestrator.sourceStatuses().every(source => source.inFlight === 0)).toBe(true)
  })
  it('disconnect during fallback aborts upstream and does not poison the circuit', async () => {
    let began, aborts = 0
    const started = new Promise(resolve => { began = resolve })
    gateway.controls.beforeResponse = (url, signal) => {
      if (url.pathname !== '/x/player/playurl') return Promise.resolve()
      began()
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborts++; reject(new Error('aborted')) }, { once: true }))
    }
    const controller = new AbortController()
    const result = fetch(gateway.base + path, { headers: { 'X-API-Key': gateway.apiKey }, signal: controller.signal })
    await started; controller.abort(); await expect(result).rejects.toThrow(); await delay(40)
    expect(aborts).toBe(1)
    const status = gateway.orchestrator.sourceStatuses().find(source => source.id === 'bilibili')
    expect(status.inFlight).toBe(0)
    expect(status.circuit.failureStreak).toBe(0)
  })
})
