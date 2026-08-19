import { Router } from 'express'
import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join, extname, basename, resolve } from 'node:path'
import { verifyPassword, toPublicUser } from './db.js'
import { resolveDownloadUrl } from './downloadSource.js'
import { parseCookies } from './session.js'

const SESSION_COOKIE = 'dm_session'
const AVATAR_MAX_BYTES = 2 * 1024 * 1024 // 2MB
const AVATAR_TYPES = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}
const LOGIN_MAX_ATTEMPTS = 5
const LOGIN_LOCK_MS = 15 * 60 * 1000
const MESSAGE_DAILY_LIMIT = 3
const MESSAGE_COST = 1
const MESSAGE_TITLE_MAX = 40
const MESSAGE_CONTENT_MAX = 200

/**
 * /dreammusic/api/v1/auth/* —— 中间层自有账户体系（不转发给 api-enhanced）。
 */
export function createAuthRouter({ users, sessions, config }) {
  const router = Router()

  // 登录防爆破：key = `${ip}:${username}` → { count, lockedUntil }
  const loginFailures = new Map()

  /** 东八区自然日（YYYY-MM-DD） */
  function shanghaiDate(d = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  }

  function setSessionCookie(res, token) {
    const attrs = [
      `${SESSION_COOKIE}=${token}`,
      'HttpOnly',
      'SameSite=Lax',
      'Path=/',
      `Max-Age=${Math.floor(config.sessionTtlMs / 1000)}`,
    ]
    if (config.cookieSecure) attrs.push('Secure')
    res.setHeader('Set-Cookie', attrs.join('; '))
  }

  function clearSessionCookie(res) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
  }

  function json(res, data) {
    res.json({ code: 200, data })
  }

  function fail(res, httpStatus, message) {
    res.status(httpStatus).json({ code: httpStatus, message })
  }

  function clientIp(req) {
    return String(req.ip || req.socket?.remoteAddress || 'unknown')
  }

  function audit(req, action, targetUserId = null, detail = '') {
    try {
      users.addAuditLog({
        actorId: req.user?.id ?? null,
        actorUsername: req.user?.username || 'anonymous',
        action,
        targetUserId,
        detail,
        ip: clientIp(req),
      })
    } catch {
      /* 审计失败不阻塞主流程 */
    }
  }

  /** 公开用户对象 + 今日发消息次数 */
  function publicUser(user) {
    return { ...toPublicUser(user), messageToday: users.countMessagesByDate(user.id, shanghaiDate()) }
  }

  /**
   * 当前用户解析：会话 Cookie 优先，其次 X-API-Key。
   * 这样外部 agent 拿到 API Key 后也能调用 /auth/me、/auth/profile 等自有接口。
   */
  function currentUser(req) {
    const cookies = parseCookies(req)
    const session = sessions.get(cookies[SESSION_COOKIE])
    if (session) {
      const user = users.findById(session.userId)
      if (user) return user
    }
    const key = req.get('x-api-key')
    if (key) {
      const user = users.findByApiKey(key)
      if (user) users.touchApiKey(user.id)
      return user
    }
    return null
  }

  /** 会话守卫：Cookie 或 X-API-Key 均可 */
  function requireUser(req, res, next) {
    const user = currentUser(req)
    if (!user) return fail(res, 401, '未登录或 API Key 无效')
    if (user.status === 'banned') {
      const cookies = parseCookies(req)
      sessions.destroy(cookies[SESSION_COOKIE])
      clearSessionCookie(res)
      return fail(res, 403, `账号已被封禁${user.ban_reason ? `：${user.ban_reason}` : ''}`)
    }
    req.user = user
    next()
  }

  /** admin 守卫 */
  function requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') return fail(res, 403, '需要管理员权限')
    next()
  }

  function publicAnnouncement(row) {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      level: row.level,
      status: row.status,
      createdBy: row.created_by,
      createdAt: row.created_at,
      publishedAt: row.published_at,
      expiresAt: row.expires_at,
    }
  }

  /* ---------- 头像文件（本地上传） ---------- */

  function avatarDir() {
    const dir = resolve(config.dataDir, 'avatars')
    mkdirSync(dir, { recursive: true })
    return dir
  }

  function localAvatarPath(user, filename) {
    return `/dreammusic/api/v1/auth/avatar-file/${filename}`
  }

  function removeLocalAvatar(avatarUrl) {
    if (!avatarUrl || !avatarUrl.includes('/auth/avatar-file/')) return
    const filename = basename(avatarUrl)
    try {
      unlinkSync(join(avatarDir(), filename))
    } catch {
      /* 旧文件不存在则忽略 */
    }
  }

  function decodeAvatar(input) {
    const raw = String(input || '')
    const dataUrl = raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/)
    if (dataUrl) {
      return { mime: dataUrl[1], buffer: Buffer.from(dataUrl[2], 'base64') }
    }
    return { mime: 'image/png', buffer: Buffer.from(raw, 'base64') }
  }

  // 注册：用户名 + 密码 + 邀请码
  router.post('/register', (req, res) => {
    const { username, password, inviteCode } = req.body || {}
    const name = String(username || '').trim()
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(name)) {
      return fail(res, 400, '用户名需为 3-32 位字母/数字/下划线/短横线')
    }
    if (typeof password !== 'string' || password.length < 6) {
      return fail(res, 400, '密码至少 6 位')
    }
    const activeInviteCode = users.getSetting('register_code') || config.registerCode
    if (String(inviteCode || '') !== activeInviteCode) {
      return fail(res, 403, '邀请码不正确')
    }
    if (users.findByUsername(name)) {
      return fail(res, 409, '用户名已存在')
    }
    users.create(name, password)
    audit({ user: null, ip: clientIp(req) }, 'register', null, `username=${name}`)
    json(res, { username: name })
  })

  // 登录：建立会话（连续失败锁定 15 分钟）
  router.post('/login', (req, res) => {
    const { username, password } = req.body || {}
    const name = String(username || '').trim()
    const ip = clientIp(req)
    const lockKey = `${ip}:${name.toLowerCase()}`
    const failure = loginFailures.get(lockKey)
    const now = Date.now()
    if (failure && failure.lockedUntil > now) {
      const mins = Math.ceil((failure.lockedUntil - now) / 60000)
      return fail(res, 429, `尝试次数过多，请 ${mins} 分钟后再试`)
    }

    const user = users.findByUsername(name)
    const invalid = !user || verifyPassword(String(password || ''), ...String(user.password_hash).split(':')) === false
    if (invalid) {
      const next = { count: (failure?.count || 0) + 1, lockedUntil: failure?.lockedUntil || 0 }
      if (next.count >= LOGIN_MAX_ATTEMPTS) {
        next.lockedUntil = now + LOGIN_LOCK_MS
        next.count = 0
      }
      loginFailures.set(lockKey, next)
      return fail(res, 401, '用户名或密码错误')
    }

    if (user.status === 'banned') {
      return fail(res, 403, `账号已被封禁${user.ban_reason ? `：${user.ban_reason}` : ''}`)
    }
    loginFailures.delete(lockKey)
    const token = sessions.create(user.id, user.username)
    setSessionCookie(res, token)
    audit({ user, ip }, 'login')
    json(res, publicUser(user))
  })

  // 登出
  router.post('/logout', (req, res) => {
    const cookies = parseCookies(req)
    sessions.destroy(cookies[SESSION_COOKIE])
    clearSessionCookie(res)
    json(res, { ok: true })
  })

  // 当前用户（含绑定状态）
  router.get('/me', requireUser, (req, res) => {
    json(res, publicUser(users.findById(req.user.id)))
  })

  // 查看 / 重置自己的 API key
  router.get('/api-key', requireUser, (req, res) => {
    json(res, { apiKey: req.user.api_key })
  })

  router.post('/api-key/rotate', requireUser, (req, res) => {
    const apiKey = users.rotateApiKey(req.user.id)
    audit(req, 'rotate_api_key')
    json(res, { apiKey })
  })

  // admin：查看当前注册邀请码
  router.get('/invite-code', requireUser, requireAdmin, (req, res) => {
    json(res, { code: users.getSetting('register_code') || config.registerCode })
  })

  // admin：修改注册邀请码（立即生效，写入 settings 表）
  router.post('/invite-code', requireUser, requireAdmin, (req, res) => {
    const code = String((req.body || {}).code || '').trim()
    if (code.length < 4 || code.length > 64) {
      return fail(res, 400, '邀请码需为 4-64 位')
    }
    users.setSetting('register_code', code)
    audit(req, 'update_invite_code', null, `code=${code}`)
    json(res, { code })
  })

  // 用户资料（含统计/梦点/头像/签名）
  router.get('/profile', requireUser, (req, res) => {
    json(res, publicUser(users.findById(req.user.id)))
  })

  // 修改签名（≤60 字）
  router.post('/profile', requireUser, (req, res) => {
    const signature = String((req.body || {}).signature || '').trim()
    if (signature.length > 60) return fail(res, 400, '签名最多 60 字')
    users.setSignature(req.user.id, signature)
    json(res, publicUser(users.findById(req.user.id)))
  })

  // 修改密码：校验旧密码，改后销毁该用户所有会话
  router.post('/password', requireUser, (req, res) => {
    const { oldPassword, newPassword } = req.body || {}
    const [salt, hash] = String(req.user.password_hash).split(':')
    if (!verifyPassword(String(oldPassword || ''), salt, hash)) {
      return fail(res, 400, '旧密码不正确')
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return fail(res, 400, '新密码至少 6 位')
    }
    users.setPassword(req.user.id, newPassword)
    sessions.destroyAllForUser(req.user.id)
    audit(req, 'change_password')
    clearSessionCookie(res)
    json(res, { ok: true })
  })

  // 修改头像：接受 dataURL 或纯 base64（jpeg/png/webp，≤2MB）
  router.post('/avatar', requireUser, (req, res) => {
    const input = (req.body || {}).avatarBase64 || (req.body || {}).dataUrl || ''
    const { mime, buffer } = decodeAvatar(input)
    const ext = AVATAR_TYPES[mime]
    if (!ext) return fail(res, 400, '头像仅支持 jpg/png/webp')
    if (buffer.length === 0 || buffer.length > AVATAR_MAX_BYTES) {
      return fail(res, 400, '头像大小需在 2MB 以内')
    }
    const signatureOk =
      (ext === 'jpg' && buffer[0] === 0xff && buffer[1] === 0xd8) ||
      (ext === 'png' &&
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47) ||
      (ext === 'webp' && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46)
    if (!signatureOk) return fail(res, 400, '头像文件内容与格式不匹配')
    const filename = `u${req.user.id}_${Date.now()}.${ext}`
    try {
      writeFileSync(join(avatarDir(), filename), buffer)
    } catch {
      return fail(res, 500, '头像保存失败')
    }
    removeLocalAvatar(req.user.avatar_url)
    users.setAvatarUrl(req.user.id, localAvatarPath(req.user, filename))
    audit(req, 'change_avatar')
    json(res, publicUser(users.findById(req.user.id)))
  })

  // 本地头像文件（仅登录用户可读，避免匿名枚举）
  router.get('/avatar-file/:file', requireUser, (req, res) => {
    const file = basename(String(req.params.file || ''))
    if (!/^u\d+_\d+\.(jpg|png|webp)$/.test(file)) {
      return fail(res, 400, '文件名不合法')
    }
    res.sendFile(join(avatarDir(), file), (err) => {
      if (err && !res.headersSent) fail(res, 404, '头像不存在')
    })
  })

  // 在线会话管理
  router.get('/sessions', requireUser, (req, res) => {
    const cookies = parseCookies(req)
    const currentToken = cookies[SESSION_COOKIE]
    json(
      res,
      sessions.listByUser(req.user.id).map((s) => ({ ...s, current: s.token === currentToken })),
    )
  })

  router.post('/sessions/revoke', requireUser, (req, res) => {
    const token = String((req.body || {}).token || '')
    const list = sessions.listByUser(req.user.id)
    const target = list.find((s) => s.token === token)
    if (!target) return fail(res, 404, '会话不存在')
    sessions.destroy(token)
    if (target.current) clearSessionCookie(res)
    json(res, { ok: true })
  })

  // 播放统计上报：播放中每 30s 一次（服务端再兜底限幅）
  router.post('/stats', requireUser, (req, res) => {
    const seconds = Math.min(120, Math.max(0, Math.floor(Number((req.body || {}).seconds) || 0)))
    const songId = Number((req.body || {}).songId)
    if (seconds <= 0) return fail(res, 400, 'seconds 无效')
    users.addPlayStats(req.user.id, seconds, Number.isFinite(songId) ? songId : null)
    json(res, { ok: true })
  })

  // 每日签到：+10 梦点，幂等，记账
  router.post('/checkin', requireUser, (req, res) => {
    const user = users.findById(req.user.id)
    const today = shanghaiDate()
    if (user.last_checkin_date === today) {
      return json(res, { points: user.dream_points, alreadyChecked: true })
    }
    const points = users.addDreamPoints(user.id, 10, 'checkin', '每日签到')
    users.setLastCheckin(user.id, today)
    json(res, { points, alreadyChecked: false })
  })

  // 梦点流水
  router.get('/points/log', requireUser, (req, res) => {
    json(
      res,
      users.getDreamPointLogs(req.user.id, 50).map((row) => ({
        id: row.id,
        userId: row.user_id,
        delta: row.delta,
        balanceAfter: row.balance_after,
        type: row.type,
        note: row.note,
        refId: row.ref_id,
        createdAt: row.created_at,
      })),
    )
  })

  // 下载歌曲（兼容旧入口）：每次扣 1 梦点，返回直链。
  // 新前端请使用 /auth/downloads 下载管理器，避免浏览器直接跳转。
  router.post('/points/download', requireUser, async (req, res) => {
    const songId = Number((req.body || {}).songId)
    if (!Number.isFinite(songId) || songId <= 0) return fail(res, 400, 'songId 无效')
    const level = String((req.body || {}).level || 'exhigh')
    if (!['standard', 'exhigh', 'lossless', 'hires'].includes(level)) {
      return fail(res, 400, '音质参数无效')
    }
    const user = users.findById(req.user.id)
    if (!user.netease_cookie || user.netease_invalid === 1) {
      return fail(res, 403, '请先绑定或重新绑定网易云账号')
    }
    if ((user.dream_points || 0) < 1) {
      return fail(res, 402, '梦点不足，下载需要 1 梦点')
    }
    try {
      const { url, source } = await resolveDownloadUrl({ config, user, songId, level })
      const points = users.addDreamPoints(user.id, -1, 'song_download', `下载歌曲 ${songId}`, songId)
      audit(req, 'download_song', null, `songId=${songId} level=${level} source=${source}`)
      json(res, { url, points, cost: 1, source })
    } catch (err) {
      if (err.code === 'UPSTREAM_DOWN') return fail(res, 502, err.message)
      return fail(res, 404, err.message)
    }
  })

  /* ---------- 平台公告 ---------- */

  // 公开：仅已发布且未过期
  router.get('/announcements', (req, res) => {
    json(res, users.listAnnouncements(false).map(publicAnnouncement))
  })

  // admin：全部公告
  router.get('/announcements/admin', requireUser, requireAdmin, (req, res) => {
    json(res, users.listAnnouncements(true).map(publicAnnouncement))
  })

  router.post('/announcements', requireUser, requireAdmin, (req, res) => {
    const { title, content, level = 'info', status = 'draft', expiresAt } = req.body || {}
    const t = String(title || '').trim()
    if (!t) return fail(res, 400, '标题不能为空')
    const id = users.createAnnouncement({
      title: t,
      content: String(content || ''),
      level: ['info', 'maintenance', 'important'].includes(level) ? level : 'info',
      status: ['draft', 'published'].includes(status) ? status : 'draft',
      createdBy: req.user.username,
      expiresAt: Number(expiresAt) || null,
    })
    audit(req, 'create_announcement', null, `announcement_id=${id}`)
    json(res, publicAnnouncement(users.getAnnouncementById(id)))
  })

  router.post('/announcements/:id', requireUser, requireAdmin, (req, res) => {
    const id = Number(req.params.id)
    if (!users.getAnnouncementById(id)) return fail(res, 404, '公告不存在')
    const { title, content, level, status, expiresAt } = req.body || {}
    users.updateAnnouncement(id, {
      title: title !== undefined ? String(title).trim() || null : undefined,
      content: content !== undefined ? String(content) : undefined,
      level: level !== undefined ? level : undefined,
      status: status !== undefined ? status : undefined,
      expiresAt: expiresAt !== undefined ? Number(expiresAt) || null : undefined,
    })
    audit(req, 'update_announcement', null, `announcement_id=${id}`)
    json(res, publicAnnouncement(users.getAnnouncementById(id)))
  })

  router.delete('/announcements/:id', requireUser, requireAdmin, (req, res) => {
    const id = Number(req.params.id)
    if (!users.getAnnouncementById(id)) return fail(res, 404, '公告不存在')
    users.deleteAnnouncement(id)
    audit(req, 'delete_announcement', null, `announcement_id=${id}`)
    json(res, { ok: true })
  })

  /* ---------- 兑换码 ---------- */

  function publicRedeemCode(row) {
    return {
      id: row.id,
      code: row.code,
      points: row.points,
      note: row.note,
      createdBy: row.created_by,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      usedBy: row.used_by,
      usedAt: row.used_at,
    }
  }

  // 用户兑换：输入码 → 加梦点（幂等由 used_by 唯一占用保证）
  router.post('/redeem', requireUser, (req, res) => {
    const code = String((req.body || {}).code || '').trim()
    if (!code) return fail(res, 400, '请输入兑换码')
    try {
      const result = users.redeemCode(code, req.user.id)
      audit(req, 'redeem_code', null, `code=${result.code}`)
      json(res, result)
    } catch (err) {
      const message = err?.message || '兑换失败'
      const status = err?.code === 'CODE_EXPIRED' ? 400 : 404
      return fail(res, status, message)
    }
  })

  // admin：生成兑换码
  router.post('/redeem-codes/generate', requireUser, requireAdmin, (req, res) => {
    const points = Math.trunc(Number((req.body || {}).points))
    const count = Math.trunc(Number((req.body || {}).count || 1))
    if (!Number.isFinite(points) || points <= 0) return fail(res, 400, 'points 必须是正整数')
    if (count < 1 || count > 100) return fail(res, 400, 'count 需在 1-100 之间')
    const note = String((req.body || {}).note || '').trim()
    const expiresAt = Number((req.body || {}).expiresAt) || null
    const codes = users.createRedeemCodes({
      points,
      count,
      note,
      createdBy: req.user.username,
      expiresAt,
    })
    audit(req, 'generate_redeem_codes', null, `count=${codes.length} points=${points}`)
    json(res, { codes })
  })

  // admin：兑换码列表
  router.get('/redeem-codes', requireUser, requireAdmin, (req, res) => {
    json(res, users.listRedeemCodes(100).map(publicRedeemCode))
  })

  /* ---------- 发消息（Bark 式 webhook,扣 1 梦点,每日 3 次,失败也扣） ---------- */

  router.post('/message', requireUser, async (req, res) => {
    const title = String((req.body || {}).title || '').trim()
    const content = String((req.body || {}).content || '').trim()
    if (!title) return fail(res, 400, '标题不能为空')
    if (title.length > MESSAGE_TITLE_MAX) return fail(res, 400, `标题最多 ${MESSAGE_TITLE_MAX} 字`)
    if (content.length > MESSAGE_CONTENT_MAX) return fail(res, 400, `内容最多 ${MESSAGE_CONTENT_MAX} 字`)
    const user = users.findById(req.user.id)
    if ((user.dream_points || 0) < MESSAGE_COST) return fail(res, 402, '梦点不足,发送需要 1 梦点')
    const today = shanghaiDate()
    const used = users.countMessagesByDate(req.user.id, today)
    if (used >= MESSAGE_DAILY_LIMIT) return fail(res, 429, `今日已发送 ${MESSAGE_DAILY_LIMIT} 次,明天再来`)
    // 先扣点并记账: 失败也扣(中间服务可能拦截脏话等)
    const points = users.addDreamPoints(req.user.id, -MESSAGE_COST, 'message_send', `发送消息 ${title}`, null)
    let result = 'sent'
    let detail = ''
    try {
      const webhookUrl = `${config.messageWebhook}/${encodeURIComponent(title)}/${encodeURIComponent(content)}`
      const upstreamRes = await fetch(webhookUrl, { method: 'GET', signal: AbortSignal.timeout(10000) })
      if (!upstreamRes.ok) {
        result = `http_${upstreamRes.status}`
        detail = `HTTP ${upstreamRes.status}`
      }
    } catch (e) {
      result = 'error'
      detail = String(e?.message || '网络错误')
    }
    users.addMessageLog(req.user.id, title, content, result)
    audit(req, 'send_message', null, `title=${title} result=${result}`)
    const remaining = Math.max(0, MESSAGE_DAILY_LIMIT - (used + 1))
    json(res, { points, used: used + 1, remaining, dailyLimit: MESSAGE_DAILY_LIMIT, result, detail })
  })

  /* ---------- admin 用户管理 ---------- */

  // admin：用户列表
  router.get('/users', requireUser, requireAdmin, (req, res) => {
    const rows = users.listAll()
    json(res, rows.map(toPublicUser))
  })

  // admin：封禁/解封/改角色（不能操作自己）
  router.post('/users/:id', requireUser, requireAdmin, (req, res) => {
    const targetId = Number(req.params.id)
    if (targetId === req.user.id) return fail(res, 400, '不能修改自己的状态')
    const target = users.findById(targetId)
    if (!target) return fail(res, 404, '用户不存在')
    const action = String((req.body || {}).action || '')
    const reason = String((req.body || {}).reason || '').trim()
    if (action === 'ban') {
      users.setStatus(targetId, 'banned', reason || '管理员封禁')
    } else if (action === 'unban') {
      users.setStatus(targetId, 'active')
    } else if (action === 'set-admin') {
      users.setRole(targetId, 'admin')
    } else if (action === 'set-user') {
      users.setRole(targetId, 'user')
    } else {
      return fail(res, 400, '未知操作')
    }
    audit(req, action, targetId, `reason=${reason}`)
    json(res, { ok: true })
  })

  // admin：重置用户密码（改后该用户所有会话失效）
  router.post('/users/:id/reset-password', requireUser, requireAdmin, (req, res) => {
    const targetId = Number(req.params.id)
    if (targetId === req.user.id) return fail(res, 400, '不能重置自己的密码')
    const target = users.findById(targetId)
    if (!target) return fail(res, 404, '用户不存在')
    const newPassword = String((req.body || {}).newPassword || '')
    if (newPassword.length < 6) return fail(res, 400, '新密码至少 6 位')
    users.setPassword(targetId, newPassword)
    sessions.destroyAllForUser(targetId)
    audit(req, 'admin_reset_password', targetId)
    json(res, { ok: true })
  })

  // admin：给用户增加/扣除梦点（记账 + 审计）
  router.post('/users/:id/points', requireUser, requireAdmin, (req, res) => {
    const targetId = Number(req.params.id)
    const target = users.findById(targetId)
    if (!target) return fail(res, 404, '用户不存在')
    const delta = Math.trunc(Number((req.body || {}).delta))
    if (!Number.isFinite(delta) || delta === 0) return fail(res, 400, 'delta 必须是非零整数')
    const note = String((req.body || {}).note || '').trim()
    const points = users.addDreamPoints(targetId, delta, 'admin_adjust', note, req.user.id)
    audit(req, 'admin_adjust_points', targetId, `delta=${delta} note=${note}`)
    json(res, { points })
  })

  // admin：审计日志
  router.get('/audit-logs', requireUser, requireAdmin, (req, res) => {
    json(
      res,
      users.listAuditLogs(100).map((row) => ({
        id: row.id,
        actorId: row.actor_id,
        actorUsername: row.actor_username,
        action: row.action,
        targetUserId: row.target_user_id,
        detail: row.detail,
        ip: row.ip,
        createdAt: row.created_at,
      })),
    )
  })

  return { router, currentUser, requireUser }
}
