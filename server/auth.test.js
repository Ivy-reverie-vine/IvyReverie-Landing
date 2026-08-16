// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest'
import express from 'express'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, createUserStore } from './db.js'
import { createSessionStore } from './session.js'
import { createAuthRouter } from './auth.js'

const dir = mkdtempSync(join(tmpdir(), 'dreammusic-auth-test-'))
const db = openDb(dir)
const users = createUserStore(db)
const sessions = createSessionStore(60_000)
const config = {
  sessionTtlMs: 60_000,
  cookieSecure: false,
  registerCode: 'testcode',
  dataDir: dir,
  upstream: 'http://upstream.test',
}
const auth = createAuthRouter({ users, sessions, config })
const app = express()
app.use(express.json())
app.use('/dreammusic/api/v1/auth', auth.router)
let server
let base

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  base = `http://127.0.0.1:${server.address().port}/dreammusic/api/v1/auth`
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
  db.close()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    /* 临时目录泄漏可接受 */
  }
})

async function request(path, { method = 'GET', body, cookie = '', apiKey = '' } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

function sessionCookie(res) {
  const setCookie = res.headers.getSetCookie?.() || []
  return setCookie[0]?.split(';')[0] || ''
}

describe('auth router integration', () => {
  it('register → login → me works with session cookie', async () => {
    let r = await request('/register', {
      method: 'POST',
      body: { username: 'admin1', password: 'secret123', inviteCode: 'testcode' },
    })
    expect(r.res.status).toBe(200)
    expect(r.data.data.username).toBe('admin1')

    r = await request('/login', {
      method: 'POST',
      body: { username: 'admin1', password: 'secret123' },
    })
    expect(r.res.status).toBe(200)
    const cookie = sessionCookie(r.res)
    expect(cookie.startsWith('dm_session=')).toBe(true)

    r = await request('/me', { cookie })
    expect(r.data.data).toMatchObject({ username: 'admin1', role: 'admin', bound: false })
  })

  it('X-API-Key can also call auth endpoints', async () => {
    let r = await request('/login', {
      method: 'POST',
      body: { username: 'admin1', password: 'secret123' },
    })
    const cookie = sessionCookie(r.res)
    r = await request('/api-key', { cookie })
    const apiKey = r.data.data.apiKey
    r = await request('/me', { apiKey })
    expect(r.res.status).toBe(200)
    expect(r.data.data.username).toBe('admin1')
  })

  it('admin can create and publish announcements; public list only shows published', async () => {
    let r = await request('/login', {
      method: 'POST',
      body: { username: 'admin1', password: 'secret123' },
    })
    const cookie = sessionCookie(r.res)

    r = await request('/announcements', { cookie, method: 'POST', body: { title: '维护通知', content: '今晚升级', level: 'maintenance' } })
    expect(r.res.status).toBe(200)
    expect(r.data.data.status).toBe('draft')
    const id = r.data.data.id

    r = await request('/announcements')
    expect(r.data.data).toEqual([])
    await request(`/announcements/${id}`, { cookie, method: 'POST', body: { status: 'published' } })
    r = await request('/announcements')
    expect(r.data.data[0]).toMatchObject({ id, title: '维护通知', level: 'maintenance' })
  })

  it('admin adjusts points and user can see point logs', async () => {
    let r = await request('/register', {
      method: 'POST',
      body: { username: 'user2', password: 'secret123', inviteCode: 'testcode' },
    })
    expect(r.res.status).toBe(200)

    r = await request('/login', {
      method: 'POST',
      body: { username: 'admin1', password: 'secret123' },
    })
    const adminCookie = sessionCookie(r.res)

    r = await request('/users', { cookie: adminCookie })
    const user2 = r.data.data.find((u) => u.username === 'user2')

    r = await request(`/users/${user2.id}/points`, {
      method: 'POST',
      cookie: adminCookie,
      body: { delta: 50, note: '测试奖励' },
    })
    expect(r.data.data.points).toBe(50)

    r = await request('/login', {
      method: 'POST',
      body: { username: 'user2', password: 'secret123' },
    })
    const userCookie = sessionCookie(r.res)
    r = await request('/points/log', { cookie: userCookie })
    expect(r.data.data[0]).toMatchObject({ delta: 50, type: 'admin_adjust', note: '测试奖励' })
  })

  it('admin generates redeem codes and users can redeem once', async () => {
    let r = await request('/login', {
      method: 'POST',
      body: { username: 'admin1', password: 'secret123' },
    })
    const adminCookie = sessionCookie(r.res)

    r = await request('/redeem-codes/generate', {
      method: 'POST',
      cookie: adminCookie,
      body: { points: 30, count: 2, note: '活动奖励' },
    })
    expect(r.res.status).toBe(200)
    expect(r.data.data.codes).toHaveLength(2)
    const code = r.data.data.codes[0]

    r = await request('/login', {
      method: 'POST',
      body: { username: 'user2', password: 'secret123' },
    })
    const userCookie = sessionCookie(r.res)

    r = await request('/redeem', { method: 'POST', cookie: userCookie, body: { code } })
    expect(r.res.status).toBe(200)
    expect(r.data.data.redeemedPoints).toBe(30)

    r = await request('/redeem', { method: 'POST', cookie: userCookie, body: { code } })
    expect(r.res.status).toBe(404)

    r = await request('/redeem-codes', { cookie: adminCookie })
    expect(r.data.data.find((c) => c.code === code)).toMatchObject({ code, usedBy: 2 })
  })

  it('admin can adjust own points and download deducts 1 point', async () => {
    let r = await request('/login', {
      method: 'POST',
      body: { username: 'admin1', password: 'secret123' },
    })
    const cookie = sessionCookie(r.res)
    users.setNeteaseCookie(users.findByUsername('admin1').id, 'MUSIC_U=1')

    // 管理员可以给自己加梦点
    r = await request('/users/1/points', {
      method: 'POST',
      cookie,
      body: { delta: 10, note: '给自己测试' },
    })
    expect(r.res.status).toBe(200)
    expect(r.data.data.points).toBe(10)

    const realFetch = globalThis.fetch
    let upstreamCalls = 0
    vi.stubGlobal('fetch', async (url, init) => {
      const target = String(url)
      if (target.startsWith('http://upstream.test')) {
        upstreamCalls++
        return new Response(
          JSON.stringify({ code: 200, data: [{ url: 'https://example.com/song.mp3' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return realFetch(url, init)
    })

    r = await request('/points/download', {
      method: 'POST',
      cookie,
      body: { songId: 123, level: 'exhigh' },
    })
    expect(r.res.status).toBe(200)
    expect(r.data.data).toMatchObject({ url: 'https://example.com/song.mp3', points: 9, cost: 1 })
    expect(upstreamCalls).toBe(1)

    const logs = users.getDreamPointLogs(users.findByUsername('admin1').id)
    expect(logs[0]).toMatchObject({ type: 'song_download', delta: -1 })

    // 余额扣到 0 后再下载 → 402
    await request('/users/1/points', { method: 'POST', cookie, body: { delta: -9, note: '清零' } })
    r = await request('/points/download', {
      method: 'POST',
      cookie,
      body: { songId: 124, level: 'exhigh' },
    })
    expect(r.res.status).toBe(402)
  })

  it('download falls back to unblock sources when direct link is empty', async () => {
    let r = await request('/login', {
      method: 'POST',
      body: { username: 'admin1', password: 'secret123' },
    })
    const cookie = sessionCookie(r.res)
    users.setNeteaseCookie(users.findByUsername('admin1').id, 'MUSIC_U=1')
    await request('/users/1/points', { method: 'POST', cookie, body: { delta: 10, note: 'fallback test' } })

    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', async (url, init) => {
      const target = String(url)
      if (target.startsWith('http://upstream.test/song/url/match')) {
        return new Response(
          JSON.stringify({ code: 200, data: [{ url: 'https://example.com/qq-fallback.mp3' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (target.startsWith('http://upstream.test/song/')) {
        return new Response(
          JSON.stringify({ code: 200, data: [{ url: '' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return realFetch(url, init)
    })

    r = await request('/points/download', {
      method: 'POST',
      cookie,
      body: { songId: 456, level: 'exhigh' },
    })
    expect(r.res.status).toBe(200)
    expect(r.data.data).toMatchObject({
      url: 'https://example.com/qq-fallback.mp3',
      points: 9,
      cost: 1,
      source: 'match:qq',
    })
  })

  it('uploads a local avatar and serves it back to the owner', async () => {
    let r = await request('/login', {
      method: 'POST',
      body: { username: 'user2', password: 'secret123' },
    })
    const cookie = sessionCookie(r.res)
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
    r = await request('/avatar', {
      method: 'POST',
      cookie,
      body: { avatarBase64: `data:image/png;base64,${png}` },
    })
    expect(r.res.status).toBe(200)
    expect(r.data.data.avatarUrl).toContain('/auth/avatar-file/u')

    r = await request(r.data.data.avatarUrl.replace('/dreammusic/api/v1/auth', ''), { cookie })
    expect(r.res.status).toBe(200)
    expect(r.res.headers.get('content-type')).toBe('image/png')
  })

  it('admin can edit invite code and registration uses the new code', async () => {
    let r = await request('/login', {
      method: 'POST',
      body: { username: 'admin1', password: 'secret123' },
    })
    const cookie = sessionCookie(r.res)

    r = await request('/invite-code', { cookie })
    expect(r.data.data.code).toBe('testcode')

    r = await request('/invite-code', { method: 'POST', cookie, body: { code: 'newcode' } })
    expect(r.res.status).toBe(200)

    r = await request('/register', {
      method: 'POST',
      body: { username: 'oldcodeuser', password: 'secret123', inviteCode: 'testcode' },
    })
    expect(r.res.status).toBe(403)

    r = await request('/register', {
      method: 'POST',
      body: { username: 'newcodeuser', password: 'secret123', inviteCode: 'newcode' },
    })
    expect(r.res.status).toBe(200)

    // 恢复默认邀请码，避免影响其它用例
    await request('/invite-code', { method: 'POST', cookie, body: { code: 'testcode' } })
  })

  it('changing password invalidates all existing sessions', async () => {
    let r = await request('/login', {
      method: 'POST',
      body: { username: 'user2', password: 'secret123' },
    })
    const cookie = sessionCookie(r.res)

    r = await request('/password', {
      method: 'POST',
      cookie,
      body: { oldPassword: 'secret123', newPassword: 'newpass123' },
    })
    expect(r.res.status).toBe(200)

    r = await request('/me', { cookie })
    expect(r.res.status).toBe(401)

    r = await request('/login', {
      method: 'POST',
      body: { username: 'user2', password: 'newpass123' },
    })
    expect(r.res.status).toBe(200)
  })
})
