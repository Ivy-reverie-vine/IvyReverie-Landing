import { describe, expect, it } from 'vitest'
import {
  DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL,
  DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT,
} from '../playbackDiagnostics.js'
import { MusicOrchestrator } from './musicOrchestrator.js'
import { MusicSourceRegistry } from './sourceRegistry.js'

function diagnostics() {
  return {
    events: [],
    record(event) {
      this.events.push(event)
    },
  }
}

function createRegistry(sources) {
  const registry = new MusicSourceRegistry()
  for (const source of sources) registry.register(source.adapter, source.config)
  return registry
}

describe('MusicOrchestrator', () => {
  it('keeps the highest-priority source as the default', async () => {
    const calls = []
    const first = {
      id: 'api-enhanced',
      capabilities: () => ['search'],
      request: async () => {
        calls.push('api-enhanced')
        return { status: 200, body: { code: 200, result: { songs: ['first'] } } }
      },
    }
    const second = {
      id: 'future-source',
      capabilities: () => ['search'],
      request: async () => {
        calls.push('future-source')
        return { status: 200, body: { code: 200, result: { songs: ['second'] } } }
      },
    }
    const orchestrator = new MusicOrchestrator({
      registry: createRegistry([
        { adapter: first, config: { priority: 100 } },
        { adapter: second, config: { priority: 10 } },
      ]),
      diagnostics: diagnostics(),
    })

    const result = await orchestrator.dispatch({ path: 'search', query: { keywords: 'test' } })

    expect(result.body.result.songs).toEqual(['first'])
    expect(calls).toEqual(['api-enhanced'])
  })

  it('falls back after a source timeout', async () => {
    const events = diagnostics()
    const fallback = {
      id: 'fallback',
      capabilities: () => ['playback'],
      request: async () => ({ status: 200, body: { code: 200, data: [{ url: 'https://cdn.test/song.mp3' }] } }),
    }
    const primary = {
      id: 'api-enhanced',
      capabilities: () => ['playback'],
      request: async () => {
        const error = new Error('timed out')
        error.code = 'UPSTREAM_TIMEOUT'
        throw error
      },
    }
    const orchestrator = new MusicOrchestrator({
      registry: createRegistry([
        { adapter: primary, config: { priority: 100 } },
        { adapter: fallback, config: { priority: 10 } },
      ]),
      diagnostics: events,
    })

    const result = await orchestrator.dispatch({ path: 'song/url/v1', query: { id: '1' } })

    expect(result.body.data[0].url).toContain('song.mp3')
    expect(events.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'api-enhanced', errorCategory: DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT }),
    ]))
  })

  it('preserves an empty playback response when every source has no URL', async () => {
    const events = diagnostics()
    const orchestrator = new MusicOrchestrator({
      registry: createRegistry([{
        adapter: {
          id: 'api-enhanced',
          capabilities: () => ['playback'],
          request: async () => ({ status: 200, body: { code: 200, data: [{ url: '' }] } }),
        },
        config: { priority: 100 },
      }]),
      diagnostics: events,
    })

    const result = await orchestrator.dispatch({ path: 'song/url/v1', query: { id: '2' } })

    expect(result.body.data[0].url).toBe('')
    expect(events.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ errorCategory: DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL }),
    ]))
  })
})
