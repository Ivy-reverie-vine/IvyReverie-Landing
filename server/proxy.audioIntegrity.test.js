// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'
import { createMediaRef } from './mediaContract.js'

let gateway
beforeAll(async () => { gateway = await startIdentityGateway() })
afterAll(async () => { await gateway?.close() })
beforeEach(() => {
  gateway.controls.thirdPartyResponse = () => null
  gateway.controls.calls.length = 0
  for (const id of ['api-enhanced', 'meting-tencent']) {
    gateway.orchestrator.registry.resetCircuit(id)
    gateway.orchestrator.registry.get(id).adapter.clearCache?.()
  }
})
const json = body => new Response(JSON.stringify(body), { status: 200 })

describe('T05 provider HTTP evidence through real gateway', () => {
  for (const source of ['api-enhanced', 'meting-tencent']) {
    const netease = source === 'api-enhanced'
    const id = netease ? '123' : 'qq-001'
    const full = netease ? { id: 123, url: 'https://audio.test/full', time: 90000, freeTrialInfo: null }
      : { url: 'https://audio.test/full', durationMs: 90000, isPreview: false }
    const cases = [
      ['full', 'provider_duration_and_non_trial', full],
      ['preview', 'explicit_trial', { ...full, freeTrialInfo: { start: 0, end: 30 } }],
      ['preview', 'resource_shorter', { ...full, [netease ? 'time' : 'durationMs']: 30000 }],
      ['unknown', 'duration_mismatch', { ...full, [netease ? 'time' : 'durationMs']: 120000 }],
      ['unknown', 'missing_evidence', { id, url: full.url }],
      ['unknown', 'missing_evidence', { ...full, [netease ? 'freeTrialInfo' : 'isPreview']: undefined }],
      ['unknown', 'missing_evidence', { ...full, [netease ? 'time' : 'durationMs']: undefined }],
      ['unknown', 'missing_evidence', { ...full, freeTrialInfo: 'null' }],
      ['unavailable', 'empty_url', { ...full, url: '' }],
      ['unavailable', 'invalid_url', { ...full, url: 'file:///audio.mp3' }],
      ['unavailable', 'resource_identity_mismatch', { ...full, id: 'wrong-recording' }],
    ]
    for (const [status, reason, raw] of cases) {
      it(`${source} preserves ${status}/${reason} despite HTTP 200`, async () => {
        gateway.controls.thirdPartyResponse = url => {
          if (netease ? url.pathname === '/song/url/v1' : url.searchParams.get('type') === 'url') {
            return json(netease ? { code: 200, data: [raw] } : raw)
          }
          return null
        }
        const mediaRef = createMediaRef({ source, sourceId: id })
        const response = await gateway.request(`/dreammusic/api/v2/song/url/v1?mediaRef=${mediaRef}`, {
          headers: { 'X-API-Key': gateway.apiKey },
        })
        expect(response.status).toBe(200)
        expect(response.body).toMatchObject({ catalogRef: mediaRef, playbackRef: mediaRef,
          playbackSource: source, audioIntegrity: { status, reason } })
        expect(response.body.audioIntegrity.evidence).not.toContain('lyrics')
        expect(gateway.controls.calls.some(url => url.pathname === '/lyric/new')).toBe(false)
        expect(gateway.controls.calls.every(url => netease ? url.host === 'upstream.test' : url.host === 'meting.test')).toBe(true)
      })
    }
  }
  it('does not open a service circuit for valid preview/unknown answers or count them as full playback', async () => {
    const source = gateway.orchestrator.registry.get('api-enhanced')
    const successes = source.metrics.playbackSuccesses
    gateway.controls.thirdPartyResponse = url => url.pathname === '/song/url/v1'
      ? json({ code: 200, data: [{ id: 123, url: 'https://audio.test/preview', freeTrialInfo: { start: 0, end: 30 } }] }) : null
    for (let i = 0; i < 8; i++) {
      const response = await gateway.request(`/dreammusic/api/v2/song/url/v1?mediaRef=${createMediaRef({ source: 'api-enhanced', sourceId: '123' })}`,
        { headers: { 'X-API-Key': gateway.apiKey } })
      expect(response.body.audioIntegrity.status).toBe('preview')
    }
    expect(source.failureStreak).toBe(0)
    expect(source.metrics.playbackSuccesses).toBe(successes)
  })
})
