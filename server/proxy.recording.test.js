// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { startIdentityGateway } from './test-support/identityGateway.js'
import { RecordingSearchGroups, sameRecording } from './music/recordingMatcher.js'

let gateway
beforeAll(async () => { gateway = await startIdentityGateway() })
afterAll(async () => { await gateway.close() })
beforeEach(() => {
  gateway.controls.calls.length = 0
  gateway.controls.beforeResponse = async () => {}
  gateway.controls.thirdPartyResponse = () => null
  gateway.orchestrator.searchSessions.clear()
  for (const source of gateway.orchestrator.registry.sources.values()) source.adapter.clearCache?.()
})
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
async function search({ session, pages, keywords = '校准样本', limit = 30 } = {}) {
  const query = new URLSearchParams({ aggregate: 'true', merge: 'true', keywords, limit: String(limit) })
  if (session !== undefined) query.set('searchSession', session)
  if (pages) query.set('pages', JSON.stringify(pages))
  return gateway.request('/dreammusic/api/v2/search?' + query, { headers: { 'X-API-Key': gateway.apiKey } })
}

describe('T04 recording groups through real HTTP and adapters', () => {
  it('calibrates conservative positives and version/missing-evidence negatives without deleting raw evidence', async () => {
    const cases = [
      { name: '标准录音', match: true },
      { name: '多歌手录音', artists: ['甲', '乙'], match: true },
      { name: '同名异曲', qqArtists: ['别的歌手'] },
      { name: '缺歌手', qqArtists: [] },
      { name: '缺专辑', qqAlbum: '' },
      { name: '不同专辑', qqAlbum: '另一发行' },
      { name: '缺时长', qqDuration: 0 },
      { name: '时长偏差', qqDuration: 203 },
      { name: '时长接近仍不够', qqAlbum: '' },
      { name: '演出 (Live)' }, { name: '翻唱 (Cover)' }, { name: '重录版' },
      { name: '伴奏版' }, { name: 'Remix' }, { name: '变速版' },
      { name: '重制 Remastered' }, { name: '未知 (特别发行)' },
      { name: '副标题证据', aliases: ['现场录音'] },
      { name: '未解释的原标题', originalTitle: '原歌手 - 未解释的原标题 - Alternate take' },
      { name: '多人缺一', artists: ['甲', '乙'], qqArtists: ['甲'] },
    ]
    const netease = cases.map((c, i) => ({ id: i + 1, name: c.name,
      ar: (c.artists || ['原歌手']).map(name => ({ name })), al: { name: '同一专辑' }, dt: 200000, alia: c.aliases || [] }))
    const qq = cases.map((c, i) => ({ id: 'qq-' + i, name: c.name,
      artist: c.qqArtists ?? (c.artists ? c.artists.slice().reverse() : ['原歌手']),
      originalTitle: c.originalTitle,
      album: c.qqAlbum ?? '同一专辑', duration: c.qqDuration ?? 200.5, alia: c.aliases || [] }))
    gateway.controls.thirdPartyResponse = url => json(url.host === 'upstream.test'
      ? { code: 200, result: { songs: netease, more: false } }
      : url.searchParams.get('server') === 'tencent' ? qq : [])
    const { body } = await search()
    expect(body.status).toBe('success')
    expect(body.groups).toHaveLength(cases.length * 2 - 2)
    for (const [i, c] of cases.entries()) {
      const entry = body.data.find(song => song.source === 'api-enhanced' && song.sourceId === String(i + 1))
      const group = body.groups.find(group => group.entries.some(song => song.mediaRef === entry.mediaRef))
      expect(group.entries.length, c.name).toBe(c.match ? 2 : 1)
      expect(group.entries[0].title).toBe(c.name)
      expect(entry.versionTags).toEqual(c.aliases || [])
      expect(entry.catalogRef).toBe(entry.mediaRef)
    }
    expect(gateway.controls.calls).toHaveLength(3) // No per-song URL/detail/lyrics fanout.
    const picked = body.groups.find(group => group.entries.length === 2).entries[1]
    const audio = await gateway.request('/dreammusic/api/v2/song/url/v1?mediaRef=' + picked.mediaRef,
      { headers: { 'X-API-Key': gateway.apiKey } })
    expect(audio.body.catalogRef).toBe(picked.catalogRef)
    expect(audio.body.playbackSource).toBe('meting-tencent')
  })

  it('keeps group ID/representative and all entries across late sources, repeated pages and failed retries', async () => {
    let failed = true
    gateway.controls.thirdPartyResponse = url => {
      if (url.host === 'upstream.test') return json({ code: 200, result: { songs: [gateway.song], more: false } })
      if (url.searchParams.get('server') === 'kugou') return json([])
      if (failed) return json({ message: 'try later' }, 429)
      const offset = Number(url.searchParams.get('page'))
      return json([{ id: offset === 1 ? 'qq-original' : 'qq-live', name: offset === 1 ? gateway.song.name : '目录歌曲 (Live)',
        artist: ['原歌手'], album: '目录专辑', duration: 90 }])
    }
    const first = (await search({ limit: 1 })).body
    expect(first.status).toBe('partial_failure')
    const id = first.groups[0].id
    failed = false
    const retry = (await search({ limit: 1, session: first.searchSession, pages: { 'meting-tencent': 0 } })).body
    expect(retry.groups).toHaveLength(1)
    expect(retry.groups[0].id).toBe(id)
    expect(retry.groups[0].entries.map(song => song.source)).toEqual(['api-enhanced', 'meting-tencent'])
    const pickedRef = retry.groups[0].entries[1].mediaRef
    const repeated = (await search({ limit: 1, session: first.searchSession, pages: { 'meting-tencent': 0 } })).body
    expect(repeated.groups).toEqual(retry.groups)
    const next = (await search({ limit: 1, session: first.searchSession, pages: { 'meting-tencent': 1 } })).body
    expect(next.groups).toHaveLength(2)
    expect(next.groups[0].entries[1].mediaRef).toBe(pickedRef)
    expect(next.groups[1].reason).toBe('version_uncertain')
    // Simulate lost page response: retry returns the full stable session snapshot.
    expect((await search({ limit: 1, session: first.searchSession, pages: { 'meting-tencent': 1 } })).body.groups).toEqual(next.groups)
  })

  it('rejects foreign/expired/mismatched sessions without dispatch or silently discarding earlier candidates', async () => {
    const first = (await search()).body
    gateway.controls.calls.length = 0
    expect((await search({ session: 'unknown' })).body.errorCode).toBe('INVALID_SEARCH_SESSION')
    expect((await search({ session: first.searchSession, keywords: '换词' })).status).toBe(400)
    expect((await search({ session: first.searchSession, limit: 2 })).status).toBe(400)
    const session = gateway.orchestrator.searchSessions.get(first.searchSession)
    session.userId = -1
    expect((await search({ session: first.searchSession })).status).toBe(400)
    session.userId = gateway.userId
    session.expiresAt = 0
    expect((await search({ session: first.searchSession })).status).toBe(400)
    expect(gateway.controls.calls).toHaveLength(0)
  })

  it('does not chain duration tolerance or choose the first ambiguous group', () => {
    const song = (id, durationMs) => ({ mediaRef: id, title: '标准录音', artists: ['歌手'], album: { name: '专辑' }, durationMs })
    const a = song('a', 200000), b = song('b', 202000), bridge = song('bridge', 201000)
    expect(sameRecording(a, b)).toBe(true)
    const grouped = new RecordingSearchGroups()
    grouped.append([a, b])
    expect(grouped.append([song('c', 204000)])).toHaveLength(2)
    const ambiguous = new RecordingSearchGroups()
    ambiguous.append([a, song('far', 204000)])
    expect(ambiguous.append([song('middle', 202000)])).toHaveLength(3)
    expect(sameRecording(a, bridge)).toBe(true)
  })
})
