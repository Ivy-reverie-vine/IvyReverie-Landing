// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { createRateLimiter } from './rateLimit.js'

function fakeReq(ip) {
  return { ip, socket: { remoteAddress: ip } }
}

describe('rate limiter', () => {
  it('allows up to max requests then returns 429 with Retry-After', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const limiter = createRateLimiter({ windowMs: 60_000, max: 2 })
    const req = fakeReq('1.2.3.4')
    let blocked = 0
    for (let i = 0; i < 4; i++) {
      const res = {
        statusCode: 0,
        setHeader: vi.fn(),
        status(code) {
          this.statusCode = code
          return this
        },
        json(payload) {
          this.payload = payload
          return this
        },
      }
      limiter(req, res, () => {})
      if (res.statusCode === 429) blocked++
    }
    expect(blocked).toBe(2)
    vi.useRealTimers()
  })

  it('separates buckets by key', () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const limiter = createRateLimiter({ windowMs: 60_000, max: 1, keyFn: (r) => r.ip })
    const a = fakeReq('1.1.1.1')
    const b = fakeReq('2.2.2.2')
    const next = vi.fn()
    const res = { setHeader: vi.fn(), status() { return this }, json() { return this } }
    limiter(a, res, next)
    limiter(b, res, next)
    expect(next).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
