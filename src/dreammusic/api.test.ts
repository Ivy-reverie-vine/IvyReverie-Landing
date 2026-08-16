import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  buildUrl,
  search,
  qrCheck,
  register,
  login,
  me,
  getProfile,
  likedList,
  __resetCache,
  __invalidateCache,
  NcmError,
} from './api'

function mockFetch(json: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => json,
  }))
  vi.stubGlobal('fetch', fn)
  return fn
}

beforeEach(() => {
  __resetCache()
  vi.unstubAllGlobals()
})

describe('api — buildUrl（纯函数）', () => {
  it('拼 /dreammusic/api/v1 前缀 + randomCNIP + 参数，不带 cookie', () => {
    const url = buildUrl('/search', { keywords: '周杰伦', type: 1 })
    expect(url.startsWith('/dreammusic/api/v1/search?')).toBe(true)
    expect(url).toContain('randomCNIP=true')
    expect(url).toContain('keywords=')
    expect(url).not.toContain('cookie=')
  })
})

describe('api — 缓存（2 分钟同 URL 只请求一次）', () => {
  it('相同参数第二次走缓存不发起 fetch', async () => {
    const fn = mockFetch({ code: 200, result: { songs: [] } })
    await search('周杰伦')
    await search('周杰伦')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('不同参数会分别请求', async () => {
    const fn = mockFetch({ code: 200, result: { songs: [] } })
    await search('周杰伦')
    await search('林俊杰')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('api — 定向缓存失效', () => {
  it('__invalidateCache 只清指定接口前缀的缓存', async () => {
    const fn = mockFetch({ code: 200, ids: [1] })
    await likedList('42')
    await likedList('42')
    expect(fn).toHaveBeenCalledTimes(1)
    __invalidateCache('/likelist')
    await likedList('42')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('api — 错误码分流', () => {
  it('301 → 触发 dm-rebind 事件 + 抛 REBIND（不清登录）', async () => {
    const handler = vi.fn()
    window.addEventListener('dm-rebind', handler)
    mockFetch({ code: 301 })
    try {
      await search('x')
      throw new Error('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(NcmError)
      expect((e as NcmError).code).toBe('REBIND')
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('dm-rebind', handler)
    }
  })

  it('460 → 抛 GEOBLOCK', async () => {
    mockFetch({ code: 460 })
    try {
      await search('x')
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as NcmError).code).toBe('GEOBLOCK')
    }
  })

  it('503 → 抛 RATE_LIMIT', async () => {
    mockFetch({ code: 503 })
    try {
      await search('x')
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as NcmError).code).toBe('RATE_LIMIT')
    }
  })

  it('403 → 抛 AUTH 并带中间层消息', async () => {
    mockFetch({ code: 403, message: '请先绑定网易云账号' })
    try {
      await search('x')
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as NcmError).code).toBe('AUTH')
      expect((e as NcmError).message).toContain('绑定')
    }
  })

  it('HTTP 401 → 触发 dm-unauthorized + 抛 AUTH（会话失效）', async () => {
    const handler = vi.fn()
    window.addEventListener('dm-unauthorized', handler)
    mockFetch({ code: 401 }, false, 401)
    try {
      await search('x')
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as NcmError).code).toBe('AUTH')
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('dm-unauthorized', handler)
    }
  })

  it('HTTP 502 → 抛 NETWORK（上游不可达）', async () => {
    mockFetch({ code: 502 }, false, 502)
    try {
      await search('x')
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as NcmError).code).toBe('NETWORK')
    }
  })

  it('fetch 抛错 → NETWORK', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('net')
      }),
    )
    try {
      await search('x')
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as NcmError).code).toBe('NETWORK')
    }
  })

  it('非 200 非 QR 码 → API_ERROR', async () => {
    mockFetch({ code: 999 })
    try {
      await search('x')
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as NcmError).code).toBe('API_ERROR')
    }
  })

  it('QR 状态码 800/801/802/803 不当错误', async () => {
    mockFetch({ code: 801, message: 'waiting' })
    const r = await qrCheck('key')
    expect(r.code).toBe(801)
  })

  it('login/* 不缓存（qrCheck 每次重新请求）', async () => {
    const fn = mockFetch({ code: 801, message: 'waiting' })
    await qrCheck('key')
    await qrCheck('key')
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe('api — 账户接口（auth/*）', () => {
  it('login 走 /auth/login + credentials include，返回用户信息', async () => {
    const fn = mockFetch({
      code: 200,
      data: { id: 1, username: 'tester', bound: false, bindInvalid: false },
    })
    const u = await login('tester', 'secret123')
    expect(u.username).toBe('tester')
    expect(fn).toHaveBeenCalledWith(
      '/dreammusic/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    )
  })

  it('register 传邀请码', async () => {
    const fn = mockFetch({ code: 200, data: { username: 'newbie' } })
    await register('newbie', 'secret123', 'abc')
    const [, init] = fn.mock.calls[0] as unknown as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toEqual({
      username: 'newbie',
      password: 'secret123',
      inviteCode: 'abc',
    })
  })

  it('profile 401 → 触发 dm-unauthorized（非登录/注册/me 路径）', async () => {
    const handler = vi.fn()
    window.addEventListener('dm-unauthorized', handler)
    mockFetch({ code: 401, message: '未登录' }, false, 401)
    try {
      await getProfile()
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as NcmError).code).toBe('AUTH')
      expect(handler).toHaveBeenCalledTimes(1)
    } finally {
      window.removeEventListener('dm-unauthorized', handler)
    }
  })

  it('me 失败（401）抛 AUTH', async () => {
    mockFetch({ code: 401, message: '未登录' }, false, 401)
    try {
      await me()
      throw new Error('should have thrown')
    } catch (e) {
      expect((e as NcmError).code).toBe('AUTH')
    }
  })
})
