// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'

let gateway
beforeAll(async () => { gateway = await startIdentityGateway() })
afterAll(async () => { await gateway?.close() })
beforeEach(() => {
  gateway.controls.calls.length = 0
  gateway.controls.beforeResponse = async () => {}
  gateway.controls.thirdPartyResponse = () => null
  for (const id of ['api-enhanced', 'meting-tencent', 'meting-kugou']) {
    gateway.orchestrator.registry.setEnabled(id, true)
    gateway.orchestrator.registry.get(id).adapter.clearCache?.()
    gateway.orchestrator.registry.get(id).timeoutMs = 1000
  }
})
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
const search = (pages, keyword = '歌曲') => gateway.request('/dreammusic/api/v2/search?aggregate=true&limit=2&keywords=' +
  encodeURIComponent(keyword) + (pages ? '&pages=' + encodeURIComponent(JSON.stringify(pages)) : ''),
{ headers: { 'X-API-Key': gateway.apiKey } })

describe('T03 real HTTP aggregate search', () => {
  it('starts three configured sources concurrently, retains identity and resolves audio only on selection', async () => {
    let release
    const gate = new Promise(resolve => { release = resolve })
    const started = new Set()
    gateway.controls.beforeResponse = async url => {
      started.add(url.host === 'upstream.test' ? 'netease' : url.searchParams.get('server'))
      if (started.size === 3) release()
      await gate
    }
    const response = await search()
    expect([...started].sort()).toEqual(['kugou', 'netease', 'tencent'])
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('success')
    expect(response.body.data.map(song => song.source)).toEqual(['api-enhanced', 'meting-tencent', 'meting-kugou'])
    expect(response.body.data.every(song => song.catalogRef === song.mediaRef)).toBe(true)
    expect(gateway.controls.calls).toHaveLength(3)
    expect(response.body.total).toBeUndefined()
    gateway.controls.beforeResponse = async () => {}
    const picked = response.body.data[2]
    const audio = await gateway.request('/dreammusic/api/v2/song/url/v1?mediaRef=' + picked.playbackRef,
      { headers: { 'X-API-Key': gateway.apiKey } })
    expect(audio.body.playbackSource).toBe('meting-kugou')
    expect(audio.body.data[0].url).toBeTruthy()
  })

  it('distinguishes source rejection, invalid fields, all empty and all failed', async () => {
    gateway.controls.thirdPartyResponse = url => url.host === 'upstream.test' ? null
      : url.searchParams.get('server') === 'tencent' ? json({ message: 'denied' }, 403)
        : json([{ id: 'bad', name: { invalid: true } }])
    let response = await search()
    expect(response.body.status).toBe('partial_failure')
    expect(response.body.data).toHaveLength(1)
    expect(response.body.sources.slice(1).every(source => source.status === 'failed')).toBe(true)
    expect(response.body.sources[2].errorCode).toBe('UPSTREAM_INVALID_RESPONSE')
    // A bad response must not poison the page cache and mask a successful retry.
    gateway.controls.thirdPartyResponse = () => json([{ id: 'repaired', name: '已恢复' }])
    const repaired = await search({ 'meting-kugou': 0 })
    expect(repaired.body.sources[0].status).toBe('ok')
    expect(repaired.body.data[0].sourceId).toBe('repaired')
    for (const source of gateway.orchestrator.registry.sources.values()) source.adapter.clearCache?.()
    gateway.controls.thirdPartyResponse = url => json(url.host === 'upstream.test'
      ? { code: 200, result: { songCount: 0, more: false } } : [])
    response = await search()
    expect(response.body.status).toBe('empty')
    expect(response.body.sources.every(source => source.status === 'empty' && !source.hasMore)).toBe(true)
    for (const source of gateway.orchestrator.registry.sources.values()) source.adapter.clearCache?.()
    gateway.controls.thirdPartyResponse = () => json({ code: 503 }, 503)
    response = await search()
    expect(response.body.status).toBe('all_failed')
    expect(response.body.data).toEqual([])
    expect(response.body.sources.every(source => source.nextOffset === 0)).toBe(true)
  })

  it('bounds a slow source and preserves the other sources', async () => {
    gateway.orchestrator.registry.get('meting-tencent').timeoutMs = 25
    gateway.controls.beforeResponse = (url, signal) => url.searchParams.get('server') !== 'tencent'
      ? Promise.resolve() : new Promise((_, reject) => signal.addEventListener('abort',
        () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })), { once: true }))
    const response = await search()
    expect(response.body.status).toBe('partial_failure')
    expect(response.body.sources[1]).toMatchObject({ status: 'failed', errorCode: 'SOURCE_TIMEOUT', nextOffset: 0 })
    expect(response.body.data).toHaveLength(2)
  })

  it('advances each platform page independently and retries only the failed page', async () => {
    let qqFailed = true
    gateway.controls.thirdPartyResponse = url => {
      const offset = url.host === 'upstream.test' ? Number(url.searchParams.get('offset'))
        : (Number(url.searchParams.get('page')) - 1) * 2
      if (url.host === 'upstream.test') return json({ code: 200, result: {
        songs: offset === 0 ? [gateway.song, { ...gateway.song, id: 124 }] : [{ ...gateway.song, id: 125 }], more: offset === 0 } })
      if (url.searchParams.get('server') === 'tencent' && qqFailed) return json({ code: 429 }, 429)
      return json(offset === 0 ? [{ id: 'same', name: '第一首' }, { id: 'next', name: '第二首' }] : [])
    }
    const first = (await search()).body
    expect(first.sources.map(source => source.nextOffset)).toEqual([2, 0, 2])
    const pages = Object.fromEntries(first.sources.filter(source => source.hasMore).map(source => [source.source, source.nextOffset]))
    const next = (await search(pages)).body
    expect(next.sources.map(source => source.source)).toEqual(['api-enhanced', 'meting-kugou'])
    expect(next.sources.every(source => !source.hasMore)).toBe(true)
    const repeat = (await search(pages)).body
    expect(repeat.data.map(song => song.mediaRef)).toEqual(next.data.map(song => song.mediaRef))
    qqFailed = false
    gateway.controls.calls.length = 0
    const retry = (await search({ 'meting-tencent': 0 })).body
    expect(retry.sources[0]).toMatchObject({ source: 'meting-tencent', offset: 0, nextOffset: 2, status: 'ok' })
    expect(gateway.controls.calls).toHaveLength(1)
    expect(gateway.controls.calls[0].searchParams.get('page')).toBe('1')
  })

  it('rejects invalid pages, keeps auth and reports disabled sources without dispatch', async () => {
    expect((await search({ unknown: 0 })).status).toBe(400)
    expect((await search({ 'api-enhanced': -1 })).status).toBe(400)
    expect((await search({ 'meting-kugou': 1 })).status).toBe(400)
    expect((await search({}, ' ')).status).toBe(400)
    expect((await gateway.request('/dreammusic/api/v2/search?aggregate=true&keywords=a')).status).toBe(401)
    expect(gateway.controls.calls).toHaveLength(0)
    gateway.orchestrator.registry.setEnabled('meting-kugou', false)
    const response = await search()
    expect(response.body.status).toBe('partial_failure')
    expect(response.body.sources[2].errorCode).toBe('SOURCE_UNAVAILABLE')
    expect(gateway.controls.calls).toHaveLength(2)
  })
})
