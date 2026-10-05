/**
 * DreamMusic API 客户端（D4 中间层版）。
 *
 * - 统一走 `/dreammusic/api/v1` 前缀（Vite dev 代理 → Express 中间层 → api-enhanced）。
 * - 会话由中间层 HttpOnly cookie 管理（credentials: 'include'），前端不再持有网易 cookie。
 * - 外部调用方用 `X-API-Key` 走同一前缀（见 server/proxy.js）。
 * - 2 分钟内存缓存（同 URL 不重复请求，对应用户「别过于频繁请求」硬约束）。
 * - 错误码分流：301→绑定失效（提示重新扫码）、460→海外风控、503→频繁、网络异常→友好错误。
 */

const API_BASE = '/dreammusic/api/v1'
const CACHE_TTL = 2 * 60 * 1000 // 2 分钟

/** 缓存条目 */
interface CacheEntry {
  t: number
  data: unknown
}
const cache = new Map<string, CacheEntry>()

/** 业务错误码分类 */
export type NcmErrorCode =
  | 'AUTH' // 未登录 / 会话失效
  | 'REBIND' // 301 网易云绑定失效
  | 'GEOBLOCK' // 460
  | 'RATE_LIMIT' // 503
  | 'NETWORK' // fetch 抛错
  | 'HTTP' // 非 2xx
  | 'API_ERROR' // 其它非 200

export class NcmError extends Error {
  code: NcmErrorCode
  constructor(message: string, code: NcmErrorCode) {
    super(message)
    this.code = code
    this.name = 'NcmError'
  }
}

/** 通知 UI 层：网易云绑定失效，应切到重新扫码页（会话保留，不清登录）。 */
export function dispatchRebind(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('dm-rebind'))
  }
}

/** 通知 UI 层：DreamMusic 会话失效（401），应清空界面状态并回登录页。 */
export function dispatchUnauthorized(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('dm-unauthorized'))
  }
}

/** 测试用：清缓存 */
export function __resetCache(): void {
  cache.clear()
}

/**
 * 使某个接口前缀的缓存失效（例如红心切换后让 /likelist 立即刷新）。
 * pathPrefix 为空时清空全部缓存。
 */
export function __invalidateCache(pathPrefix = ''): void {
  if (!pathPrefix) {
    cache.clear()
    return
  }
  for (const key of cache.keys()) {
    if (key.includes(`${API_BASE}${pathPrefix}`)) cache.delete(key)
  }
}

/* ---------- URL 构建（纯函数，可单测） ---------- */

/**
 * 构建代理 URL：拼 /dreammusic/api/v1 前缀 + randomCNIP + 业务参数。
 * cookie 由中间层注入，前端不再拼。
 */
export function buildUrl(path: string, params: Record<string, unknown> = {}, version: 'v1' | 'v2' = 'v1'): string {
  const q = new URLSearchParams()
  q.set('randomCNIP', 'true')
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) q.set(k, String(v))
  }
  return `/dreammusic/api/${version}${path}?${q.toString()}`
}

/** 缓存 key（当前即 URL，单独导出便于未来调整策略） */
export function cacheKey(path: string, params: Record<string, unknown>): string {
  return buildUrl(path, params)
}

/* ---------- 中间层自有账户接口（auth/*，不缓存） ---------- */

async function authRequest<T>(
  path: string,
  { method = 'GET', body }: { method?: 'GET' | 'POST'; body?: unknown } = {},
): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}/auth/${path}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new NcmError('网络异常，请检查服务是否在运行', 'NETWORK')
  }

  let data: { code?: number; message?: string; data?: T }
  try {
    data = (await res.json()) as typeof data
  } catch {
    throw new NcmError(`HTTP ${res.status}`, 'HTTP')
  }

  if (!res.ok || (typeof data.code === 'number' && data.code !== 200)) {
    // 会话失效时通知 UI 回登录页；login/register 的 401 是账号密码错误，me 由 DreamMusic 启动门禁自行处理
    if (res.status === 401 && path !== 'login' && path !== 'register' && path !== 'me') {
      dispatchUnauthorized()
    }
    throw new NcmError(data.message || `请求失败（${data.code ?? res.status}）`, 'AUTH')
  }
  return data.data as T
}

export interface UserInfo {
  id: number
  username: string
  role?: 'admin' | 'user'
  status?: 'active' | 'banned'
  banReason?: string | null
  bound: boolean
  bindInvalid: boolean
  avatarUrl?: string | null
  signature?: string
  playSeconds?: number
  playedSongCount?: number
  dreamPoints?: number
  messageToday?: number
  lastCheckinDate?: string | null
  neteaseUid?: string | null
  apiKey?: string
  createdAt?: number
}

export interface Announcement {
  id: number
  title: string
  content: string
  level: 'info' | 'maintenance' | 'important'
  status: 'draft' | 'published' | 'archived'
  createdBy: string
  createdAt: number
  publishedAt: number | null
  expiresAt: number | null
}

export interface SessionInfo {
  token: string
  username: string
  createdAt: number
  expiresAt: number
  current: boolean
}

export interface PointLog {
  id: number
  userId: number
  delta: number
  balanceAfter: number
  type: string
  note: string | null
  refId: string | null
  createdAt: number
}

export interface AuditLog {
  id: number
  actorId: number | null
  actorUsername: string
  action: string
  targetUserId: number | null
  detail: string | null
  ip: string | null
  createdAt: number
}

export function register(
  username: string,
  password: string,
  inviteCode: string,
): Promise<{ username: string }> {
  return authRequest('register', {
    method: 'POST',
    body: { username, password, inviteCode },
  })
}

export function login(username: string, password: string): Promise<UserInfo> {
  return authRequest('login', { method: 'POST', body: { username, password } })
}

export function logout(): Promise<{ ok: boolean }> {
  return authRequest('logout', { method: 'POST' })
}

export function me(): Promise<UserInfo> {
  return authRequest<UserInfo>('me')
}

export function getApiKey(): Promise<{ apiKey: string }> {
  return authRequest('api-key')
}

export function rotateApiKey(): Promise<{ apiKey: string }> {
  return authRequest('api-key/rotate', { method: 'POST' })
}

/** 用户资料（头像/签名/统计/梦点） */
export function getProfile(): Promise<UserInfo> {
  return authRequest<UserInfo>('profile')
}

/** 修改签名（≤60 字） */
export function updateSignature(signature: string): Promise<UserInfo> {
  return authRequest('profile', { method: 'POST', body: { signature } })
}

/** 播放统计上报：播放中每 30s 一次 */
export function reportStats(seconds: number, songId?: number): Promise<{ ok: boolean }> {
  return authRequest('stats', { method: 'POST', body: { seconds, songId } })
}

/** 每日签到：+10 梦点，幂等 */
export function checkin(): Promise<{ points: number; alreadyChecked: boolean }> {
  return authRequest('checkin', { method: 'POST' })
}

/** 发消息：扣 1 梦点，每日最多 3 次。 */
export interface SendMessageResult {
  points: number
  used: number
  remaining: number
  dailyLimit: number
  result: string
  detail: string
}

export function sendMessage(title: string, content: string): Promise<SendMessageResult> {
  return authRequest('message', { method: 'POST', body: { title, content } })
}

/** 修改密码（成功后服务端会销毁全部会话） */
export function changePassword(
  oldPassword: string,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return authRequest('password', { method: 'POST', body: { oldPassword, newPassword } })
}

/** 上传头像：接受 dataURL 或纯 base64（jpeg/png/webp ≤2MB） */
export function uploadAvatar(avatarBase64: string): Promise<UserInfo> {
  return authRequest('avatar', { method: 'POST', body: { avatarBase64 } })
}

/** 当前账号的在线会话 */
export function getSessions(): Promise<SessionInfo[]> {
  return authRequest('sessions')
}

export function revokeSession(token: string): Promise<{ ok: boolean }> {
  return authRequest('sessions/revoke', { method: 'POST', body: { token } })
}

/** 梦点流水 */
export function getPointLogs(): Promise<PointLog[]> {
  return authRequest('points/log')
}

/** admin：用户列表 */
export function getUsers(): Promise<UserInfo[]> {
  return authRequest<UserInfo[]>('users')
}

/** admin：封禁/解封/改角色 */
export function adminUserAction(
  id: number,
  action: 'ban' | 'unban' | 'set-admin' | 'set-user',
  reason?: string,
): Promise<{ ok: boolean }> {
  return authRequest(`users/${id}`, { method: 'POST', body: { action, reason } })
}

/** admin：给用户增减梦点 */
export function adminAdjustPoints(
  id: number,
  delta: number,
  note: string,
): Promise<{ points: number }> {
  return authRequest(`users/${id}/points`, { method: 'POST', body: { delta, note } })
}

export interface RedeemCode {
  id: number
  code: string
  points: number
  note: string | null
  createdBy: string
  createdAt: number
  expiresAt: number | null
  usedBy: number | null
  usedAt: number | null
}

/** 兑换码：输入 code 兑换梦点 */
export function redeemCode(code: string): Promise<{
  points: number
  redeemedPoints: number
  code: string
}> {
  return authRequest('redeem', { method: 'POST', body: { code } })
}

/** admin：生成兑换码 */
export function generateRedeemCodes(input: {
  points: number
  count?: number
  note?: string
  expiresAt?: number | null
}): Promise<{ codes: string[] }> {
  return authRequest('redeem-codes/generate', { method: 'POST', body: input })
}

/** admin：兑换码列表 */
export function getRedeemCodes(): Promise<RedeemCode[]> {
  return authRequest('redeem-codes')
}

/** admin：查看/修改注册邀请码 */
export function getInviteCode(): Promise<{ code: string }> {
  return authRequest('invite-code')
}

export function updateInviteCode(code: string): Promise<{ code: string }> {
  return authRequest('invite-code', { method: 'POST', body: { code } })
}

export interface DownloadTask {
  id: number
  songId: number
  songName: string
  artist: string
  level: string
  status: 'downloading' | 'ready' | 'failed'
  received: number
  total: number
  progress: number
  source: string | null
  fileName: string | null
  contentType: string | null
  error: string | null
  createdAt: number
  completedAt: number | null
  ready: boolean
}

export interface CreateDownloadTaskResult {
  task: DownloadTask
  points: number
  message: string
}

/** 创建后台下载任务（服务端抓文件，完成后去下载管理取） */
export function createDownloadTask(input: {
  songId: number
  level: string
  songName?: string
  artist?: string
}): Promise<CreateDownloadTaskResult> {
  return authRequest('downloads', { method: 'POST', body: input })
}

export function getDownloadTasks(): Promise<DownloadTask[]> {
  return authRequest('downloads')
}

export function downloadTaskFileUrl(id: number): string {
  return `${API_BASE}/auth/downloads/${id}/file`
}

export function deleteDownloadTask(id: number): Promise<{ ok: boolean }> {
  return authRequest(`downloads/${id}`, { method: 'DELETE' as 'POST' })
}

/** 下载歌曲（兼容旧接口：直接返回直链，前端下载管理器不使用） */
export function downloadSong(
  songId: number,
  level: string,
): Promise<{ url: string; points: number; cost: number; source?: string }> {
  return authRequest('points/download', { method: 'POST', body: { songId, level } })
}

/** admin：重置用户密码 */
export function adminResetPassword(
  id: number,
  newPassword: string,
): Promise<{ ok: boolean }> {
  return authRequest(`users/${id}/reset-password`, { method: 'POST', body: { newPassword } })
}

/* ---------- 平台公告 ---------- */

export function getAnnouncements(): Promise<Announcement[]> {
  return authRequest<Announcement[]>('announcements')
}

export function getAdminAnnouncements(): Promise<Announcement[]> {
  return authRequest<Announcement[]>('announcements/admin')
}

export function createAnnouncement(input: {
  title: string
  content: string
  level?: Announcement['level']
  status?: 'draft' | 'published'
  expiresAt?: number | null
}): Promise<Announcement> {
  return authRequest('announcements', { method: 'POST', body: input })
}

export function updateAnnouncement(
  id: number,
  input: Partial<{
    title: string
    content: string
    level: Announcement['level']
    status: Announcement['status']
    expiresAt: number | null
  }>,
): Promise<Announcement> {
  return authRequest(`announcements/${id}`, { method: 'POST', body: input })
}

export function deleteAnnouncement(id: number): Promise<{ ok: boolean }> {
  return authRequest(`announcements/${id}`, { method: 'DELETE' as 'POST' })
}

/** admin：审计日志 */
export function getAuditLogs(): Promise<AuditLog[]> {
  return authRequest('audit-logs')
}

/* ---------- 核心代理请求（转发 api-enhanced） ---------- */

async function ncmRequest<T>(
  path: string,
  params: Record<string, unknown> = {},
  version: 'v1' | 'v2' = 'v1',
): Promise<T> {
  const url = buildUrl(path, params, version)
  const now = Date.now()
  // 登录/轮询接口不缓存（qrCheck 需每次重新请求看扫码状态变化）
  const cacheable = !path.startsWith('/login/') && !(version === 'v2' && path === '/song/url/v1')
  const hit = cacheable ? cache.get(url) : undefined
  if (hit && now - hit.t < CACHE_TTL) {
    return hit.data as T
  }

  let res: Response
  try {
    res = await fetch(url, { credentials: 'include' })
  } catch {
    throw new NcmError('网络异常，请检查 API 服务是否在运行', 'NETWORK')
  }

  if (res.status === 401) {
    dispatchUnauthorized()
    throw new NcmError('未登录或会话已失效', 'AUTH')
  }
  if (version === 'v2' && !res.ok) {
    const failure = await res.json().catch(() => ({})) as { message?: string }
    throw new NcmError(failure.message || `音源请求失败（HTTP ${res.status}）`, 'HTTP')
  }
  if (res.status === 502) {
    throw new NcmError('上游 API 不可达，请稍后再试', 'NETWORK')
  }
  if (!res.ok) {
    throw new NcmError(`HTTP ${res.status}`, 'HTTP')
  }

  const data = (await res.json()) as { code?: number; message?: string } & Record<string, unknown>

  // 业务错误码分流
  if (data.code === 301) {
    dispatchRebind()
    throw new NcmError('网易云绑定已失效，请重新扫码', 'REBIND')
  }
  if (data.code === 460) {
    throw new NcmError('海外访问受限（已尝试 randomCNIP）', 'GEOBLOCK')
  }
  if (data.code === 503) {
    throw new NcmError('请求过于频繁，请稍后再试', 'RATE_LIMIT')
  }
  if (data.code === 403) {
    throw new NcmError(data.message || '请先绑定网易云账号', 'AUTH')
  }
  if (typeof data.code === 'number' && data.code !== 200) {
    // QR 轮询的 800/801/802/803 不是错误，交由调用方判断，这里不拦截
    if (![800, 801, 802, 803].includes(data.code)) {
      throw new NcmError(data.message || `API 返回异常 code=${data.code}`, 'API_ERROR')
    }
  }

  if (cacheable) cache.set(url, { t: now, data })
  return data as T
}

/* ---------- 业务接口 ---------- */

export interface Song { id: number; name: string; [k: string]: unknown }
export interface SearchResult { result?: { songs?: Song[] } }
export interface SongDetailResult { songs?: Song[] }
export interface MediaIdentity {
  catalogRef?: string
  playbackRef?: string
  lyricsRef?: string
  playbackSource?: string
  lyricsSource?: string
}
export interface AudioIntegrity {
  status: 'full' | 'preview' | 'unknown' | 'unavailable'
  reason: string
  catalogDurationMs: number
  resourceDurationMs: number
  evidence: string[]
}
export interface SongUrlResult extends MediaIdentity {
  data?: Array<{ url: string | null; [k: string]: unknown }>
  audioIntegrity?: AudioIntegrity
}
export interface LyricResult extends MediaIdentity { lrc?: { lyric?: string }; yrc?: { lyric?: string }; [k: string]: unknown }
export interface PersonalizedResult { result?: Array<{ id: number; name: string; picUrl: string }> }
export interface PlaylistSummary {
  id: number
  name: string
  coverImgUrl?: string
  picUrl?: string
  trackCount?: number
  description?: string
  creator?: { nickname?: string; userId?: number }
}
export interface UserPlaylistResult { playlist?: PlaylistSummary[]; more?: boolean }
export interface PlaylistDetailResult {
  playlist?: PlaylistSummary & { tracks?: Song[]; trackIds?: { id: number }[] }
}
export interface PlaylistTracksResult { songs?: Song[]; more?: boolean }
export interface QrKeyResult { data?: { unikey: string }; code: number }
export interface QrCreateResult { data?: { qrurl: string; qrimg: string }; code: number }
export interface QrCheckResult { code: number; bound?: boolean; message?: string }

export interface MediaSong extends MediaIdentity {
  mediaRef: string
  source: string
  sourceId: string
  legacyId?: number
  title: string
  artists: string[]
  album?: { name?: string; pictureUrl?: string }
  durationMs?: number
}
export function mediaSearch(keywords: string, source = ''): Promise<{ data: MediaSong[] }> {
  return ncmRequest('/search', { keywords, source: source || undefined, type: 1, limit: 30 }, 'v2')
}
export function mediaUrl(mediaRef: string, level = 'exhigh'): Promise<SongUrlResult> {
  return ncmRequest('/song/url/v1', { mediaRef, level }, 'v2')
}
export function mediaDetail(mediaRef: string): Promise<{ data: MediaSong[] }> {
  return ncmRequest('/song/detail', { mediaRef }, 'v2')
}
export function mediaLyrics(mediaRef: string): Promise<LyricResult> {
  return ncmRequest('/lyric/new', { mediaRef }, 'v2')
}

export function search(keywords: string, type = 1, limit = 30): Promise<SearchResult> {
  return ncmRequest<SearchResult>('/search', { keywords, type, limit })
}

export function songDetail(ids: string | number): Promise<SongDetailResult> {
  return ncmRequest<SongDetailResult>('/song/detail', { ids })
}

export function songUrlV1(id: number | string, level = 'exhigh'): Promise<SongUrlResult> {
  return ncmRequest<SongUrlResult>('/song/url/v1', { id, level })
}

export function songUrlMatch(id: number | string, source = 'qq'): Promise<SongUrlResult> {
  return ncmRequest<SongUrlResult>('/song/url/match', { id, source })
}

export function lyricNew(id: number | string): Promise<LyricResult> {
  return ncmRequest<LyricResult>('/lyric/new', { id })
}

export function personalized(limit = 30): Promise<PersonalizedResult> {
  return ncmRequest<PersonalizedResult>('/personalized', { limit })
}

export function userPlaylist(
  uid: number | string,
  limit = 30,
  offset = 0,
): Promise<UserPlaylistResult> {
  return ncmRequest<UserPlaylistResult>('/user/playlist', { uid, limit, offset })
}

export function playlistDetail(id: number | string): Promise<PlaylistDetailResult> {
  return ncmRequest<PlaylistDetailResult>('/playlist/detail', { id })
}

export function playlistTrackAll(
  id: number | string,
  limit = 1000,
  offset = 0,
): Promise<PlaylistTracksResult> {
  return ncmRequest<PlaylistTracksResult>('/playlist/track/all', { id, limit, offset })
}

export function qrKey(): Promise<QrKeyResult> {
  return ncmRequest<QrKeyResult>('/login/qr/key')
}

export function qrCreate(key: string, qrimg = true): Promise<QrCreateResult> {
  return ncmRequest<QrCreateResult>('/login/qr/create', { key, qrimg })
}

export function qrCheck(key: string): Promise<QrCheckResult> {
  // timestamp 破 api-enhanced 的 URL 缓存：相同 URL 2 分钟内只请求一次，
  // 不加时间戳轮询会一直命中「801 等待扫码」的缓存，扫码后页面无法自动前进。
  return ncmRequest<QrCheckResult>('/login/qr/check', { key, timestamp: Date.now() })
}

/* ---------- 私人FM / 每日推荐 / 红心 ---------- */

export function personalFm(fresh = false): Promise<{ data?: Song[]; code?: number }> {
  // 换一批必须带 timestamp 破 2 分钟缓存，否则同 URL 一直返回同一批
  return ncmRequest('/personal_fm', fresh ? { timestamp: Date.now() } : {})
}

export function fmTrash(id: number | string): Promise<{ code?: number }> {
  return ncmRequest('/fm_trash', { id })
}

export function recommendSongs(limit = 50): Promise<{ data?: { dailySongs?: Song[] }; code?: number }> {
  return ncmRequest('/recommend/songs', { limit })
}

export function recommendResource(limit = 30): Promise<{ recommend?: unknown[]; code?: number }> {
  return ncmRequest('/recommend/resource', { limit })
}

export function likeSong(
  id: number | string,
  like: boolean,
): Promise<{ code?: number }> {
  return ncmRequest('/like', { id, like })
}

export function likedList(uid: number | string): Promise<{ ids?: number[]; code?: number }> {
  return ncmRequest('/likelist', { uid })
}

export function loginStatus(): Promise<{ data?: { profile?: { userId?: number; avatarUrl?: string } } }> {
  return ncmRequest('/login/status')
}
