import { describe, expect, it } from 'vitest'
import { MediaReferenceStore } from './mediaReference.js'

describe('MediaReferenceStore', () => {
  it('issues opaque, signed references without embedding the upstream URL', () => {
    const store = new MediaReferenceStore({ secret: 'test-secret', ttlMs: 1000, now: () => 1000 })
    const token = store.issue({ userId: 7, upstreamUrl: 'https://cdn.test/private?sig=secret' })

    expect(token).not.toContain('cdn.test')
    expect(store.resolve(token)).toMatchObject({ userId: '7', upstreamUrl: 'https://cdn.test/private?sig=secret' })
    expect(store.resolve(`${token}tampered`)).toBeNull()
  })

  it('rejects expired references', () => {
    let now = 1000
    const store = new MediaReferenceStore({ secret: 'test-secret', ttlMs: 1000, now: () => now })
    const token = store.issue({ userId: 7, upstreamUrl: 'https://cdn.test/song.mp3' })
    now = 2000

    expect(store.resolve(token)).toBeNull()
  })
})
