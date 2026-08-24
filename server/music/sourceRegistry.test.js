import { describe, expect, it } from 'vitest'
import { MusicSourceRegistry } from './sourceRegistry.js'

function adapter(id, capabilities = ['search']) {
  return { id, capabilities: () => capabilities, request: async () => ({ status: 200, body: { code: 200 } }) }
}

describe('MusicSourceRegistry', () => {
  it('returns enabled sources by capability and priority', () => {
    const registry = new MusicSourceRegistry()
    registry.register(adapter('low'), { priority: 10 })
    registry.register(adapter('high'), { priority: 100 })
    registry.register(adapter('disabled'), { enabled: false, priority: 1000 })

    expect(registry.list({ capability: 'search' }).map((source) => source.id)).toEqual(['high', 'low'])
  })

  it('rejects duplicate source ids', () => {
    const registry = new MusicSourceRegistry()
    registry.register(adapter('api-enhanced'))

    expect(() => registry.register(adapter('api-enhanced'))).toThrow('already registered')
  })

  it('opens a circuit after repeated failures and allows a half-open recovery probe', () => {
    let now = 1000
    const registry = new MusicSourceRegistry({ now: () => now })
    registry.register(adapter('audius'), {
      circuitFailureThreshold: 2,
      circuitOpenMs: 1000,
    })
    const source = registry.get('audius')

    expect(registry.beginRequest(source)).toBe(true)
    registry.recordResult(source, { capability: 'search', ok: false, errorCategory: 'source_timeout' })
    registry.endRequest(source)
    expect(registry.list({ capability: 'search' })).toHaveLength(1)

    expect(registry.beginRequest(source)).toBe(true)
    registry.recordResult(source, { capability: 'search', ok: false, errorCategory: 'source_timeout' })
    registry.endRequest(source)
    expect(registry.list({ capability: 'search' })).toHaveLength(0)
    expect(registry.publicStatus(source).circuit.state).toBe('open')

    now += 1001
    expect(registry.list({ capability: 'search' })).toHaveLength(1)
    expect(registry.beginRequest(source)).toBe(true)
    registry.recordResult(source, { capability: 'search', ok: true })
    registry.endRequest(source)
    expect(registry.publicStatus(source).circuit.state).toBe('closed')
    expect(registry.publicStatus(source).metrics.searchSuccessRate).toBe(1 / 3)
  })

  it('tracks playback success, URL failures and latency without exposing adapter state', () => {
    const registry = new MusicSourceRegistry({ now: () => 2000 })
    registry.register(adapter('meting-tencent'), { maxConcurrent: 1 })
    const source = registry.get('meting-tencent')

    expect(registry.beginRequest(source)).toBe(true)
    expect(registry.beginRequest(source)).toBe(false)
    registry.recordResult(source, {
      capability: 'playback', ok: true, playbackOk: true, durationMs: 40,
    })
    registry.endRequest(source)
    expect(registry.beginRequest(source)).toBe(true)
    registry.recordResult(source, {
      capability: 'playback', ok: true, playbackOk: false, durationMs: 60,
      errorCategory: 'empty_playback_url',
    })
    registry.endRequest(source)

    expect(registry.publicStatus(source)).toMatchObject({
      metrics: {
        playbackRequests: 2,
        playbackSuccesses: 1,
        urlFailures: 1,
        playbackSuccessRate: 0.5,
        averageLatencyMs: 50,
      },
    })
  })
})
