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
})
