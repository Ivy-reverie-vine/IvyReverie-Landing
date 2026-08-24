import { describe, expect, it } from 'vitest'
import { MetingAdapter } from './metingAdapter.js'

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('MetingAdapter', () => {
  it('normalizes Tencent and KuGou results without exposing raw platform fields', async () => {
    const requests = []
    const fetchImpl = async (url) => {
      requests.push(new URL(url))
      if (url.searchParams.get('server') === 'tencent') {
        return response([{ id: 'qq-001', name: '测试歌曲', artist: ['歌手 A'], album: '专辑 A', pic_id: 'pic-1' }])
      }
      return response([{ id: 'kg-002', title: '另一首歌', author: '歌手 B / 歌手 C', album: '专辑 B' }])
    }
    const tencent = new MetingAdapter({ platform: 'tencent', baseUrl: 'https://meting.test/api', fetchImpl })
    const kugou = new MetingAdapter({ platform: 'kugou', baseUrl: 'https://meting.test/api', fetchImpl })

    const tencentResult = await tencent.request({ path: 'search', query: { keywords: '测试' } })
    const kugouResult = await kugou.request({ path: 'search', query: { keywords: '测试' } })

    expect(tencentResult.body.data[0]).toMatchObject({
      source: 'meting-tencent', sourceId: 'qq-001', title: '测试歌曲', artists: ['歌手 A'],
    })
    expect(kugouResult.body.data[0]).toMatchObject({
      source: 'meting-kugou', sourceId: 'kg-002', title: '另一首歌', artists: ['歌手 B', '歌手 C'],
    })
    expect(tencentResult.body.data[0]).not.toHaveProperty('url_id')
    expect(kugouResult.body.data[0]).not.toHaveProperty('raw')
    expect(requests.map((url) => url.searchParams.get('server'))).toEqual(['tencent', 'kugou'])
    expect(requests[0].searchParams.has('cookie')).toBe(false)
  })

  it('resolves a short-lived playback URL and caches the fixture', async () => {
    let calls = 0
    const adapter = new MetingAdapter({
      platform: 'kuwo',
      baseUrl: 'https://meting.test/api',
      fetchImpl: async () => {
        calls += 1
        return response({ url: 'https://cdn.test/track.mp3' })
      },
      cacheTtlMs: 1000,
      minRequestIntervalMs: 0,
    })

    const first = await adapter.request({ path: 'song/url/v1', query: { id: 'kw-1' } })
    const second = await adapter.request({ path: 'song/url/v1', query: { id: 'kw-1' } })

    expect(first.body.data[0]).toMatchObject({ source: 'meting-kuwo', sourceId: 'kw-1' })
    expect(second.body.data[0].url).toBe('https://cdn.test/track.mp3')
    expect(calls).toBe(1)
  })

  it('maps a timeout to a safe source error', async () => {
    const adapter = new MetingAdapter({
      platform: 'tencent',
      baseUrl: 'https://meting.test/api',
      fetchImpl: (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => reject(new Error('aborted')))
      }),
    })

    await expect(adapter.request({ path: 'search', query: { keywords: '超时' }, timeoutMs: 1 }))
      .rejects.toMatchObject({ code: 'SOURCE_TIMEOUT' })
  })

  it('enforces a per-source request interval after cache misses', async () => {
    const waits = []
    const adapter = new MetingAdapter({
      platform: 'tencent',
      baseUrl: 'https://meting.test/api',
      fetchImpl: async () => response([]),
      minRequestIntervalMs: 1000,
      sleep: async (ms) => waits.push(ms),
    })

    await adapter.request({ path: 'search', query: { keywords: '一' } })
    await adapter.request({ path: 'search', query: { keywords: '二' } })

    expect(waits).toHaveLength(1)
    expect(waits[0]).toBeGreaterThan(0)
  })
})
