// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi, afterEach } from 'vitest'
import express from 'express'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, createUserStore } from './db.js'
import { createSessionStore } from './session.js'
import { createAuthRouter } from './auth.js'
import { createDownloadManager } from './downloadManager.js'

const dir = mkdtempSync(join(tmpdir(), 'dreammusic-dl-test-'))
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
const manager = createDownloadManager({
  users,
  config,
  requireUser: auth.requireUser,
  audit: () => {},
})
const app = express()
app.use(express.json())
app.use('/dreammusic/api/v1/auth', auth.router)
app.use('/dreammusic/api/v1/auth/downloads', manager.router)
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
    /* ignore */
  }
})

async function request(path, { method = 'GET', body, cookie = '' } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

function sessionCookie(res) {
  return res.headers.getSetCookie?.()[0]?.split(';')[0] || ''
}

describe('download manager', () => {
  it('creates a background task, fetches the file and serves it to the owner', async () => {
    await request('/register', {
      method: 'POST',
      body: { username: 'dluser', password: 'secret123', inviteCode: 'testcode' },
    })
    let r = await request('/login', {
      method: 'POST',
      body: { username: 'dluser', password: 'secret123' },
    })
    const cookie = sessionCookie(r.res)
    const user = users.findByUsername('dluser')
    users.setNeteaseCookie(user.id, 'MUSIC_U=1')
    users.addDreamPoints(user.id, 5, 'manual', 'test')

    const realFetch = globalThis.fetch
    vi.stubGlobal('fetch', async (url, init) => {
      const target = String(url)
      if (target.startsWith('http://upstream.test/song/')) {
        return new Response(JSON.stringify({ code: 200, data: [{ url: 'https://file.test/song.mp3' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (target.startsWith('https://file.test/')) {
        return new Response('fake-mp3-data', {
          status: 200,
          headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '13' },
        })
      }
      return realFetch(url, init)
    })

    r = await request('/downloads', {
      method: 'POST',
      cookie,
      body: { songId: 99, level: 'standard', songName: '测试歌曲', artist: '测试歌手' },
    })
    expect(r.res.status).toBe(200)
    expect(r.data.data.task.status).toBe('downloading')
    expect(r.data.data.message).toContain('下载已经开始')

    // 轮询直到 ready
    let task
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100))
      r = await request('/downloads', { cookie })
      task = r.data.data.find((t) => t.id === r.data.data[0].id)
      if (task?.status === 'ready') break
    }
    expect(task.status).toBe('ready')
    expect(task.progress).toBe(100)

    // 获取文件
    const fileRes = await fetch(`${base}/downloads/${task.id}/file`, { headers: { Cookie: cookie } })
    expect(fileRes.status).toBe(200)
    expect(await fileRes.text()).toBe('fake-mp3-data')
    expect(fileRes.headers.get('content-disposition')).toContain("filename*=UTF-8''")

    // 已扣 1 梦点
    expect(users.findById(user.id).dream_points).toBe(4)
  })
})
