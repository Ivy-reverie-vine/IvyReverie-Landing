import { Router } from 'express'
import { resolveManualPlayback } from './music/manualPlayback.js'
import { rememberPlayback, recoverPlayback } from './music/playbackRecovery.js'
import { resolveCatalogLyrics } from './music/catalogLyrics.js'
import {
  createPlaybackDiagnostics,
  DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL,
  DIAGNOSTIC_CATEGORY_SOURCE_FAILURE,
  DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT,
  DIAGNOSTIC_CATEGORY_URL_EXPIRED_OR_UNREACHABLE,
  DIAGNOSTIC_STAGE_SOURCE_RESOLUTION,
  DIAGNOSTIC_STAGE_URL_RESPONSE,
} from './playbackDiagnostics.js'
import { createMusicOrchestrator } from './music/musicOrchestrator.js'
import { toMediaV2Body } from './mediaContract.js'

export function createConfiguredUpstreamFetcher(config) {
  return async function fetchUpstream(url, init, requestedTimeoutMs = config.upstreamTimeoutMs) {
    const controller = new AbortController()
    const timeoutMs = Math.max(1, Number(requestedTimeoutMs || 15000))
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const fetchImpl = config.fetch || globalThis.fetch
      return await fetchImpl(url, { ...init, signal: init.signal
        ? AbortSignal.any([controller.signal, init.signal]) : controller.signal })
    } catch (error) {
      if (controller.signal.aborted) {
        const timeout = new Error('upstream request timed out')
        timeout.code = 'UPSTREAM_TIMEOUT'
        throw timeout
      }
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}

/**
 * /dreammusic/api/v1/* —— 鉴权 + 白名单 + 转发 api-enhanced。
 *
 * 通道：
 *  - UI：HttpOnly 会话 cookie（/auth/login 建立）
 *  - 外部：X-API-Key 请求头
 * 转发时自动注入该用户的网易 cookie；qr/check 803 时把 cookie 落库并剥离。
 */
export function createProxyRouter({
  users,
  auth,
  config,
  diagnostics = createPlaybackDiagnostics(),
  musicOrchestrator = null,
  mediaReferences = null,
  apiVersion = 'v1',
  fetchUpstream: providedFetchUpstream = null,
}) {
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

  function fail(res, httpStatus, message, errorCode = '') {
    res.status(httpStatus).json({ code: httpStatus, message, ...(errorCode ? { errorCode } : {}) })
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

  function capabilityFor(relPath) {
    if (relPath === 'search') return 'search'
    if (relPath === 'song/url/v1') return 'media-resolution'
    if (relPath === 'song/url/match') return 'download-resolution'
    if (relPath === 'lyric/new') return 'lyrics'
    return 'metadata'
  }

  function isMediaResolution(relPath) {
    return relPath === 'song/url/v1' || relPath === 'song/url/match'
  }

  function mediaUrlFrom(body) {
    const first = Array.isArray(body?.data) ? body.data[0] : null
    return typeof first?.url === 'string' ? first.url : ''
  }

  function elapsed(startedAt) {
    return Math.max(0, Date.now() - startedAt)
  }

  function withMediaProxyUrl(result, req, user) {
    const first = Array.isArray(result.body?.data) ? result.body.data[0] : null
    if (typeof first?.url !== 'string' || first.url === '') return result
    if (mediaReferences === null || config.mediaProxy?.enabled !== true) {
      if (first.mediaTransport?.requiresProxy) return { status: 503, body: {
        code: 503, errorCode: 'MEDIA_PROXY_REQUIRED', message: '此音源需要启用媒体代理', data: [],
        audioIntegrity: { ...result.body.audioIntegrity, status: 'unavailable', reason: 'media_proxy_required' },
      } }
      return result
    }
    const token = mediaReferences.issue({ userId: user.id, upstreamUrl: first.url, headers: first.mediaTransport?.headers })
    const configuredOrigin = String(config.mediaProxy.publicBaseUrl || '').replace(/\/$/, '')
    const origin = configuredOrigin || `${req.protocol}://${req.get('host')}`
    const data = result.body.data.map(({ mediaTransport: _transport, ...item }, index) => index === 0
      ? { ...item, url: `${origin}/dreammusic/media/stream/${token}` } : item)
    return { ...result, body: { ...result.body, data } }
  }

  const fetchUpstream = providedFetchUpstream || createConfiguredUpstreamFetcher(config)

  const orchestrator = musicOrchestrator || createMusicOrchestrator({
    config,
    diagnostics,
    fetchUpstream,
  })

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
    const isVersionedMusicRoute = apiVersion === 'v2' && [
      'search', 'song/detail', 'song/url/v1', 'lyric/new',
    ].includes(relPath)
    if (!isQr && !isVersionedMusicRoute && !user.netease_cookie) {
      return fail(res, 403, '请先绑定网易云账号')
    }
    if (!isQr && !isVersionedMusicRoute && user.netease_invalid === 1) {
      return res.json({ code: 301, message: '网易云绑定已失效，请重新扫码' })
    }

    if (apiVersion === 'v2' && relPath === 'search' && req.query.aggregate === 'true') {
      try {
        const result = await orchestrator.aggregateSearch({ query: req.query, user })
        return res.status(result.status).json(result.body)
      } catch (error) {
        if (error.code === 'INVALID_SEARCH_PAGE') return fail(res, 400, '搜索关键词或来源分页无效', error.code)
        if (error.code === 'INVALID_SEARCH_SESSION') return fail(res, 400, '搜索会话失效，请重新搜索', error.code)
        return fail(res, 502, '聚合搜索失败，请重试', 'SEARCH_FAILED')
      }
    }

    if (apiVersion === 'v2' && relPath === 'song/url/v1' && req.query.recover === 'true') {
      const controller = new AbortController()
      const cancel = () => { if (!res.writableEnded) controller.abort() }
      res.on('close', cancel)
      try {
        const result = await recoverPlayback(orchestrator, { token: req.query.recoveryToken,
          mediaRef: req.query.mediaRef, user, signal: controller.signal })
        if (!controller.signal.aborted) {
          const response = withMediaProxyUrl(result, req, user)
          return res.status(response.status).json(response.body)
        }
      } catch (error) {
        if (!controller.signal.aborted) return fail(res, error.code === 'INVALID_PLAYBACK_RECEIPT' ? 400 : 502,
          '所选资源恢复失败，请重试或重新选择来源', error.code || 'PLAYBACK_RECOVERY_FAILED')
      } finally { res.off('close', cancel) }
      return
    }

    if (apiVersion === 'v2' && relPath === 'song/url/v1' && ['true', 'other'].includes(req.query.manual)) {
      const controller = new AbortController()
      const cancel = () => { if (!res.writableEnded) controller.abort() }
      res.on('close', cancel)
      try {
        const result = await resolveManualPlayback(orchestrator, { user, signal: controller.signal,
          catalogRef: req.query.catalogRef, mediaRef: req.query.mediaRef, searchSession: req.query.searchSession,
          otherRecording: req.query.manual === 'other' })
        if (controller.signal.aborted) return
        const response = withMediaProxyUrl(rememberPlayback(orchestrator, result, user, req.query), req, user)
        return res.status(response.status).json(response.body)
      } catch (error) {
        if (controller.signal.aborted) return
        if (error.code === 'INVALID_SEARCH_SESSION') return fail(res, 400, '搜索会话失效，请重新搜索', error.code)
        if (error.code === 'INVALID_SOURCE_SELECTION') return fail(res, 400, req.query.manual === 'other'
          ? '所选候选不属于当前搜索与原曲，请重新搜索' : '所选来源未确认属于原录音', error.code)
        if (error.code === 'SOURCE_UNAVAILABLE') return fail(res, 503, '所选来源暂不可用，请重试或重新选择', error.code)
        return fail(res, 502, '所选来源解析失败，请重试或重新选择', 'PLAYBACK_FAILED')
      } finally { res.off('close', cancel) }
    }

    if (apiVersion === 'v2' && relPath === 'song/url/v1' && req.query.automatic === 'true') {
      const controller = new AbortController()
      const cancel = () => { if (!res.writableEnded) controller.abort() }
      res.on('close', cancel)
      try {
        const result = await orchestrator.resolveAutomaticPlayback({ user,
          mediaRef: req.query.mediaRef, searchSession: req.query.searchSession, signal: controller.signal,
          mediaProxyAvailable: config.mediaProxy?.enabled === true && !!mediaReferences })
        if (controller.signal.aborted) return
        const response = withMediaProxyUrl(rememberPlayback(orchestrator, result, user, req.query), req, user)
        return res.status(response.status).json(response.body)
      } catch (error) {
        if (error.code === 'INVALID_SEARCH_SESSION') return fail(res, 400, '搜索会话失效，请重新搜索', error.code)
        if (error.code === 'INVALID_MEDIA_REF') return fail(res, 400, '所选条目不属于当前搜索', error.code)
        return fail(res, 502, '自动寻找完整版失败，请重试', 'PLAYBACK_FAILED')
      } finally { res.off('close', cancel) }
    }

    if (apiVersion === 'v2' && relPath === 'lyric/new' && req.query.catalogRef !== undefined) {
      const controller = new AbortController()
      const cancel = () => { if (!res.writableEnded) controller.abort() }
      res.on('close', cancel)
      try {
        if (req.query.mediaRef !== undefined && req.query.mediaRef !== req.query.catalogRef) {
          return fail(res, 400, '歌词引用必须指向原目录条目', 'INVALID_MEDIA_REF')
        }
        const result = await resolveCatalogLyrics(orchestrator, { user, signal: controller.signal,
          catalogRef: req.query.catalogRef, playbackRef: req.query.playbackRef ?? req.query.catalogRef })
        if (!controller.signal.aborted) return res.status(result.status).json(result.body)
      } catch (error) {
        if (!controller.signal.aborted) return fail(res, 400, '歌词来源引用无效', error.code || 'INVALID_MEDIA_REF')
      } finally { res.off('close', cancel) }
      return
    }

    if (orchestrator.supportsPath(relPath)) {
      try {
        const mediaRef = typeof req.query.mediaRef === 'string' ? req.query.mediaRef : ''
        const result = apiVersion === 'v2' && isVersionedMusicRoute
          ? mediaRef
            ? await orchestrator.dispatchMediaRef({
                path: relPath,
                mediaRef,
                query: req.query,
                method: req.method,
                body: req.body,
                user,
              })
            : relPath === 'search'
              ? await orchestrator.dispatch({
                  path: relPath,
                  sourceId: typeof req.query.source === 'string' ? req.query.source : '',
                  query: req.query,
                  method: req.method,
                  body: req.body,
                  user,
                })
              : (() => { throw new Error('mediaRef is required') })()
          : await orchestrator.dispatch({
              path: relPath,
              query: req.query,
              method: req.method,
              body: req.body,
              user,
            })
        // 上游 301 → 标记绑定失效（不全局登出，UI 提示重新扫码）
        if (result.body && result.body.code === 301) {
          users.markNeteaseInvalid(user.id)
          return res.json({ code: 301, message: '网易云绑定已失效，请重新扫码' })
        }
        const normalized = apiVersion === 'v2' && isVersionedMusicRoute
          ? { ...result, body: toMediaV2Body(relPath, result.body, mediaRef) }
          : result
        const response = relPath === 'song/url/v1'
          ? withMediaProxyUrl(apiVersion === 'v2' ? rememberPlayback(orchestrator, normalized, user, req.query) : normalized, req, user)
          : normalized
        return res.status(response.status).json(response.body)
      } catch (error) {
        if (apiVersion === 'v2' && error?.code === 'CAPABILITY_UNSUPPORTED') {
          return fail(res, 501, relPath === 'lyric/new' ? '当前音源未提供歌词' : '当前音源不支持此功能', error.code)
        }
        if (apiVersion === 'v2' && error?.code === 'SOURCE_UNAVAILABLE') {
          return fail(res, 503, '当前音源未启用、暂不可用或正在熔断；请切换音源或稍后重试', error.code)
        }
        if (apiVersion === 'v2' && error?.code === 'IDENTITY_UNSUPPORTED') {
          return fail(res, 400, '当前接口尚不支持跨来源身份组合', error.code)
        }
        if (error?.message === 'mediaRef is required' || error?.code === 'INVALID_MEDIA_REF') {
          return fail(res, 400, error?.code === 'INVALID_MEDIA_REF' ? 'mediaRef 无效' : '缺少 mediaRef',
            apiVersion === 'v2' ? error.code || 'MEDIA_REF_REQUIRED' : '')
        }
        return fail(res, 502, apiVersion === 'v2' ? '当前音源请求失败，请稍后重试或切换音源' : '上游 API 不可达，请检查 api-enhanced 是否在运行')
      }
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

    const diagnosticStartedAt = Date.now()
    const diagnostic = {
      source: 'api-enhanced',
      capability: capabilityFor(relPath),
    }

    try {
      const init = { method: req.method, headers: {} }
      if (req.method === 'POST' || req.method === 'PUT') {
        init.headers['Content-Type'] = req.get('content-type') || 'application/json'
        init.body = JSON.stringify(req.body ?? {})
      }
      const upstreamRes = await fetchUpstream(upstream, init)
      const text = await upstreamRes.text()
      let body
      try {
        body = JSON.parse(text)
      } catch {
        body = { code: upstreamRes.status, raw: text }
      }

      const bodyOk = body?.code === undefined || body?.code === 200
      const sourceOk = upstreamRes.status >= 200 && upstreamRes.status < 300 && bodyOk
      diagnostics.record({
        ...diagnostic,
        stage: DIAGNOSTIC_STAGE_SOURCE_RESOLUTION,
        durationMs: elapsed(diagnosticStartedAt),
        ok: sourceOk,
        ...(sourceOk ? {} : { errorCategory: DIAGNOSTIC_CATEGORY_SOURCE_FAILURE }),
      })
      if (isMediaResolution(relPath)) {
        const mediaUrl = mediaUrlFrom(body)
        const mediaOk = sourceOk && mediaUrl !== ''
        diagnostics.record({
          ...diagnostic,
          stage: DIAGNOSTIC_STAGE_URL_RESPONSE,
          durationMs: elapsed(diagnosticStartedAt),
          ok: mediaOk,
          ...(mediaOk
            ? {}
            : {
                errorCategory: sourceOk
                  ? DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL
                  : upstreamRes.status >= 400
                    ? DIAGNOSTIC_CATEGORY_URL_EXPIRED_OR_UNREACHABLE
                    : DIAGNOSTIC_CATEGORY_SOURCE_FAILURE,
              }),
        })
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
    } catch (error) {
      const timedOut = error?.code === 'UPSTREAM_TIMEOUT' || error?.name === 'AbortError'
      diagnostics.record({
        ...diagnostic,
        stage: DIAGNOSTIC_STAGE_SOURCE_RESOLUTION,
        durationMs: elapsed(diagnosticStartedAt),
        ok: false,
        errorCategory: timedOut ? DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT : DIAGNOSTIC_CATEGORY_SOURCE_FAILURE,
      })
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
