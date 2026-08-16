/**
 * 中间层配置（全部来自 env，带默认值）。
 */

const DEFAULT_ALLOWED = [
  'search',
  'song/detail',
  'song/url/v1',
  'song/url/match',
  'lyric/new',
  'personalized',
  'playlist/track/all',
  // 私人FM / 每日推荐 / 红心
  'personal_fm',
  'fm_trash',
  'recommend/songs',
  'recommend/resource',
  'like',
  'likelist',
  // 用户自己的网易云账号信息（回填 uid / 头像）
  'login/status',
  // QR 绑定（无需网易 cookie，仅需会话/API Key）
  'login/qr/key',
  'login/qr/create',
  'login/qr/check',
]

function envList(raw) {
  return (raw || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function loadConfig(env = process.env) {
  const extra = envList(env.API_ALLOWED_PATHS)
  return {
    /** 中间层监听端口（Vite dev 代理指向这里） */
    port: Number(env.PORT || 3001),
    /** api-enhanced 上游地址（compose 里是 http://api-enhanced:3000） */
    upstream: env.UPSTREAM || 'http://localhost:3000',
    /** 注册邀请码 */
    registerCode: env.REGISTER_CODE || 'dreammusic',
    /** 会话有效期 */
    sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
    /** 生产 https 下设为 true */
    cookieSecure: env.COOKIE_SECURE === 'true',
    /** 放行端点白名单（默认集 + env 扩展） */
    allowed: new Set([...DEFAULT_ALLOWED, ...extra]),
    /** SQLite 数据目录 */
    dataDir: env.DATA_DIR || 'data',
    /** 每个 IP 每分钟 API 请求上限（内存滑动窗口） */
    rateLimitPerMin: Number(env.RATE_LIMIT_PER_MIN || 300),
  }
}
