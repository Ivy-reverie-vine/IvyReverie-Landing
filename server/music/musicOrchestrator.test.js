import { describe, expect, it } from 'vitest'
import {
  DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL,
  DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT,
} from '../playbackDiagnostics.js'
import { createMediaRef } from '../mediaContract.js'
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
  it('keeps a selected search on its source and never silently falls back', async () => {
    const calls = []
    const orchestrator = new MusicOrchestrator({
      registry: createRegistry(['api-enhanced', 'meting-kugou'].map(id => ({
        adapter: { id, capabilities: () => ['search'], request: async ({ query }) => {
          calls.push({ id, query })
          return { status: 200, body: { code: 200, data: [] } }
        } }, config: { priority: id === 'api-enhanced' ? 100 : 10 },
      }))), diagnostics: diagnostics(),
    })
    await orchestrator.dispatch({ path: 'search', sourceId: 'meting-kugou', query: { keywords: 'test', source: 'meting-kugou' } })
    expect(calls).toEqual([{ id: 'meting-kugou', query: { keywords: 'test' } }])
    await expect(orchestrator.dispatch({ path: 'search', sourceId: 'disabled', query: {} })).rejects.toMatchObject({ code: 'SOURCE_UNAVAILABLE' })
    expect(calls).toHaveLength(1)
  })
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

  it('falls back after a rate-limit error', async () => {
    const primary = {
      id: 'api-enhanced',
      capabilities: () => ['search'],
      request: async () => {
        const error = new Error('rate limited')
        error.code = 'SOURCE_RATE_LIMIT'
        throw error
      },
    }
    const fallback = {
      id: 'fallback',
      capabilities: () => ['search'],
      request: async () => ({ status: 200, body: { code: 200, data: [{ sourceId: 'fallback-1' }] } }),
    }
    const orchestrator = new MusicOrchestrator({
      registry: createRegistry([
        { adapter: primary, config: { priority: 100 } },
        { adapter: fallback, config: { priority: 10 } },
      ]),
      diagnostics: diagnostics(),
    })

    const result = await orchestrator.dispatch({ path: 'search', query: { keywords: 'test' } })

    expect(result.body.data[0].sourceId).toBe('fallback-1')
  })

  it('returns a unified error when no source declares the requested capability', async () => {
    const orchestrator = new MusicOrchestrator({
      registry: createRegistry([{
        adapter: { id: 'metadata-only', capabilities: () => ['detail'], request: async () => ({}) },
        config: { priority: 100 },
      }]),
      diagnostics: diagnostics(),
    })

    await expect(orchestrator.dispatch({ path: 'lyric/new', query: { id: '1' } }))
      .rejects.toMatchObject({ code: 'NO_SOURCE' })
  })

  it('preserves an upstream error response body for compatibility', async () => {
    const orchestrator = new MusicOrchestrator({
      registry: createRegistry([{
        adapter: {
          id: 'api-enhanced',
          capabilities: () => ['search'],
          request: async () => ({ status: 429, body: { code: 429, message: 'rate limited' } }),
        },
        config: { priority: 100 },
      }]),
      diagnostics: diagnostics(),
    })

    const result = await orchestrator.dispatch({ path: 'search', query: { keywords: 'test' } })

    expect(result).toEqual({ status: 429, body: { code: 429, message: 'rate limited' } })
  })

  it('routes a versioned mediaRef to exactly its declared source', async () => {
    const calls = []
    const orchestrator = new MusicOrchestrator({
      registry: createRegistry([{
        adapter: {
          id: 'audius',
          capabilities: () => ['playback'],
          request: async ({ query }) => {
            calls.push(query)
            return { status: 200, body: { code: 200, data: [{ url: 'https://cdn.test/track.mp3' }] } }
          },
        },
        config: { priority: 10 },
      }]),
      diagnostics: diagnostics(),
    })
    const mediaRef = createMediaRef({ source: 'audius', sourceId: 'track-1' })

    const result = await orchestrator.dispatchMediaRef({
      path: 'song/url/v1',
      mediaRef,
      query: { mediaRef, level: 'exhigh' },
    })

    expect(result.body.data[0].url).toContain('track.mp3')
    expect(calls).toEqual([{ level: 'exhigh', id: 'track-1' }])
  })
})
