import { randomBytes } from 'node:crypto'

/**
 * 内存会话表：token → { userId, expiresAt }。
 * 重启即失效（可接受：账户与绑定存 SQLite，重启只需重新登录）。
 */
export function createSessionStore(ttlMs) {
  const sessions = new Map()
  return {
    create(userId, username = '') {
      const token = randomBytes(24).toString('base64url')
      sessions.set(token, {
        userId,
        username,
        createdAt: Date.now(),
        expiresAt: Date.now() + ttlMs,
      })
      return token
    },
    get(token) {
      if (!token) return null
      const s = sessions.get(token)
      if (!s) return null
      if (Date.now() > s.expiresAt) {
        sessions.delete(token)
        return null
      }
      return s
    },
    destroy(token) {
      if (token) sessions.delete(token)
    },
    /** 当前用户的活跃会话列表（含 token，用户可据此下线指定设备） */
    listByUser(userId) {
      const now = Date.now()
      const out = []
      for (const [token, s] of sessions) {
        if (s.userId !== userId) continue
        if (now > s.expiresAt) {
          sessions.delete(token)
          continue
        }
        out.push({
          token,
          username: s.username,
          createdAt: s.createdAt,
          expiresAt: s.expiresAt,
        })
      }
      return out.sort((a, b) => b.createdAt - a.createdAt)
    },
    /** 销毁该用户全部会话（改密码后强制所有设备重登） */
    destroyAllForUser(userId) {
      for (const [token, s] of sessions) {
        if (s.userId === userId) sessions.delete(token)
      }
    },
  }
}

export function parseCookies(req) {
  const header = req.headers.cookie || ''
  const out = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i > 0) {
      const name = part.slice(0, i).trim()
      if (name) out[name] = decodeURIComponent(part.slice(i + 1).trim())
    }
  }
  return out
}
