# DreamMusic 平台 API 文档（供外部项目 Agent / 调用方使用）

> 适用对象：其它项目的 Agent、脚本、服务端程序。
> 本文描述的是 **本项目自己暴露的中间层 API**（`/dreammusic/api/v1/*`）。
> 被转发的网易云上游接口字段说明见仓库根目录 `API文档.md`。
>
> 鸿蒙 DreamMusic App 的标准接入顺序、API Key 使用、绑定流程和错误处理请优先阅读：
> [`docs/API-DreamMusic-HarmonyOS.md`](./API-DreamMusic-HarmonyOS.md)。

---

## 1. 架构与 Base URL

```
调用方
  → DreamMusic 中间层（本项目 Express，默认 :3001）
  → 鉴权（会话 Cookie 或 X-API-Key）
  → 白名单过滤
  → 自动注入该用户绑定的网易云 cookie
  → NeteaseCloudMusicApiEnhanced（内网，默认 :3000）
```

| 环境 | Base URL |
|---|---|
| 本地开发 | `http://localhost:3001/dreammusic/api/v1` |
| Docker Compose | `http://<host>:3001/dreammusic/api/v1` |
| 生产 | 按实际反代域名，例如 `https://<domain>/dreammusic/api/v1` |

所有业务响应均为 JSON。

---

## 2. 鉴权模型（重要）

平台支持两条通道，**不要混用**：

| 通道 | 凭证 | 适用方 | 说明 |
|---|---|---|---|
| 会话 Cookie | `Cookie: dm_session=<token>` | 浏览器 / 会用 cookie jar 的 Agent | HttpOnly、SameSite=Lax、7 天有效、重启中间层后失效 |
| API Key | `X-API-Key: <key>` | 服务端 Agent / 脚本 | 只对**转发类接口**生效；见 §2.3 |

### 2.1 会话 Cookie 通道（用于登录/注册/用户操作）

1. 先注册（需要邀请码，默认 `dreammusic`）。
2. 登录成功时响应头会 `Set-Cookie: dm_session=...`。
3. 之后请求 `/dreammusic/api/v1/auth/*` 必须携带该 Cookie。
4. 转发类接口可携带 Cookie **或** `X-API-Key`。

Cookie 属性：
```text
Set-Cookie: dm_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
```
生产环境设置 `COOKIE_SECURE=true` 时会额外带 `Secure`，请务必走 HTTPS。

### 2.2 推荐的外部 Agent 接入流程

```bash
BASE="http://localhost:3001/dreammusic/api/v1"

# 1) 注册账户（邀请码找站长）
curl -sS -X POST "$BASE/auth/register" \
  -H 'Content-Type: application/json' \
  -d '{"username":"agent_a","password":"请换强密码","inviteCode":"dreammusic"}'

# 2) 登录并保存 cookie
curl -sS -c /tmp/dm.cookies -X POST "$BASE/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"username":"agent_a","password":"请换强密码"}'

# 3) 用 cookie 获取自己的 API Key
curl -sS -b /tmp/dm.cookies "$BASE/auth/api-key"
# → {"code":200,"data":{"apiKey":"<64位hex>"}}

# 4) 之后只用 X-API-Key 调用转发类接口
curl -sS "$BASE/search?keywords=晴天&type=1&limit=10" \
  -H "X-API-Key: <你的key>"
```

### 2.3 X-API-Key 通道的边界

- 注册/登录/登出仍按 Cookie 语义使用；其余 `/auth/*` 自有接口（me/profile/改密/签到/公告等）**Cookie 与 X-API-Key 均可**。
- `X-API-Key` 对 `/dreammusic/api/v1/{上游路径}` 转发类接口生效。
- API Key 可通过 `POST /auth/api-key/rotate` 重置，旧 key 立即失效。
- 一个用户一个 key；key 被重置后所有使用旧 key 的调用都会 401。

---

## 3. 用户状态与绑定状态

登录/me 返回的用户对象：

```json
{
  "id": 1,
  "username": "agent_a",
  "role": "admin",
  "status": "active",
  "banReason": null,
  "bound": true,
  "bindInvalid": false,
  "avatarUrl": null,
  "signature": "",
  "playSeconds": 3600,
  "playedSongCount": 42,
  "dreamPoints": 130,
  "lastCheckinDate": "2026-08-16",
  "neteaseUid": "123456",
  "createdAt": 1786860287667
}
```

字段说明：
- `bound=true`：已绑定网易云账号，转发类接口可用。
- `bound=false` 且 `bindInvalid=false`：尚未绑定，转发类接口会返回 403「请先绑定网易云账号」。
- `bindInvalid=true`：绑定已失效，转发类接口会返回业务码 `301`，需要重新扫码。
- `status="banned"`：被封禁，会话和 API Key 都会被拒绝。
- `neteaseUid`：网易云用户 ID；绑定成功或启动后台回填后可用（红心列表需要）。

---

## 4. 绑定网易云账号（QR 流程）

大多数转发类接口要求账号已绑定。绑定由调用方驱动二维码生成，最终由**真人手机扫码确认**。

```bash
# 用会话 Cookie 或 X-API-Key 都可以调 QR 绑定三件套
# 1) 拿 key
curl -sS -H "X-API-Key: $KEY" "$BASE/login/qr/key"
# → data.unikey

# 2) 生成二维码（qrimg=true 返回 base64 PNG）
curl -sS -H "X-API-Key: $KEY" "$BASE/login/qr/create?key=<unikey>&qrimg=true"
# → data.qrimg（可能自带 data:image/png;base64, 前缀）

# 3) 轮询扫码状态，必须带 timestamp 破坏上游 2 分钟 URL 缓存
curl -sS -H "X-API-Key: $KEY" "$BASE/login/qr/check?key=<unikey>&timestamp=$(date +%s000)"
# → code=801 等待扫码 / 802 已扫待确认 / 800 过期 / 803 成功
```

- `803` 成功后，**中间层自动把网易 cookie 存入该用户数据库**，响应中不会回传 cookie。
- 轮询间隔建议 **1.5 秒以上**，不要高频打登录接口。
- 二维码过期（800）时重新走 1-2 生成新码。

---

## 5. 通用约定与错误处理

### 5.1 请求

- `GET` / `POST` 均支持。
- POST body 统一 `application/json`；转发时中间层会自动加 `timestamp` 破坏上游 POST 缓存。
- 转发类接口建议统一加 `randomCNIP=true`，规避海外 460。

### 5.2 响应结构

| 来源 | 成功 | 失败 |
|---|---|---|
| `/auth/*` 自有接口 | `{"code":200,"data": ...}` | `{"code":<HTTP状态>,"message":"..."}` |
| 转发类接口 | 透传上游 JSON，通常是 `{"code":200,...}` | 透传上游；白名单/鉴权错误由中间层返回 `{"code":...,"message":"..."}` |

### 5.3 错误码速查

| HTTP / code | 含义 | 处理建议 |
|---|---|---|
| `401` | 未登录 / 会话过期 / API Key 错误 | 重新登录或换 Key |
| `403` | 无权限；转发类常见「请先绑定网易云账号」 | 检查 `me.bound`；未绑定先走 QR 绑定 |
| `403` | 账号被封禁 | 联系管理员 |
| `402` | 梦点不足 | 下载需要 1 梦点，可签到或请管理员调整 |
| `404` | 接口不在白名单 | 用 `API_ALLOWED_PATHS` 扩展或联系管理员 |
| `429` | 触发中间层限流（默认 300 次/分钟/IP） | 按 `Retry-After` 等待；可用 `RATE_LIMIT_PER_MIN` 调整 |
| `502` | 上游 api-enhanced 不可达 | 稍后重试，检查上游服务 |
| code `301` | 网易云绑定失效 | 重新扫码绑定 |
| code `460` | 海外访问受限 | 已带 `randomCNIP=true` 仍失败则需换 IP/代理 |
| code `503` | 上游请求过频繁 | 降低频率，等待至少 2 分钟 |

### 5.4 限频与缓存

- 本项目中间层有内存滑动窗口限流，默认 **300 次/分钟/IP**（环境变量 `RATE_LIMIT_PER_MIN`）。
- 登录连续失败 5 次会锁定 15 分钟。
- 上游 api-enhanced **同 URL 2 分钟内只请求一次**。
- 调用方必须自行缓存/防抖；搜索、歌单列表建议缓存 ≥2 分钟。
- QR 轮询 1.5 秒一次；登录接口不要频繁调用。

### 5.5 梦点扣款与下载解灰

当前唯一扣款：**下载歌曲扣 1 梦点**。
下载接口为 `POST /auth/points/download`，服务端先取直链、成功后才扣款；余额不足返回 HTTP 402。

推荐使用下载管理 `/auth/downloads`，避免浏览器直接跳转上游链接。详细注意事项见 `docs/music-download-proxy-notes.md`。

下载取链顺序：
1. `/song/download/url/v1`（原下载接口）
2. `/song/url/v1?unblock=true`（原曲 unblock）
3. `/song/url/match?source=qq`
4. `/song/url/match?source=kugou`
5. `/song/url/match?source=kuwo`
6. `/song/url/match?source=migu`

任一来源返回有效直链即使用该链接下载；全部失败才返回 404。
规则详见 `docs/dream-points-rules.md`。

---

## 6. `/auth/*` 账户接口

基础路径：`/dreammusic/api/v1/auth`

| 方法 | 路径 | 鉴权 | 请求 | 成功 data | 说明 |
|---|---|---|---|---|---|
| POST | `/register` | 无 | `{username,password,inviteCode}` | `{username}` | 用户名 3-32 位字母/数字/下划线/短横线；密码 ≥6 位；邀请码见站长 |
| POST | `/login` | 无 | `{username,password}` | 用户对象 | 成功时 `Set-Cookie` |
| POST | `/logout` | 无 | 无 | `{ok:true}` | 销毁当前会话 |
| GET | `/me` | 会话/Key | 无 | 用户对象 | 当前用户与绑定状态 |
| GET | `/api-key` | 会话/Key | 无 | `{apiKey}` | 查看自己的 API Key |
| POST | `/api-key/rotate` | 会话/Key | 无 | `{apiKey}` | 重置 key，旧 key 立即失效 |
| GET | `/profile` | 会话/Key | 无 | 用户对象 | 用户资料/统计 |
| POST | `/profile` | 会话/Key | `{signature}` | 用户对象 | 改签名，≤60 字 |
| POST | `/password` | 会话/Key | `{oldPassword,newPassword}` | `{ok:true}` | 修改密码，成功后所有会话失效 |
| POST | `/avatar` | 会话/Key | `{avatarBase64}` | 用户对象 | 上传头像（jpg/png/webp ≤2MB） |
| GET | `/avatar-file/:file` | 会话/Key | 无 | 图片文件 | 读取本地头像 |
| GET | `/sessions` | 会话/Key | 无 | 会话数组 | 当前账号在线会话 |
| POST | `/sessions/revoke` | 会话/Key | `{token}` | `{ok:true}` | 指定会话下线 |
| GET | `/points/log` | 会话/Key | 无 | 流水数组 | 梦点流水（最近 50 条） |
| POST | `/downloads` | 会话/Key | `{songId,level,songName?,artist?}` | `{task,points,message}` | 创建后台下载任务，扣 1 梦点，失败自动退款 |
| GET | `/downloads` | 会话/Key | 无 | 下载任务数组 | 任务进度/状态（1.5s 轮询） |
| GET | `/downloads/:id/file` | 会话/Key | 无 | 音频文件 | 任务 ready 后获取文件（仅本人） |
| DELETE | `/downloads/:id` | 会话/Key | 无 | `{ok:true}` | 删除任务与缓存文件 |
| POST | `/points/download` | 会话/Key | `{songId,level}` | `{url,points,cost,source}` | 兼容旧接口：直接返回直链；新前端请用 `/downloads` |
| GET | `/invite-code` | 会话/Key + admin | 无 | `{code}` | 查看当前注册邀请码 |
| POST | `/invite-code` | 会话/Key + admin | `{code}` | `{code}` | 修改注册邀请码（4-64 位，立即生效） |
| POST | `/redeem` | 会话/Key | `{code}` | `{points,redeemedPoints,code}` | 兑换码兑换梦点，一码一次 |
| POST | `/redeem-codes/generate` | 会话/Key + admin | `{points,count?,note?}` | `{codes}` | 批量生成兑换码（1-100 个） |
| GET | `/redeem-codes` | 会话/Key + admin | 无 | 兑换码数组 | 查看兑换码及使用状态 |
| GET | `/announcements` | 公开 | 无 | 公告数组 | 已发布未过期的公告 |
| GET | `/announcements/admin` | 会话/Key + admin | 无 | 公告数组 | 全部公告 |
| POST | `/announcements` | 会话/Key + admin | `{title,content?,level?,status?}` | 公告 | 新建公告 |
| POST | `/announcements/:id` | 会话/Key + admin | 任意字段 | 公告 | 编辑/发布/下线 |
| DELETE | `/announcements/:id` | 会话/Key + admin | 无 | `{ok:true}` | 归档删除公告 |
| POST | `/stats` | 会话/Key | `{seconds, songId?}` | `{ok:true}` | 播放时长上报，服务端单次封顶 120s |
| POST | `/checkin` | 会话/Key | 无 | `{points,alreadyChecked}` | 每日签到 +10 梦点，幂等 |
| POST | `/message` | 会话/Key | `{title,content}` | `{points,used,remaining,dailyLimit,result,detail}` | 发送消息，每日最多 3 次，每次扣 1 梦点 |
| GET | `/users` | 会话/Key + admin | 无 | 用户对象数组 | 管理员用户列表 |
| POST | `/users/:id` | 会话/Key + admin | `{action,reason?}` | `{ok:true}` | 管理操作，见下 |
| POST | `/users/:id/points` | 会话/Key + admin | `{delta,note}` | `{points}` | 增减梦点（记账 + 审计，管理员也可给自己调整） |
| POST | `/users/:id/reset-password` | 会话/Key + admin | `{newPassword}` | `{ok:true}` | 重置用户密码 |
| GET | `/audit-logs` | 会话/Key + admin | 无 | 日志数组 | 最近 100 条操作审计 |

公告内容支持 Markdown（GFM），前端会渲染为 HTML 并做 XSS 过滤。

`/users/:id` 的 `action`：

| action | 说明 |
|---|---|
| `ban` | 封禁，可带 `reason`；被禁者会话/API 立即失效 |
| `unban` | 解封 |
| `set-admin` | 设为管理员 |
| `set-user` | 取消管理员 |

> 管理员不能修改自己。

---

## 7. 转发类接口（网易云能力）

基础路径：`/dreammusic/api/v1`

调用格式：
```text
GET  /dreammusic/api/v1/<upstream_path>?<query>
POST /dreammusic/api/v1/<upstream_path>?<query>   + JSON body
```

鉴权：`Cookie: dm_session=...` 或 `X-API-Key: ...`。
转发时中间层自动注入当前用户绑定的网易云 cookie，调用方**不要**自己传 `cookie` 参数。

### 7.1 默认白名单

| 接口路径 | 说明 |
|---|---|
| `search` | 搜索歌曲 |
| `song/detail` | 歌曲详情（补封面等） |
| `song/url/v1` | 获取播放链接 |
| `song/url/match` | 无版权解灰换源 |
| `lyric/new` | 歌词（yrc/lrc） |
| `personalized` | 推荐歌单 |
| `user/playlist` | 当前用户创建和收藏的歌单 |
| `playlist/detail` | 歌单元数据 |
| `playlist/track/all` | 歌单全部歌曲 |
| `personal_fm` | 私人 FM |
| `fm_trash` | 私人 FM 垃圾桶 |
| `recommend/songs` | 每日推荐歌曲 |
| `recommend/resource` | 每日推荐歌单 |
| `like` | 红心/取消红心 |
| `likelist` | 我喜欢的歌曲 ID 列表 |
| `login/status` | 当前网易云账号信息（回填 uid/头像） |
| `login/qr/key` | QR 绑定：拿 key |
| `login/qr/create` | QR 绑定：生成二维码 |
| `login/qr/check` | QR 绑定：轮询结果 |

### 7.2 来源中立 v2 音乐接口

v2 不改变 v1 的网易云兼容响应。它只对登录账户开放来源中立的音乐能力：

| 接口路径 | 说明 |
|---|---|
| `/dreammusic/api/v2/search` | 搜索，返回标准化 `data[]` 和版本化 `mediaRef`；`aggregate=true` 启用三平台并发搜索与逐来源分页，见 [聚合契约](media-ref-v2.md#t03三平台聚合搜索2026-10-05) |
| `/dreammusic/api/v2/song/detail?mediaRef=...` | 按 `mediaRef` 获取单一来源详情/封面 |
| `/dreammusic/api/v2/song/url/v1?mediaRef=...` | 按 `mediaRef` 获取短时播放链接 |
| `/dreammusic/api/v2/lyric/new?mediaRef=...` | 按 `mediaRef` 获取歌词 |

除搜索外，v2 请求必须携带 `mediaRef`；v2 音乐搜索/播放不要求网易云绑定，但仍要求 DreamMusic 登录。非网易来源保持瞬态在线播放，不自动进入 `/auth/downloads` 或本地入库。

- 白名单是**精确路径**，不是前缀。`search/hot` 默认不放行。
- 私人FM 的 `timestamp` 参数可穿透上游 2 分钟缓存；红心列表需要用户对象里的 `neteaseUid`。
- 扩展方式：启动中间层时设置环境变量
  ```bash
  API_ALLOWED_PATHS="search/hot,recommend/songs,like,likelist,personal_fm"
  ```

### 7.3 常用请求示例

```bash
BASE="http://localhost:3001/dreammusic/api/v1"
KEY="<你的 X-API-Key>"

# 搜索
curl -sS "$BASE/search?keywords=周杰伦&type=1&limit=30&randomCNIP=true" -H "X-API-Key: $KEY"

# 歌曲详情
curl -sS "$BASE/song/detail?ids=186016&randomCNIP=true" -H "X-API-Key: $KEY"

# 播放链接
curl -sS "$BASE/song/url/v1?id=186016&level=exhigh&randomCNIP=true" -H "X-API-Key: $KEY"

# 歌词
curl -sS "$BASE/lyric/new?id=186016&randomCNIP=true" -H "X-API-Key: $KEY"

# 推荐歌单 / 歌单全部歌曲
curl -sS "$BASE/personalized?limit=30&randomCNIP=true" -H "X-API-Key: $KEY"
curl -sS "$BASE/playlist/track/all?id=3778678&limit=1000&offset=0&randomCNIP=true" -H "X-API-Key: $KEY"
```

### 7.4 上游返回字段

以 `/search` 为例：
```json
{
  "code": 200,
  "result": {
    "songs": [
      { "id": 186016, "name": "晴天", "artists": [{"name":"周杰伦"}], "album": {"name":"..."} }
    ]
  }
}
```
其余接口的字段与错误码见仓库根目录 `API文档.md`（网易云 API Enhanced 官方文档）。

---

## 8. 一个完整的最小调用脚本（Node.js）

```js
const BASE = 'http://localhost:3001/dreammusic/api/v1'

async function json(res) {
  const body = await res.json()
  if (!res.ok || body.code !== 200) {
    throw new Error(`${res.status} ${body.message || JSON.stringify(body)}`)
  }
  return body.data
}

// 1) 登录（非浏览器 Agent 必须开启 cookie 持久化；此处展示登录接口本身）
const loginRes = await fetch(`${BASE}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'agent_a', password: '请换强密码' }),
})
const setCookie = loginRes.headers.get('set-cookie') // dm_session=...
const sessionCookie = setCookie.split(';')[0]

// 2) 获取 API Key
const keyRes = await fetch(`${BASE}/auth/api-key`, {
  headers: { Cookie: sessionCookie },
})
const { apiKey } = await json(keyRes)

// 3) 用 Key 调用搜索
const searchRes = await fetch(`${BASE}/search?keywords=${encodeURIComponent('晴天')}&type=1&limit=5&randomCNIP=true`, {
  headers: { 'X-API-Key': apiKey },
})
console.log(await searchRes.json())
```

> 生产代码请使用真正的 cookie jar（如 axios `withCredentials`、undici `CookieAgent`、Python requests.Session），不要手动解析 Set-Cookie。

---

## 9. 安全与部署注意事项

- 公网部署必须走 HTTPS，并设置 `COOKIE_SECURE=true`。
- api-enhanced 只能内网可达；公网只暴露 DreamMusic 中间层。
- SQLite 数据卷保存账户与网易 cookie，注意备份与访问权限。
- 注册邀请码默认 `dreammusic`，上线前务必通过 `REGISTER_CODE` 修改。
- `ADMIN_USERNAMES` 可追加管理员；首个注册用户自动管理员。
- 外部调用方丢失 API Key 时，需要登录后 `POST /auth/api-key/rotate` 重置。
- 目前平台尚无账号找回、改密码、改头像、平台公告、管理员加梦点等能力；这些已列入 `docs/TODO.md`。
