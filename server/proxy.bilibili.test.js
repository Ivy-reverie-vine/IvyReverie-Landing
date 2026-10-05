// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'
import { createMediaRef, parseMediaRef } from './mediaContract.js'
import { createServer } from 'node:http'

const bvid = 'BV1GJ411x7h7'
const ref = cid => createMediaRef({ source: 'bilibili', sourceId: `${bvid}:${cid}` })
const json = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
let gateway, mode, calls, mediaServer, mediaBase, mediaCalls
beforeEach(async () => {
  gateway = await startIdentityGateway({ bilibili: true, mediaProxy: true })
  mode = 'ok'; calls = []; mediaCalls = []
  mediaServer = createServer((req, res) => {
    mediaCalls.push({ path: req.url, headers: req.headers })
    if (req.url === '/redirect') { res.writeHead(302, { Location: '/audio.m4a' }); return res.end() }
    res.writeHead(mode === 'media-failure' ? 503 : 206, {
      'Content-Type': 'audio/mp4', 'Content-Range': 'bytes 0-3/400', 'Accept-Ranges': 'bytes',
    }); res.end(mode === 'media-failure' ? 'unavailable' : 'AAC!')
  })
  await new Promise(resolve => mediaServer.listen(0, '127.0.0.1', resolve))
  mediaBase = `http://127.0.0.1:${mediaServer.address().port}`
  gateway.controls.thirdPartyResponse = async (url, init) => {
    calls.push({ url, init })
    if (url.pathname === '/x/web-interface/view') return json({ code: 0, data: {
      bvid, title: '视频合集', owner: { mid: 9, name: '上传者不是歌手' },
      pages: [{ cid: 111, page: 1, part: '第一曲', duration: 120 }, { cid: 222, page: 2, part: '指定第二曲', duration: 90 }],
    } })
    if (url.pathname === '/x/player/playurl') return json({ code: 0, data: {
      ...(mode === 'mismatch' ? { cid: 111 } : {}), timelength: 90000,
      dash: { duration: 90, audio: mode === 'empty' ? [] : [{ id: 30280,
        baseUrl: mediaBase + '/redirect', mimeType: 'audio/mp4',
        codecs: mode === 'unsupported' ? 'ec-3' : 'mp4a.40.2' }] },
    } })
    if (url.origin === mediaBase) return fetch(url, init)
    return null
  }
})
afterEach(async () => {
  await gateway.close()
  await new Promise(resolve => mediaServer.close(resolve))
})
const request = (path, mediaRef = ref(222)) => gateway.request('/dreammusic/api/v2/' + path + '?' +
  new URLSearchParams({ mediaRef, id: '111', cid: '111' }), { headers: { 'X-API-Key': gateway.apiKey } })

describe('specified Bilibili part through real HTTP/auth/orchestration/adapter/proxy', () => {
  it('preserves the selected second part, uploader and unknown integrity; streams with server headers and Range', async () => {
    const detail = await request('song/detail')
    expect(detail.body.data[0]).toMatchObject({ source: 'bilibili', sourceId: `${bvid}:222`,
      title: '指定第二曲', artists: [], durationMs: 90000, resource: { page: 2, cid: '222', uploader: { name: '上传者不是歌手' } } })
    const result = await request('song/url/v1', detail.body.data[0].mediaRef)
    expect(result.status).toBe(200)
    expect(parseMediaRef(result.body.playbackRef)).toMatchObject({ source: 'bilibili', sourceId: `${bvid}:222` })
    expect(result.body.catalogRef).toBe(detail.body.data[0].catalogRef)
    expect(result.body.audioIntegrity).toMatchObject({ status: 'unknown', resourceDurationMs: 90000 })
    expect(result.body.data[0]).toMatchObject({ resource: { page: 2, cid: '222' }, media: { delivery: 'dash_audio', codecs: 'mp4a.40.2' } })
    expect(JSON.stringify(result.body)).not.toContain('mediaTransport')
    expect(result.body.data[0].url).not.toContain(mediaBase)
    const media = await fetch(result.body.data[0].url, { headers: { Range: 'bytes=0-3', 'If-Range': '"media-etag"' } })
    expect(media.status).toBe(206)
    expect(media.headers.get('content-range')).toBe('bytes 0-3/400')
    expect(await media.text()).toBe('AAC!')
    expect(mediaCalls.map(call => call.path)).toEqual(['/redirect', '/audio.m4a'])
    for (const { headers } of mediaCalls) {
      expect(headers).toMatchObject({ referer: `https://www.bilibili.com/video/${bvid}/`,
        'user-agent': 'Mozilla/5.0', range: 'bytes=0-3', 'if-range': '"media-etag"' })
      expect(headers.cookie).toBeUndefined()
    }
    expect(calls.filter(call => call.url.pathname === '/x/player/playurl').every(call => call.url.searchParams.get('cid') === '222')).toBe(true)
  })

  it('rejects wrong CID without requesting or returning the first part', async () => {
    const result = await request('song/url/v1', ref(999))
    expect(result.status).toBe(404)
    expect(result.body.errorCode).toBe('BILIBILI_CID_NOT_FOUND')
    expect(result.body.data).toEqual([])
    expect(calls.some(call => call.url.pathname === '/x/player/playurl')).toBe(false)
  })

  it.each([['empty', 'BILIBILI_NO_AUDIO'], ['unsupported', 'BILIBILI_FORMAT_UNSUPPORTED'],
    ['mismatch', 'RESOURCE_IDENTITY_MISMATCH']])('reports %s explicitly', async (value, errorCode) => {
    mode = value
    const result = await request('song/url/v1')
    expect(result.status).toBe(502)
    expect(result.body.errorCode).toBe(errorCode)
    expect(result.body.audioIntegrity.status).toBe('unavailable')
    expect(result.body.data).toEqual([])
  })

  it('separates a obtained URL from a failed media transfer', async () => {
    mode = 'media-failure'
    const result = await request('song/url/v1')
    expect(result.status).toBe(200)
    const media = await fetch(result.body.data[0].url, { headers: { Range: 'bytes=0-3', 'If-Range': '"media-etag"' } })
    expect(media.status).toBe(503)
    await media.arrayBuffer()
    expect(result.body.audioIntegrity.status).toBe('unknown')
  })

  it('respects source enablement, concurrency, supported capabilities and the mandatory proxy', async () => {
    gateway.orchestrator.setSourceEnabled('bilibili', false)
    expect((await request('song/url/v1')).status).toBe(503)
    gateway.orchestrator.setSourceEnabled('bilibili', true)
    const source = gateway.orchestrator.registry.get('bilibili')
    source.inFlight = source.maxConcurrent
    expect((await request('song/url/v1')).status).toBe(503)
    source.inFlight = 0
    expect((await request('lyric/new')).status).toBe(501)
    gateway.config.mediaProxy.enabled = false
    const result = await request('song/url/v1')
    expect(result.status).toBe(503)
    expect(result.body.errorCode).toBe('MEDIA_PROXY_REQUIRED')
    expect(result.body.data).toEqual([])
  })

  it('re-resolves short-lived URLs and never promotes URL access to a full-audio success', async () => {
    await request('song/url/v1'); await request('song/url/v1')
    expect(calls.filter(call => call.url.pathname === '/x/player/playurl')).toHaveLength(2)
    expect(gateway.orchestrator.sourceStatuses().find(source => source.id === 'bilibili').metrics.playbackSuccesses).toBe(0)
  })
})
