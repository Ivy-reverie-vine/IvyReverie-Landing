import { describe, expect, it } from 'vitest'
import { loadConfig } from './config.js'

describe('music source configuration', () => {
  it('keeps Meting disabled by default', () => {
    const config = loadConfig({})

    expect(config.musicSources.meting.enabled).toBe(false)
    expect(config.musicSources.meting.platforms).toEqual(['tencent', 'kugou'])
    expect(config.musicSources.audius.enabled).toBe(false)
    expect(config.mediaProxy.enabled).toBe(false)
  })

  it('only enables Meting with an explicit server-side flag and URL', () => {
    const config = loadConfig({
      METING_SOURCE_ENABLED: 'true',
      METING_API_URL: 'http://meting-sidecar.test/api',
      METING_TOKEN: 'server-only-token',
      METING_PLATFORMS: 'tencent,kuwo',
    })

    expect(config.musicSources.meting).toMatchObject({
      enabled: true,
      baseUrl: 'http://meting-sidecar.test/api',
      token: 'server-only-token',
      platforms: ['tencent', 'kuwo'],
    })
  })
})
