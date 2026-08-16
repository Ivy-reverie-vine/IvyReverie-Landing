import { DatabaseSync } from 'node:sqlite'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * SQLite 存储（Node 内置 node:sqlite，免原生编译）。
 * users: 账户 + 绑定信息 + API key + 用户中心统计。
 * dream_point_logs / announcements / audit_logs: 平台扩展表。
 */

export function openDb(dataDir) {
  mkdirSync(dataDir, { recursive: true })
  const db = new DatabaseSync(join(dataDir, 'dreammusic.db'))
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT NOT NULL UNIQUE,
      password_hash   TEXT NOT NULL,
      api_key         TEXT NOT NULL UNIQUE,
      netease_cookie  TEXT,
      netease_invalid INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL
    );
  `)
  // 轻量迁移：老库补新列
  const existing = new Set(
    db.prepare("SELECT name FROM pragma_table_info('users')").all().map((r) => r.name),
  )
  const migrations = {
    role: "TEXT NOT NULL DEFAULT 'user'",
    status: "TEXT NOT NULL DEFAULT 'active'",
    ban_reason: 'TEXT',
    avatar_url: 'TEXT',
    signature: 'TEXT',
    play_seconds: 'INTEGER NOT NULL DEFAULT 0',
    played_song_ids: 'TEXT',
    dream_points: 'INTEGER NOT NULL DEFAULT 0',
    last_checkin_date: 'TEXT',
    netease_uid: 'TEXT',
    api_key_last_used: 'INTEGER',
  }
  for (const [col, def] of Object.entries(migrations)) {
    if (!existing.has(col)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} ${def}`)
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS dream_point_logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id        INTEGER NOT NULL,
      delta          INTEGER NOT NULL,
      balance_after  INTEGER NOT NULL,
      type           TEXT NOT NULL,
      note           TEXT,
      ref_id         TEXT,
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_point_logs_user ON dream_point_logs(user_id, id);

    CREATE TABLE IF NOT EXISTS announcements (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      title        TEXT NOT NULL,
      content      TEXT NOT NULL DEFAULT '',
      level        TEXT NOT NULL DEFAULT 'info',
      status       TEXT NOT NULL DEFAULT 'draft',
      created_by   TEXT NOT NULL,
      created_at   INTEGER NOT NULL,
      published_at INTEGER,
      expires_at   INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_announcements_status ON announcements(status, id);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id       INTEGER,
      actor_username TEXT NOT NULL,
      action         TEXT NOT NULL,
      target_user_id INTEGER,
      detail         TEXT,
      ip             TEXT,
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(id);

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS download_tasks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      song_id      INTEGER NOT NULL,
      song_name    TEXT NOT NULL,
      artist       TEXT NOT NULL DEFAULT '',
      level        TEXT NOT NULL DEFAULT 'exhigh',
      status       TEXT NOT NULL DEFAULT 'downloading',
      received     INTEGER NOT NULL DEFAULT 0,
      total        INTEGER NOT NULL DEFAULT 0,
      source       TEXT,
      file_path    TEXT,
      file_name    TEXT,
      content_type TEXT,
      error        TEXT,
      created_at   INTEGER NOT NULL,
      completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_download_tasks_user ON download_tasks(user_id, id);

    CREATE TABLE IF NOT EXISTS redeem_codes (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      code       TEXT NOT NULL UNIQUE,
      points     INTEGER NOT NULL,
      note       TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER,
      used_by    INTEGER,
      used_at    INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_redeem_codes_code ON redeem_codes(code);
  `)

  // 兼容老库：没有任何管理员时，把最早注册的用户提升为管理员
  const adminCount = db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'")
    .get().n
  if (adminCount === 0) {
    const first = db
      .prepare('SELECT id FROM users ORDER BY created_at ASC, id ASC LIMIT 1')
      .get()
    if (first) {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(first.id)
    }
  }
  return db
}

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { salt, hash }
}

export function verifyPassword(password, salt, expectedHash) {
  const { hash } = hashPassword(password, salt)
  const a = Buffer.from(hash, 'hex')
  const b = Buffer.from(expectedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** 创建用户存储（方法闭包持有 db） */
export function createUserStore(db) {
  function userRowById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) || null
  }

  return {
    create(username, password) {
      const { salt, hash } = hashPassword(password)
      const apiKey = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
      const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n
      // 第一个注册用户自动成为管理员
      const role = count === 0 ? 'admin' : 'user'
      const info = db
        .prepare(
          `INSERT INTO users (username, password_hash, api_key, role, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(username, `${salt}:${hash}`, apiKey, role, Date.now())
      return Number(info.lastInsertRowid)
    },

    findByUsername(username) {
      return db.prepare('SELECT * FROM users WHERE username = ?').get(username) || null
    },

    findById(id) {
      return userRowById(id)
    },

    findByApiKey(apiKey) {
      return db.prepare('SELECT * FROM users WHERE api_key = ?').get(apiKey) || null
    },

    listAll() {
      return db.prepare('SELECT * FROM users ORDER BY created_at ASC').all()
    },

    setPassword(id, password) {
      const { salt, hash } = hashPassword(password)
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(`${salt}:${hash}`, id)
    },

    setNeteaseCookie(id, cookie) {
      db.prepare(
        'UPDATE users SET netease_cookie = ?, netease_invalid = 0 WHERE id = ?',
      ).run(cookie, id)
    },

    setNeteaseUid(id, uid) {
      if (uid !== undefined && uid !== null) {
        db.prepare('UPDATE users SET netease_uid = ? WHERE id = ?').run(String(uid), id)
      }
    },

    markNeteaseInvalid(id) {
      db.prepare('UPDATE users SET netease_invalid = 1 WHERE id = ?').run(id)
    },

    rotateApiKey(id) {
      const apiKey = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '')
      db.prepare('UPDATE users SET api_key = ?, api_key_last_used = NULL WHERE id = ?').run(apiKey, id)
      return apiKey
    },

    touchApiKey(id) {
      const row = db.prepare('SELECT api_key_last_used FROM users WHERE id = ?').get(id)
      const last = row?.api_key_last_used || 0
      if (Date.now() - last > 60_000) {
        db.prepare('UPDATE users SET api_key_last_used = ? WHERE id = ?').run(Date.now(), id)
      }
    },

    setRole(id, role) {
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id)
    },

    setStatus(id, status, reason = null) {
      db.prepare(
        'UPDATE users SET status = ?, ban_reason = ? WHERE id = ?',
      ).run(status, reason, id)
    },

    setAvatarUrl(id, url) {
      db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, id)
    },

    setSignature(id, signature) {
      db.prepare('UPDATE users SET signature = ? WHERE id = ?').run(signature, id)
    },

    addPlayStats(id, seconds, songId) {
      const row = db.prepare('SELECT play_seconds, played_song_ids FROM users WHERE id = ?').get(id)
      const played = new Set(JSON.parse(row?.played_song_ids || '[]'))
      if (songId && Number.isFinite(Number(songId))) {
        played.add(Number(songId))
        // 防爆表：上限 2 万首
        if (played.size > 20000) {
          const arr = [...played]
          arr.splice(0, played.size - 20000)
          played.clear()
          for (const s of arr) played.add(s)
        }
      }
      db.prepare(
        'UPDATE users SET play_seconds = play_seconds + ?, played_song_ids = ? WHERE id = ?',
      ).run(Math.max(0, Math.floor(seconds)), JSON.stringify([...played]), id)
    },

    /**
     * 记账式梦点变更：更新余额 + 写流水。type: checkin/admin_adjust/manual/...
     * 返回新余额。
     */
    addDreamPoints(id, n, type = 'manual', note = '', refId = null) {
      const delta = Math.trunc(Number(n) || 0)
      if (!delta) return userRowById(id)?.dream_points || 0
      const row = userRowById(id)
      if (!row) return 0
      const balanceAfter = (row.dream_points || 0) + delta
      db.exec('BEGIN')
      try {
        db.prepare('UPDATE users SET dream_points = ? WHERE id = ?').run(balanceAfter, id)
        db.prepare(
          `INSERT INTO dream_point_logs
             (user_id, delta, balance_after, type, note, ref_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(id, delta, balanceAfter, type, note || '', refId ? String(refId) : null, Date.now())
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
      return balanceAfter
    },

    getDreamPointLogs(id, limit = 50) {
      return db
        .prepare('SELECT * FROM dream_point_logs WHERE user_id = ? ORDER BY id DESC LIMIT ?')
        .all(id, Math.max(1, Math.min(limit, 200)))
    },

    /* ---------- 平台公告 ---------- */

    createAnnouncement({ title, content, level, status = 'draft', createdBy, expiresAt = null }) {
      const now = Date.now()
      const info = db
        .prepare(
          `INSERT INTO announcements
             (title, content, level, status, created_by, created_at, published_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          title,
          content,
          level,
          status,
          createdBy,
          now,
          status === 'published' ? now : null,
          expiresAt || null,
        )
      return Number(info.lastInsertRowid)
    },

    getAnnouncementById(id) {
      return db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) || null
    },

    listAnnouncements(includeAll = false) {
      if (includeAll) {
        return db.prepare('SELECT * FROM announcements ORDER BY id DESC LIMIT 200').all()
      }
      return db
        .prepare(
          `SELECT * FROM announcements
           WHERE status = 'published' AND (expires_at IS NULL OR expires_at > ?)
           ORDER BY id DESC LIMIT 50`,
        )
        .all(Date.now())
    },

    updateAnnouncement(id, { title, content, level, status, expiresAt }) {
      const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id)
      if (!row) return false
      const nextStatus = status ?? row.status
      const publishedAt =
        nextStatus === 'published' && row.published_at == null ? Date.now() : row.published_at
      db.prepare(
        `UPDATE announcements
         SET title = COALESCE(?, title),
             content = COALESCE(?, content),
             level = COALESCE(?, level),
             status = ?,
             published_at = ?,
             expires_at = COALESCE(?, expires_at)
         WHERE id = ?`,
      ).run(
        title ?? null,
        content ?? null,
        level ?? null,
        nextStatus,
        publishedAt,
        expiresAt ?? null,
        id,
      )
      return true
    },

    deleteAnnouncement(id) {
      db.prepare("UPDATE announcements SET status = 'archived' WHERE id = ?").run(id)
    },

    /* ---------- 下载管理 ---------- */

    createDownloadTask({ userId, songId, songName, artist, level, source, url }) {
      const info = db
        .prepare(
          `INSERT INTO download_tasks
             (user_id, song_id, song_name, artist, level, status, source, file_name, created_at)
           VALUES (?, ?, ?, ?, ?, 'downloading', ?, ?, ?)`,
        )
        .run(
          userId,
          songId,
          songName || `歌曲 ${songId}`,
          artist || '',
          level,
          source || '',
          `${songId}-${Date.now()}`,
          Date.now(),
        )
      const id = Number(info.lastInsertRowid)
      return { id, url }
    },

    getDownloadTask(id) {
      return db.prepare('SELECT * FROM download_tasks WHERE id = ?').get(id) || null
    },

    listDownloadTasks(userId) {
      return db
        .prepare('SELECT * FROM download_tasks WHERE user_id = ? ORDER BY id DESC LIMIT 100')
        .all(userId)
    },

    updateDownloadProgress(id, received, total) {
      db.prepare('UPDATE download_tasks SET received = ?, total = ? WHERE id = ?').run(
        Math.max(0, Math.trunc(received)),
        Math.max(0, Math.trunc(total)),
        id,
      )
    },

    completeDownloadTask(id, { filePath, fileName, contentType, size }) {
      db.prepare(
        `UPDATE download_tasks
         SET status = 'ready', received = ?, total = ?, file_path = ?, file_name = ?,
             content_type = ?, completed_at = ?
         WHERE id = ?`,
      ).run(size, size, filePath, fileName, contentType || 'application/octet-stream', Date.now(), id)
    },

    failDownloadTask(id, error) {
      db.prepare(
        `UPDATE download_tasks SET status = 'failed', error = ?, completed_at = ? WHERE id = ?`,
      ).run(String(error || '下载失败'), Date.now(), id)
    },

    deleteDownloadTask(id) {
      db.prepare('DELETE FROM download_tasks WHERE id = ?').run(id)
    },

    /* ---------- 兑换码 ---------- */

    createRedeemCodes({ points, count = 1, note = '', createdBy, expiresAt = null }) {
      const n = Math.max(1, Math.min(Math.trunc(count) || 1, 100))
      const value = Math.trunc(points) || 0
      const created = []
      const stmt = db.prepare(
        `INSERT INTO redeem_codes
           (code, points, note, created_by, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      for (let i = 0; i < n; i++) {
        const code = `DM-${randomBytes(5).toString('hex').toUpperCase()}`
        stmt.run(code, value, note || '', createdBy, Date.now(), expiresAt || null)
        created.push(code)
      }
      return created
    },

    listRedeemCodes(limit = 100) {
      return db
        .prepare('SELECT * FROM redeem_codes ORDER BY id DESC LIMIT ?')
        .all(Math.max(1, Math.min(limit, 500)))
    },

    /**
     * 兑换：同一事务内校验/占用兑换码 + 写梦点流水。
     * 返回 { points, redeemedPoints, code }；失败抛错。
     */
    redeemCode(code, userId) {
      const row = db
        .prepare("SELECT * FROM redeem_codes WHERE code = ? AND used_by IS NULL")
        .get(String(code || '').trim().toUpperCase())
      if (!row) {
        const err = new Error('兑换码不存在或已被使用')
        err.code = 'INVALID_CODE'
        throw err
      }
      if (row.expires_at && Date.now() > row.expires_at) {
        const err = new Error('兑换码已过期')
        err.code = 'CODE_EXPIRED'
        throw err
      }
      const user = db.prepare('SELECT dream_points FROM users WHERE id = ?').get(userId)
      if (!user) {
        const err = new Error('用户不存在')
        err.code = 'USER_NOT_FOUND'
        throw err
      }
      const balanceAfter = (user.dream_points || 0) + row.points
      db.exec('BEGIN')
      try {
        db.prepare('UPDATE redeem_codes SET used_by = ?, used_at = ? WHERE id = ?').run(
          userId,
          Date.now(),
          row.id,
        )
        db.prepare('UPDATE users SET dream_points = ? WHERE id = ?').run(balanceAfter, userId)
        db.prepare(
          `INSERT INTO dream_point_logs
             (user_id, delta, balance_after, type, note, ref_id, created_at)
           VALUES (?, ?, ?, 'redeem_code', ?, ?, ?)`,
        ).run(userId, row.points, balanceAfter, `兑换码 ${row.code}`, row.code, Date.now())
        db.exec('COMMIT')
      } catch (err) {
        db.exec('ROLLBACK')
        throw err
      }
      return { points: balanceAfter, redeemedPoints: row.points, code: row.code }
    },

    /* ---------- 运行时设置（如注册邀请码） ---------- */

    getSetting(key) {
      return db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null
    },

    setSetting(key, value) {
      db.prepare(
        `INSERT INTO settings (key, value, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      ).run(key, String(value ?? ''), Date.now())
    },

    /* ---------- 审计日志 ---------- */

    addAuditLog({ actorId = null, actorUsername, action, targetUserId = null, detail = '', ip = '' }) {
      db.prepare(
        `INSERT INTO audit_logs
           (actor_id, actor_username, action, target_user_id, detail, ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(actorId, actorUsername, action, targetUserId, detail || '', ip || '', Date.now())
    },

    listAuditLogs(limit = 100) {
      return db
        .prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?')
        .all(Math.max(1, Math.min(limit, 500)))
    },
  }
}

/** 数据库行 → 安全对象（绝不外泄 cookie/hash/api_key） */
export function toPublicUser(row) {
  return {
    id: row.id,
    username: row.username,
    role: row.role || 'user',
    status: row.status || 'active',
    banReason: row.ban_reason || null,
    bound: Boolean(row.netease_cookie) && row.netease_invalid === 0,
    bindInvalid: row.netease_invalid === 1,
    avatarUrl: row.avatar_url || null,
    signature: row.signature || '',
    playSeconds: row.play_seconds || 0,
    playedSongCount: (JSON.parse(row.played_song_ids || '[]') || []).length,
    dreamPoints: row.dream_points || 0,
    lastCheckinDate: row.last_checkin_date || null,
    neteaseUid: row.netease_uid || null,
    createdAt: row.created_at,
  }
}
