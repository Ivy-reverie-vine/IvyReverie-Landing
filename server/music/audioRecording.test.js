// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { compareRecordingFingerprints } from './audioRecording.js'
import { assessBilibiliRecording } from './bilibiliMatcher.js'
const series = (seed, length) => {
  let n = seed
  return Array.from({ length }, () => { n ^= n << 13; n ^= n >>> 17; n ^= n << 5; return n >>> 0 })
}
describe('catalog audio proof boundaries', () => {
  it('matches a long diverse preview at the provider-declared position despite small fingerprint errors', () => {
    const sample = series(42, 180)
    expect(compareRecordingFingerprints(sample, [...series(99, 8), ...sample.map((hash, i) => hash ^ (i % 3)), ...series(77, 300)], 1))
      .toMatchObject({ matched: true, sampleHashes: 180 })
  })
  it('rejects different audio, insufficient/repeated samples and extra leading segments', () => {
    const sample = series(42, 180)
    expect(compareRecordingFingerprints(sample, series(99, 400), 1).matched).toBe(false)
    expect(compareRecordingFingerprints(sample.slice(0, 60), sample, 0).matched).toBe(false)
    expect(compareRecordingFingerprints(Array(180).fill(123), Array(400).fill(123), 1).matched).toBe(false)
    expect(compareRecordingFingerprints(sample, [...series(99, 50), ...sample], 1).matched).toBe(false)
  })
  it('binds acoustic evidence to the catalog and still rejects version/duration conflicts', () => {
    const catalog = { mediaRef: 'selected-catalog', source: 'api-enhanced', sourceId: '123',
      title: 'Song', artists: ['Artist'], album: { name: 'Album' }, durationMs: 90000 }
    const entry = { description: '', durationMs: 90000, resource: { title: 'Official MV', partTitle: 'Artist - Song' },
      audioMatch: { matched: true, catalogRef: catalog.mediaRef, policy: 'catalog-preview-chromaprint-v1' } }
    expect(assessBilibiliRecording(catalog, entry).status).toBe('same_recording')
    expect(assessBilibiliRecording(catalog, { ...entry, audioMatch: { ...entry.audioMatch, catalogRef: 'another' } }).status).toBe('manual')
    expect(assessBilibiliRecording(catalog, { ...entry, durationMs: 95000 }).status).toBe('manual')
    for (const title of ['Live', 'Cover', 'Remix', '含额外前奏', '含对白']) {
      expect(assessBilibiliRecording(catalog, { ...entry, resource: { ...entry.resource, title } }).status).toBe('manual')
    }
  })
})
