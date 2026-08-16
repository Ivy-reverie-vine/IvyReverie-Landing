import { Router } from 'express'

/**
 * /dreammusic/api/v1/* —— 鉴权 + 白名单 + 转发 api-enhanced。
 *
 * 通道：
 *  - UI：HttpOnly 会话 cookie（/auth/login 建立）
 *  - 外部：X-API-Key 请求头
 * 转发时自动注入该用户的网易 cookie；qr/check 803 时把 cookie 落库并剥离。
 */
export function createProxyRouter({ users, auth, config }) {
  const router = Router()

  // QR 绑定返回的 cookie 带 Max-Age/Expires/Path 等属性，直接传给上游会造出
  // 名为 Max-Age 的假 cookie；只保留 name=value 对（与旧前端 sanitizeCookie 一致）。
  const COOKIE_ATTRS = new Set([
    'Max-Age', 'Expires', 'Path', 'Domain',
    'Secure', 'HttpOnly', 'SameSite', 'Priority',
  ])

  function sanitizeCookie(raw) {
    return String(raw)
      .split(';')
      .map((s) => s.trim())
      .filter((s) => {
        if (!s || !s.includes('=')) return false
        const name = s.split('=')[0]
        return !COOKIE_ATTRS.has(name)
      })
      .join('; ')
  }

  function fail(res, httpStatus, message) {
    res.status(httpStatus).json({ code: httpStatus, message })
  }

  function resolveUser(req) {
    // 1) 会话 cookie（UI）
    const sessionUser = auth.currentUser(req)
    if (sessionUser) return sessionUser
    // 2) X-API-Key（外部调用）
    const key = req.get('x-api-key')
    if (key) return users.findByApiKey(key)
    return null
  }

  router.use(async (req, res) => {
    const relPath = String(req.path)
      .replace(/^\/dreammusic\/api\/v1\/?/, '')
      .replace(/^\/+/, '')
    if (!relPath) return fail(res, 400, '缺少接口路径')

    // 白名单
    if (!config.allowed.has(relPath)) {
      return fail(res, 404, `接口未开放：${relPath}`)
    }

    const user = resolveUser(req)
    if (!user) return fail(res, 401, '未登录或缺少 API Key')
    if (user.status === 'banned') {
      return fail(res, 403, `账号已被封禁${user.ban_reason ? `：${user.ban_reason}` : ''}`)
    }

    // QR 绑定接口不需要网易 cookie；其余必须已绑定
    const isQr = relPath.startsWith('login/qr/')
    if (!isQr && !user.netease_cookie) {
      return fail(res, 403, '请先绑定网易云账号')
    }
    if (!isQr && user.netease_invalid === 1) {
      return res.json({ code: 301, message: '网易云绑定已失效，请重新扫码' })
    }

    // 构造上游 URL：上游去前缀，注入 cookie + POST 时间戳
    const upstream = new URL(`${config.upstream}/${relPath}`)
    // qr/check 加时间戳破上游 URL 缓存（同 URL 2 分钟只请求一次，否则轮询卡在 801）
    if (relPath === 'login/qr/check' && !upstream.searchParams.has('timestamp')) {
      upstream.searchParams.set('timestamp', String(Date.now()))
    }
    for (const [k, v] of Object.entries(req.query)) {
      if (v !== undefined) upstream.searchParams.set(k, String(v))
    }
    if (!isQr && user.netease_cookie && !upstream.searchParams.has('cookie')) {
      upstream.searchParams.set('cookie', user.netease_cookie)
    }
    if (req.method === 'POST' && !upstream.searchParams.has('timestamp')) {
      upstream.searchParams.set('timestamp', String(Date.now()))
    }

    try {
      const init = { method: req.method, headers: {} }
      if (req.method === 'POST' || req.method === 'PUT') {
        init.headers['Content-Type'] = req.get('content-type') || 'application/json'
        init.body = JSON.stringify(req.body ?? {})
      }
      const upstreamRes = await fetch(upstream, init)
      const text = await upstreamRes.text()
      let body
      try {
        body = JSON.parse(text)
      } catch {
        body = { code: upstreamRes.status, raw: text }
      }

      // 上游 301 → 标记绑定失效（不全局登出，UI 提示重新扫码）
      if (!isQr && body && body.code === 301) {
        users.markNeteaseInvalid(user.id)
        return res.json({ code: 301, message: '网易云绑定已失效，请重新扫码' })
      }

      // qr/check 803 → cookie 落库、剥离，不回传浏览器
      if (relPath === 'login/qr/check' && body && body.code === 803) {
        const cookie = String(body.cookie || '')
        if (cookie) {
          users.setNeteaseCookie(user.id, sanitizeCookie(cookie))
          // 绑定成功 → 顺手拉一次 /login/status 存头像（失败静默，前端首字母兜底）
          fetch(
            `${config.upstream}/login/status?cookie=${encodeURIComponent(sanitizeCookie(cookie))}&randomCNIP=true`,
          )
            .then((r) => r.json())
            .then((d) => {
              const profile = d?.data?.profile || {}
              const avatar = profile.avatarUrl
              const uid = profile.userId || d?.data?.account?.id
              if (avatar) users.setAvatarUrl(user.id, avatar)
              if (uid) users.setNeteaseUid(user.id, uid)
            })
            .catch(() => {})
          delete body.cookie
          body.bound = true
        }
      }

      res.status(upstreamRes.status).json(body)
    } catch {
      fail(res, 502, '上游 API 不可达，请检查 api-enhanced 是否在运行')
    }
  })

  return router
}

/**
 * 后台回填：老用户绑定后没存 uid/头像时，向上游拉一次 /login/status。
 * 在 server/index.js 启动后异步执行，失败静默（用户中心已有首字母头像兜底）。
 */
export async function syncBoundUserProfiles(users, config) {
  const rows = users.listAll().filter((u) => u.netease_cookie && u.netease_invalid === 0)
  for (const user of rows) {
    if (user.netease_uid && user.avatar_url) continue
    try {
      const res = await fetch(
        `${config.upstream}/login/status?cookie=${encodeURIComponent(user.netease_cookie)}&randomCNIP=true`,
      )
      const d = await res.json()
      const profile = d?.data?.profile || {}
      const avatar = profile.avatarUrl
      const uid = profile.userId || d?.data?.account?.id
      if (avatar) users.setAvatarUrl(user.id, avatar)
      if (uid) users.setNeteaseUid(user.id, uid)
    } catch {
      /* 上游不可达时静默，下次重启再试 */
    }
  }
}
