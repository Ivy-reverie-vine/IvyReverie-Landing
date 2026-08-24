// @vitest-environment node
import { describe, expect, it } from 'vitest'
import {
  createPlaybackDiagnostics,
  DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL,
  DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT,
  DIAGNOSTIC_STAGE_URL_RESPONSE,
} from './playbackDiagnostics.js'

describe('playback diagnostics', () => {
  it('keeps a bounded, redacted event history', () => {
    const diagnostics = createPlaybackDiagnostics({ maxEvents: 2, now: () => 1234 })

    diagnostics.record({
      source: 'api-enhanced',
      capability: 'media-resolution',
      stage: DIAGNOSTIC_STAGE_URL_RESPONSE,
      durationMs: 12,
      ok: false,
      errorCategory: DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL,
      mediaUrl: 'https://example.test/song.mp3?token=secret',
      cookie: 'MUSIC_U=secret',
    })
    diagnostics.record({ source: 'api-enhanced', capability: 'media-resolution', stage: 'source_resolution', durationMs: 2, ok: true })
    diagnostics.record({ source: 'api-enhanced', capability: 'media-resolution', stage: 'source_resolution', durationMs: 3, ok: true })

    expect(diagnostics.recent()).toHaveLength(2)
    expect(diagnostics.recent()[0]).toMatchObject({ timestampMs: 1234, durationMs: 2, ok: true })
    expect(JSON.stringify(diagnostics.recent())).not.toContain('secret')
  })

  it('represents a source timeout as a typed failure', () => {
    const diagnostics = createPlaybackDiagnostics({ now: () => 99 })
    diagnostics.record({
      source: 'api-enhanced',
      capability: 'media-resolution',
      stage: 'source_resolution',
      durationMs: 15000,
      ok: false,
      errorCategory: DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT,
    })

    expect(diagnostics.recent()[0]).toMatchObject({
      stage: 'source_resolution',
      errorCategory: DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT,
    })
  })
})
