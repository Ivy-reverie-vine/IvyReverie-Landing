// @vitest-environment node
import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb, createUserStore, hashPassword, verifyPassword, toPublicUser } from './db.js'

const dir = mkdtempSync(join(tmpdir(), 'dreammusic-db-test-'))
const db = openDb(dir)
const users = createUserStore(db)

afterAll(() => {
  db.close()
  try {
    rmSync(dir, { recursive: true, force: true })
  } catch {
    // WorkBuddy safe-delete 环境可能拦截 rm；测试目录在系统临时区，泄漏可接受。
  }
})

describe('user store / db', () => {
  it('creates the full user table including D5 migrations', () => {
    const cols = db
      .prepare("SELECT name FROM pragma_table_info('users')")
      .all()
      .map((r) => r.name)
    for (const col of [
      'username',
      'password_hash',
      'api_key',
      'netease_cookie',
      'role',
      'status',
      'ban_reason',
      'avatar_url',
      'signature',
      'play_seconds',
      'played_song_ids',
      'dream_points',
      'last_checkin_date',
      'netease_uid',
      'api_key_last_used',
    ]) {
      expect(cols).toContain(col)
    }
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((r) => r.name)
    for (const t of ['dream_point_logs', 'announcements', 'audit_logs', 'settings']) {
      expect(tables).toContain(t)
    }
  })

  it('makes the first registered user admin, later users normal users', () => {
    const first = users.create('alpha', 'secret123')
    const second = users.create('beta', 'secret123')
    expect(users.findById(first).role).toBe('admin')
    expect(users.findById(second).role).toBe('user')
  })

  it('hashes and verifies passwords', () => {
    const salt = '00'.repeat(16)
    const { hash } = hashPassword('secret123', salt)
    expect(verifyPassword('secret123', salt, hash)).toBe(true)
    expect(verifyPassword('wrong', salt, hash)).toBe(false)
  })

  it('stores netease cookie server-side and tracks invalid state', () => {
    const id = users.findByUsername('alpha').id
    users.setNeteaseCookie(id, 'MUSIC_U=1; __csrf=2')
    expect(users.findById(id).netease_cookie).toBe('MUSIC_U=1; __csrf=2')
    expect(toPublicUser(users.findById(id)).bound).toBe(true)
    users.markNeteaseInvalid(id)
    expect(toPublicUser(users.findById(id)).bound).toBe(false)
    expect(toPublicUser(users.findById(id)).bindInvalid).toBe(true)
  })

  it('accumulates play stats and dedupes played song ids', () => {
    const id = users.findByUsername('alpha').id
    users.addPlayStats(id, 30, 101)
    users.addPlayStats(id, 35.9, 101)
    users.addPlayStats(id, 40, 102)
    const row = users.findById(id)
    expect(row.play_seconds).toBe(105)
    expect(JSON.parse(row.played_song_ids)).toEqual([101, 102])
  })

  it('never leaks cookie or password hash in toPublicUser', () => {
    const row = users.findById(users.findByUsername('alpha').id)
    const pub = toPublicUser(row)
    expect(pub).not.toHaveProperty('password_hash')
    expect(pub).not.toHaveProperty('netease_cookie')
    expect(pub).not.toHaveProperty('api_key')
  })

  it('tracks api key last usage', () => {
    const id = users.findByUsername('alpha').id
    users.touchApiKey(id)
    expect(users.findById(id).api_key_last_used).toBeGreaterThan(0)
    users.rotateApiKey(id)
    expect(users.findById(id).api_key_last_used).toBeNull()
  })

  it('stores netease uid', () => {
    const id = users.findByUsername('alpha').id
    users.setNeteaseUid(id, 123456)
    expect(users.findById(id).netease_uid).toBe('123456')
    expect(toPublicUser(users.findById(id)).neteaseUid).toBe('123456')
  })

  it('writes dream point ledger on addDreamPoints', () => {
    const id = users.findByUsername('alpha').id
    const points = users.addDreamPoints(id, 10, 'checkin', '每日签到')
    expect(points).toBeGreaterThan(0)
    const logs = users.getDreamPointLogs(id)
    expect(logs[0]).toMatchObject({
      user_id: id,
      delta: 10,
      type: 'checkin',
      note: '每日签到',
    })
    expect(logs[0].balance_after).toBe(points)
  })

  it('creates, lists and archives announcements', () => {
    const id = users.createAnnouncement({
      title: '测试公告',
      content: 'hello',
      level: 'important',
      status: 'draft',
      createdBy: 'alpha',
    })
    expect(users.listAnnouncements(true).some((a) => a.id === id)).toBe(true)
    // draft 对公开列表不可见
    expect(users.listAnnouncements(false).some((a) => a.id === id)).toBe(false)
    users.updateAnnouncement(id, { status: 'published' })
    expect(users.listAnnouncements(false).some((a) => a.id === id)).toBe(true)
    users.deleteAnnouncement(id)
    expect(users.getAnnouncementById(id).status).toBe('archived')
  })

  it('creates and redeems redemption codes exactly once', () => {
    const alpha = users.findByUsername('alpha')
    const [code] = users.createRedeemCodes({ points: 25, count: 1, note: '测试', createdBy: 'admin' })
    expect(code.startsWith('DM-')).toBe(true)
    const before = alpha.dream_points
    const result = users.redeemCode(code, alpha.id)
    expect(result.redeemedPoints).toBe(25)
    expect(result.points).toBe(before + 25)
    expect(() => users.redeemCode(code, alpha.id)).toThrow(/不存在|已被使用/)
  })

  it('writes and reads audit logs', () => {
    users.addAuditLog({ actorId: 1, actorUsername: 'alpha', action: 'test', detail: 'ok' })
    const logs = users.listAuditLogs(10)
    expect(logs[0]).toMatchObject({ actor_username: 'alpha', action: 'test', detail: 'ok' })
  })
})
