import express from 'express'
import { join, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { loadConfig } from './config.js'
import { openDb, createUserStore } from './db.js'
import { createSessionStore } from './session.js'
import { createAuthRouter } from './auth.js'
import { createProxyRouter, syncBoundUserProfiles } from './proxy.js'
import { createPlaybackDiagnostics } from './playbackDiagnostics.js'
import { createDownloadManager } from './downloadManager.js'
import { createRateLimiter } from './rateLimit.js'
import { MediaReferenceStore } from './mediaReference.js'
import { createMediaProxyRouter } from './mediaProxy.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const config = loadConfig()
if (!isAbsolute(config.dataDir)) config.dataDir = join(__dirname, '..', config.dataDir)
const db = openDb(config.dataDir)
const users = createUserStore(db)
// 环境变量指定的管理员（启动时同步角色）
for (const name of String(process.env.ADMIN_USERNAMES || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)) {
  const u = users.findByUsername(name)
  if (u) users.setRole(u.id, 'admin')
}
const sessions = createSessionStore(config.sessionTtlMs)
const auth = createAuthRouter({ users, sessions, config })
const playbackDiagnostics = createPlaybackDiagnostics()
const mediaReferences = new MediaReferenceStore({
  secret: config.mediaProxy.secret || undefined,
  ttlMs: config.mediaProxy.ttlMs,
})
const downloads = createDownloadManager({
  users,
  config,
  requireUser: auth.requireUser,
  audit: (req, action, targetUserId = null, detail = '') => {
    try {
      users.addAuditLog({
        actorId: req.user?.id ?? null,
        actorUsername: req.user?.username || 'system',
        action,
        targetUserId,
        detail,
        ip: req.ip || 'download-manager',
      })
    } catch {
      /* 审计失败不阻塞下载 */
    }
  },
})
const proxy = createProxyRouter({
  users,
  auth,
  config,
  diagnostics: playbackDiagnostics,
  mediaReferences: config.mediaProxy.enabled ? mediaReferences : null,
})
const proxyV2 = createProxyRouter({
  users,
  auth,
  config,
  diagnostics: playbackDiagnostics,
  mediaReferences: config.mediaProxy.enabled ? mediaReferences : null,
  apiVersion: 'v2',
})

const app = express()
app.use(express.json({ limit: '1mb' }))

// 全 API 轻量限流（登录接口另有失败锁定）
app.use(
  '/dreammusic/api/v1',
  createRateLimiter({
    max: config.rateLimitPerMin,
    keyFn: (req) => `${req.ip || req.socket?.remoteAddress || 'unknown'}`,
  }),
)
app.use(
  '/dreammusic/api/v2',
  createRateLimiter({
    max: config.rateLimitPerMin,
    keyFn: (req) => `${req.ip || req.socket?.remoteAddress || 'unknown'}`,
  }),
)

// 中间层自有账户接口
app.use('/dreammusic/api/v1/auth', auth.router)
// 下载管理（任务/进度/文件获取）
app.use('/dreammusic/api/v1/auth/downloads', downloads.router)
// 鉴权 + 白名单 + 转发
app.use('/dreammusic/api/v1', proxy)
app.use('/dreammusic/api/v2', proxyV2)
if (config.mediaProxy.enabled) {
  app.use('/dreammusic/media', createMediaProxyRouter({
    store: mediaReferences,
    config: config.mediaProxy,
    diagnostics: playbackDiagnostics,
  }))
}

// 生产：静态托管 dist（SPA fallback）
const distDir = join(__dirname, '..', 'dist')
if (existsSync(join(distDir, 'index.html'))) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.path.startsWith('/dreammusic/api/')) return next()
    res.sendFile(join(distDir, 'index.html'))
  })
}

app.listen(config.port, () => {
  console.log(`[dreammusic] middleware listening on http://localhost:${config.port}`)
  console.log(`[dreammusic] upstream: ${config.upstream}`)
  console.log(`[dreammusic] allowed: ${[...config.allowed].join(', ')}`)
})

// 启动后回填老用户缺失的网易云 uid / 头像
syncBoundUserProfiles(users, config).catch(() => {})
