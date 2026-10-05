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
  'user/playlist',
  'playlist/detail',
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
    /** 上游来源请求超时，避免来源解灰/解析无限期阻塞播放器 */
    upstreamTimeoutMs: Number(env.UPSTREAM_TIMEOUT_MS || 15000),
    automaticPlayback: {
      totalMs: Number(env.AUTO_PLAYBACK_BUDGET_MS || 10000),
      reserveMs: Number(env.AUTO_PLAYBACK_BILIBILI_RESERVE_MS || 3000),
    },
    /** 音乐来源注册配置；除 api-enhanced 外的来源必须单独 POC 后再启用 */
    musicSources: {
      bilibili: {
        enabled: env.BILIBILI_SOURCE_ENABLED === 'true',
        priority: 20,
        timeoutMs: Number(env.BILIBILI_SOURCE_TIMEOUT_MS || 8000),
        maxConcurrent: Number(env.BILIBILI_SOURCE_MAX_CONCURRENT || 2),
        circuitFailureThreshold: Number(env.BILIBILI_SOURCE_FAILURE_THRESHOLD || 3),
        circuitOpenMs: Number(env.BILIBILI_SOURCE_CIRCUIT_OPEN_MS || 30000),
      },
      apiEnhanced: {
        enabled: env.API_ENHANCED_SOURCE_ENABLED !== 'false',
        priority: 100,
        timeoutMs: Number(env.API_ENHANCED_SOURCE_TIMEOUT_MS || env.UPSTREAM_TIMEOUT_MS || 15000),
        maxConcurrent: Number(env.API_ENHANCED_SOURCE_MAX_CONCURRENT || 4),
        circuitFailureThreshold: Number(env.API_ENHANCED_SOURCE_FAILURE_THRESHOLD || 3),
        circuitOpenMs: Number(env.API_ENHANCED_SOURCE_CIRCUIT_OPEN_MS || 30000),
        capabilities: ['search', 'detail', 'lyrics', 'playback'],
      },
      /** Meting POC 默认关闭；只接受服务端 sidecar 地址和服务端 token */
      meting: {
        enabled: env.METING_SOURCE_ENABLED === 'true',
        baseUrl: env.METING_API_URL || '',
        token: env.METING_TOKEN || '',
        platforms: envList(env.METING_PLATFORMS || 'tencent,kugou'),
        priority: Number(env.METING_SOURCE_PRIORITY || 40),
        timeoutMs: Number(env.METING_SOURCE_TIMEOUT_MS || 8000),
        maxConcurrent: Number(env.METING_SOURCE_MAX_CONCURRENT || 4),
        circuitFailureThreshold: Number(env.METING_SOURCE_FAILURE_THRESHOLD || 3),
        circuitOpenMs: Number(env.METING_SOURCE_CIRCUIT_OPEN_MS || 30000),
        cacheTtlMs: Number(env.METING_CACHE_TTL_MS || 30000),
        minRequestIntervalMs: Number(env.METING_MIN_REQUEST_INTERVAL_MS || 200),
      },
      /** Audius POC 默认关闭；Bearer Token 仅留在 NightDream 服务端 */
      audius: {
        enabled: env.AUDIUS_SOURCE_ENABLED === 'true',
        baseUrl: env.AUDIUS_API_URL || 'https://api.audius.co/v1',
        apiKey: env.AUDIUS_API_KEY || '',
        bearerToken: env.AUDIUS_BEARER_TOKEN || '',
        priority: Number(env.AUDIUS_SOURCE_PRIORITY || 30),
        timeoutMs: Number(env.AUDIUS_SOURCE_TIMEOUT_MS || 8000),
        maxConcurrent: Number(env.AUDIUS_SOURCE_MAX_CONCURRENT || 4),
        circuitFailureThreshold: Number(env.AUDIUS_SOURCE_FAILURE_THRESHOLD || 3),
        circuitOpenMs: Number(env.AUDIUS_SOURCE_CIRCUIT_OPEN_MS || 30000),
        cacheTtlMs: Number(env.AUDIUS_CACHE_TTL_MS || 30000),
        minRequestIntervalMs: Number(env.AUDIUS_MIN_REQUEST_INTERVAL_MS || 100),
      },
    },
    /** 第三方直链兼容层默认关闭；启用前必须有 AVPlayer 失败诊断样本 */
    mediaProxy: {
      enabled: env.MEDIA_PROXY_ENABLED === 'true',
      secret: env.MEDIA_PROXY_SECRET || '',
      ttlMs: Number(env.MEDIA_PROXY_TTL_MS || 30000),
      timeoutMs: Number(env.MEDIA_PROXY_TIMEOUT_MS || 15000),
      publicBaseUrl: env.PUBLIC_BASE_URL || '',
    },
    /** 发消息 webhook 根地址（Bark 式 GET /title/content） */
    messageWebhook: env.MESSAGE_WEBHOOK || 'https://api.chuckfang.com/ivyreverie',
  }
}
