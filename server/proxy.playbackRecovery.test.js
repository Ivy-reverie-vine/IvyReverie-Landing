// @vitest-environment node
import { beforeAll, afterAll, beforeEach, describe, it, expect } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'
import { createMediaRef } from './mediaContract.js'
import { rememberPlayback } from './music/playbackRecovery.js'

let gateway, version, status
const json = body => new Response(JSON.stringify(body), { status: 200 })
beforeAll(async () => { gateway = await startIdentityGateway({ mediaProxy: true }) })
afterAll(async () => { await gateway.close() })
beforeEach(() => {
  version = 1; status = 'full'
  gateway.controls.beforeResponse = async () => {}
  gateway.controls.calls.length = 0
  gateway.orchestrator.searchSessions.clear()
  gateway.orchestrator.playbackReceipts?.clear()
  for (const source of gateway.orchestrator.registry.sources.values()) {
    source.adapter.clearCache?.(); gateway.orchestrator.resetSourceCircuit(source.id)
  }
  gateway.controls.thirdPartyResponse = url => {
    if (url.searchParams.get('type') === 'search') return json([{ id: 'selected', name: gateway.song.name,
      artist: ['原歌手'], album: '目录专辑', duration: 90 }])
    if (url.searchParams.get('type') === 'song') return json([{ id: 'selected', duration: 90 }])
    if (url.searchParams.get('type') === 'url') return json({ url: status === 'unavailable' ? '' : `https://audio.test/v${version}.mp3`,
      durationMs: 90000, isPreview: status === 'preview' })
    return null
  }
})
const request = params => gateway.request('/dreammusic/api/v2/song/url/v1?' + new URLSearchParams(params),
  { headers: { 'X-API-Key': gateway.apiKey } })
async function select() {
  const { body } = await gateway.request('/dreammusic/api/v2/search?aggregate=true&merge=true&keywords=目录',
    { headers: { 'X-API-Key': gateway.apiKey } })
  const catalogRef = body.data.find(row => row.source === 'api-enhanced').mediaRef
  const mediaRef = body.data.find(row => row.source === 'meting-tencent').mediaRef
  return request({ manual: 'true', mediaRef, catalogRef, searchSession: body.searchSession })
}
const recover = body => request({ recover: 'true', mediaRef: body.playbackRef, recoveryToken: body.recoveryToken })

describe('T13 authenticated exact-resource URL recovery', () => {
  it('bypasses a still-live URL cache, preserves roles and survives expired search pages', async () => {
    const { body: initial } = await select()
    expect(initial.recoveryToken).toBeTruthy()
    version = 2; gateway.orchestrator.searchSessions.clear(); gateway.controls.calls.length = 0
    const { body: recovered } = await recover(initial)
    for (const key of ['catalogRef', 'playbackRef', 'lyricsRef', 'playbackSource', 'lyricsSource']) expect(recovered[key]).toBe(initial[key])
    expect(recovered.data[0].url).not.toBe(initial.data[0].url)
    expect(gateway.controls.calls.filter(url => url.searchParams.get('type') === 'url')).toHaveLength(1)
    expect(gateway.controls.calls.every(url => url.searchParams.get('server') === 'tencent')).toBe(true)
    expect(gateway.controls.calls.find(url => url.searchParams.get('type') === 'url').searchParams.get('timestamp')).toBeTruthy()
  })
  it.each(['preview', 'unavailable'])('keeps %s terminal evidence and never chooses another recording', async value => {
    const { body } = await select(); status = value; gateway.controls.calls.length = 0
    const result = await recover(body)
    expect(result.body.audioIntegrity.status).toBe(value)
    expect(result.body.playbackRef).toBe(body.playbackRef)
    expect(gateway.controls.calls.every(url => url.searchParams.get('server') === 'tencent')).toBe(true)
  })
  it('rejects foreign, forged, expired and resource-mismatched receipts before provider work', async () => {
    const { body } = await select(); gateway.controls.calls.length = 0
    const receipt = gateway.orchestrator.playbackReceipts.get(body.recoveryToken)
    receipt.userId = -1; expect((await recover(body)).body.errorCode).toBe('INVALID_PLAYBACK_RECEIPT')
    receipt.userId = gateway.userId; receipt.expiresAt = 0
    expect((await recover(body)).status).toBe(400)
    receipt.expiresAt = Date.now() + 1000
    expect((await recover({ ...body, recoveryToken: 'forged' })).status).toBe(400)
    expect((await recover({ ...body, playbackRef: body.catalogRef })).status).toBe(400)
    expect(gateway.controls.calls).toHaveLength(0)
  })
  it('bounds slow provider work and releases concurrency', async () => {
    const { body } = await select()
    const source = gateway.orchestrator.registry.get('meting-tencent'); source.timeoutMs = 30
    gateway.controls.beforeResponse = () => new Promise(() => {})
    const start = Date.now(), result = await recover(body)
    expect(result.status).toBe(502); expect(Date.now() - start).toBeLessThan(500)
    expect(source.inFlight).toBe(0); source.timeoutMs = 8000
  })
  it('revalidates automatic Bilibili recording evidence and refuses an edited video', async () => {
    const mediaRef = createMediaRef({ source: 'bilibili', sourceId: 'BV1xx411c7mD:123' })
    const catalogRef = createMediaRef({ source: 'api-enhanced', sourceId: '123' })
    const original = { status: 200, body: { code: 200, mediaRef: catalogRef, catalogRef, playbackRef: mediaRef,
      lyricsRef: catalogRef, playbackSource: 'bilibili', lyricsSource: 'api-enhanced',
      audioIntegrity: { status: 'full' }, data: [{ url: 'https://audio.test/old' }] } }
    const catalog = { source: 'api-enhanced', sourceId: '123', mediaRef: catalogRef, title: '目录歌曲',
      artists: ['原歌手'], album: { name: '目录专辑' }, durationMs: 90000 }
    gateway.orchestrator.searchSessions.set('test-session', { groups: { groups: [{ entries: [catalog] }] } })
    const remembered = rememberPlayback(gateway.orchestrator, original, { id: gateway.userId }, { automatic: 'true', searchSession: 'test-session' })
    const source = gateway.orchestrator.registry.get('bilibili')
    source.enabled = true
    const saved = source.adapter.request
    let edited = false
    source.adapter.request = async () => ({ status: 200, body: { ...original.body,
      recordingCandidate: { durationMs: 90000, title: '目录歌曲', resource: { title: edited ? 'Live' : '目录歌曲', partTitle: '目录歌曲' },
        description: '歌名：目录歌曲\n歌手：原歌手\n专辑：目录专辑\n音频：原专辑音轨\nhttps://music.163.com/song?id=123' } } })
    try {
      expect((await recover(remembered.body)).status).toBe(200)
      edited = true
      expect((await recover(remembered.body)).body.errorCode).toBe('IDENTITY_MISMATCH')
    }
    finally { source.adapter.request = saved }
  })
})
