// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSessionStore, parseCookies } from './session.js'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('session store', () => {
  it('creates and retrieves a session token', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const sessions = createSessionStore(60_000)
    const token = sessions.create(7)
    expect(token).toBeTruthy()
    expect(sessions.get(token)).toMatchObject({
      userId: 7,
      expiresAt: 61_000,
    })
  })

  it('expires sessions after the TTL', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const sessions = createSessionStore(60_000)
    const token = sessions.create(7)
    now.mockReturnValue(61_001)
    expect(sessions.get(token)).toBeNull()
    // 过期读取时顺手清掉
    now.mockReturnValue(1_000)
    expect(sessions.get(token)).toBeNull()
  })

  it('destroys sessions explicitly', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const sessions = createSessionStore(60_000)
    const token = sessions.create(7)
    sessions.destroy(token)
    expect(sessions.get(token)).toBeNull()
  })
})

describe('parseCookies', () => {
  it('parses name=value pairs and ignores malformed parts', () => {
    expect(parseCookies({ headers: { cookie: 'dm_session=abc123; theme=dark' } })).toEqual({
      dm_session: 'abc123',
      theme: 'dark',
    })
    expect(parseCookies({ headers: {} })).toEqual({})
    expect(parseCookies({ headers: { cookie: 'a=1; bad; =novalue' } })).toEqual({ a: '1' })
  })
})
