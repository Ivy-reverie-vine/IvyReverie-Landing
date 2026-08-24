# DreamMusic 中间层 API — 鸿蒙下游接入规范

> 面向：鸿蒙 `DreamMusic` App、受控服务端 Agent 和其它下游客户端。  
> 本文以 NightDream 当前源码为准，重点说明“如何正确接入”和“标准使用顺序”。  
> api-enhanced 不应直接暴露公网；下游只访问 NightDream。

## 1. 架构与职责

```text
鸿蒙 DreamMusic App
        │
        │  DreamMusic 账户鉴权
        ▼
NightDream 中间层（公网入口）
  - 会话/API Key 校验
  - 用户封禁校验
  - 网易云绑定校验
  - 精确白名单
  - IP 限流
  - 注入服务端网易云 Cookie
        │
        ▼
api-enhanced（内网）
```

下游客户端永远不要：

- 直接请求 api-enhanced；
- 在请求参数或日志中携带网易云 Cookie；
- 把网易云 Cookie 保存到鸿蒙 App；
- 绕过 NightDream 直接拼接上游域名。

## 2. Base URL

NightDream API 前缀固定为：

```text
/dreammusic/api/v1
```

示例：

```text
https://nd.ivyreverie.dpdns.org/dreammusic/api/v1
```

开发环境：

```text
http://localhost:3001/dreammusic/api/v1
```

鸿蒙 App 应将服务器根地址作为可配置项，代码中再拼接 `/dreammusic/api/v1`。不要把 `/auth` 或上游接口路径写死在服务器配置中。

来源中立音乐能力使用独立的 v2 前缀：`/dreammusic/api/v2`。v2 的 `search` 返回版本化 `mediaRef`；`song/detail`、`song/url/v1` 和 `lyric/new` 必须回传同一 `mediaRef`。v1 保留给现有网易云兼容接口和账户能力；客户端不得自行拼接来源 ID 或上游 URL。

## 3. 推荐认证流程

### 3.1 注册

```http
POST /auth/register
Content-Type: application/json
```

请求：

```json
{
  "username": "app_user",
  "password": "至少 6 位",
  "inviteCode": "由站长提供"
}
```

成功：

```json
{
  "code": 200,
  "data": {
    "username": "app_user"
  }
}
```

注册成功后再执行登录。用户名只能使用 3-32 位字母、数字、下划线或短横线。

### 3.2 登录并保存会话

```http
POST /auth/login
Content-Type: application/json
```

请求：

```json
{
  "username": "app_user",
  "password": "至少 6 位"
}
```

成功响应包含：

```text
Set-Cookie: dm_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800
```

鸿蒙 App 应从响应头保存 `dm_session` 的 `name=value` 部分。这个 Cookie 只用于账户接口和获取/轮换 API Key。

### 3.3 获取 API Key

```http
GET /auth/api-key
Cookie: dm_session=<token>
```

成功：

```json
{
  "code": 200,
  "data": {
    "apiKey": "<key>"
  }
}
```

后续标准调用方式：

```http
X-API-Key: <key>
```

推荐在安全的鸿蒙本地存储中保存 API Key，并避免在日志、崩溃报告和 UI 中打印。API Key 轮换后旧 Key 立即失效：

```http
POST /auth/api-key/rotate
X-API-Key: <old-key>
```

### 3.4 获取当前账户和绑定状态

```http
GET /auth/me
X-API-Key: <key>
```

关键字段：

```json
{
  "code": 200,
  "data": {
    "id": 1,
    "username": "app_user",
    "status": "active",
    "bound": true,
    "bindInvalid": false,
    "neteaseUid": "123456",
    "dreamPoints": 10,
    "messageToday": 0
  }
}
```

客户端状态建议：

| 条件 | 客户端行为 |
|---|---|
| `bound=true` 且 `bindInvalid=false` | 允许请求网易云转发接口 |
| `bound=false` 且 `bindInvalid=false` | 进入 QR 绑定流程 |
| `bindInvalid=true` 或转发返回业务码 `301` | 清理本地绑定状态，重新 QR 绑定 |
| `status=banned` | 停止请求并提示联系管理员 |

## 4. QR 绑定流程

QR 接口是转发类接口，但不要求已有网易云 Cookie；仍需要 DreamMusic 会话或 API Key。

### 4.1 获取二维码 Key

```http
GET /login/qr/key
X-API-Key: <key>
```

成功字段：

```json
{
  "code": 200,
  "data": {
    "unikey": "<unikey>"
  }
}
```

### 4.2 生成二维码

```http
GET /login/qr/create?key=<unikey>&qrimg=true
X-API-Key: <key>
```

成功字段：

```json
{
  "code": 200,
  "data": {
    "qrurl": "<url>",
    "qrimg": "data:image/png;base64,..."
  }
}
```

### 4.3 轮询扫码状态

```http
GET /login/qr/check?key=<unikey>&timestamp=<毫秒时间戳>
X-API-Key: <key>
```

轮询间隔至少 1.5 秒：

| code | 含义 | 行为 |
|---:|---|---|
| `800` | 二维码过期 | 重新获取 Key 和二维码 |
| `801` | 等待扫码 | 继续轮询 |
| `802` | 已扫码，等待确认 | 继续轮询 |
| `803` | 绑定成功 | 停止轮询，再请求 `/auth/me` |

`803` 成功后，NightDream 会把网易云 Cookie 保存在服务端，不会回传给 App。

## 5. 转发接口的统一请求规则

所有转发接口使用：

```http
X-API-Key: <key>
```

推荐为 GET 请求附加：

```text
randomCNIP=true
```

不要附加：

```text
cookie=<网易云 Cookie>
```

NightDream 会根据 API Key 找到当前 DreamMusic 用户，并自动注入该用户服务端保存的网易云 Cookie。

转发接口成功时通常直接返回 api-enhanced 的原始 JSON。例如：

```json
{
  "code": 200,
  "result": {
    "songs": []
  }
}
```

不要假设所有转发接口都有 `data` 字段。

## 6. 当前默认白名单

以下是 NightDream 当前源码默认开放的精确路径：

### 播放基础

| 路径 | 用途 |
|---|---|
| `search` | 搜索歌曲 |
| `song/detail` | 批量歌曲详情、封面和歌手信息 |
| `song/url/v1` | 获取播放链接 |
| `song/url/match` | 无版权时的换源 |
| `lyric/new` | 获取歌词，优先 yrc、退化 lrc |

### v2 来源中立播放

| 路径 | 用途 |
|---|---|
| `v2/search` | 搜索并返回 `mediaRef`、标题、艺人、专辑和时长 |
| `v2/song/detail?mediaRef=...` | 按单一来源引用获取详情/封面 |
| `v2/song/url/v1?mediaRef=...` | 按单一来源引用获取短时播放链接 |
| `v2/lyric/new?mediaRef=...` | 按单一来源引用获取歌词 |

除搜索外，v2 请求缺少 `mediaRef` 返回 400；来源未启用或不具备能力时返回 502。非网易来源当前只用于瞬态在线播放，不进入现有网易云数字 ID 下载链路。

### 个人音乐库

| 路径 | 用途 |
|---|---|
| `user/playlist` | 当前网易云用户创建和收藏的歌单 |
| `playlist/detail` | 歌单名称、封面、歌曲计数和 ID |
| `playlist/track/all` | 歌单歌曲详情，支持 `limit`/`offset` |
| `likelist` | 当前用户喜欢歌曲 ID 列表 |
| `like` | 既有红心/取消红心操作 |
| `login/status` | 获取网易云 UID 和资料回填 |

### 推荐和账户绑定

| 路径 | 用途 |
|---|---|
| `personalized` | 推荐歌单 |
| `recommend/songs` | 每日推荐歌曲 |
| `recommend/resource` | 每日推荐资源 |
| `personal_fm` | 私人 FM |
| `fm_trash` | 私人 FM 不喜欢 |
| `login/qr/key` | QR Key |
| `login/qr/create` | QR 图片 |
| `login/qr/check` | QR 状态 |

## 7. 鸿蒙 App 推荐数据流

### 7.1 搜索播放

```text
search
  → song/url/v1
  → lyric/new
  → url 为空时 song/url/match
  → 播放
```

多来源 v2 数据流：

```text
v2/search
  → 保存 mediaRef
  → v2/song/url/v1?mediaRef=...
  → v2/song/detail?mediaRef=...（封面兜底）
  → v2/lyric/new?mediaRef=...
  → 播放
```

### 7.2 我的歌单

```text
user/playlist?uid=<neteaseUid>&limit=30&offset=0
  → 用户点击歌单
  → playlist/detail?id=<playlistId>
  → playlist/track/all?id=<playlistId>&limit=1000&offset=0
  → 播放或加入队列
```

超过分页上限时继续请求下一页，不要只读取第一页。

### 7.3 我喜欢

```text
likelist?uid=<neteaseUid>
  → 取得 ids[]
  → 每 500 个 ID 调用一次 song/detail?ids=id1,id2,...
  → 合并歌曲详情
  → 播放或加入队列
```

不要把喜欢列表固定截断到 999 首。

## 8. 自有账户接口

以下接口也由 NightDream 自己实现，成功响应统一为 `{code,data}`：

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/auth/register` | 注册 |
| POST | `/auth/login` | 登录并建立 Cookie |
| POST | `/auth/logout` | 销毁当前会话 |
| GET | `/auth/me` | 当前账户和绑定状态 |
| GET | `/auth/api-key` | 获取当前 API Key |
| POST | `/auth/api-key/rotate` | 轮换 API Key |
| GET/POST | `/auth/profile` | 读取/修改签名 |
| POST | `/auth/password` | 修改密码，成功后会话失效 |
| POST | `/auth/avatar` | 上传头像 |
| GET | `/auth/sessions` | 在线会话 |
| POST | `/auth/sessions/revoke` | 踢出会话 |
| POST | `/auth/checkin` | 每日签到 |
| GET | `/auth/points/log` | 实际路径为 `GET /auth/points/log` |
| POST | `/auth/message` | 发送消息，扣梦点 |
| GET | `/auth/announcements` | 公开公告 |
| POST | `/auth/redeem` | 兑换码兑换梦点 |
| POST | `/auth/downloads` | 创建下载任务 |
| GET | `/auth/downloads` | 下载任务列表 |
| GET | `/auth/downloads/:id/file` | 获取已完成文件 |
| DELETE | `/auth/downloads/:id` | 删除下载任务 |

> 注意：表格中的签到/流水方法以代码为准：签到是 `POST`，流水是 `GET`。下游实现应优先参考本文件中的明确方法定义，而不是仅根据名称推断。

管理员专用接口包括公告管理、用户管理、梦点调整、重置密码和审计日志；鸿蒙普通用户不应调用这些接口。

## 9. 错误处理标准

### NightDream HTTP 错误

| HTTP | 含义 | 标准处理 |
|---:|---|---|
| `400` | 请求参数或业务校验失败 | 展示服务端 `message`，不要盲目重试 |
| `401` | Cookie/API Key 无效或缺失 | 重新登录并获取 API Key |
| `402` | 梦点不足 | 提示签到、兑换或联系管理员 |
| `403` | 未绑定、绑定失效前置检查或账户封禁 | 检查 `/auth/me`；未绑定进入 QR，封禁停止请求 |
| `404` | 路径不在白名单、资源不存在或下载任务不存在 | 检查路径和资源 ID；不要自动重复请求 |
| `409` | 注册用户名冲突 | 更换用户名 |
| `429` | NightDream 限流或登录失败锁定 | 尊重 `Retry-After`；采用指数退避 |
| `502` | api-enhanced 不可达 | 显示离线/稍后重试 |

### 转发业务码

| HTTP/业务码 | 含义 | 标准处理 |
|---|---|---|
| HTTP `200` + `code=301` | 网易云绑定失效 | 清理本地绑定标记，重新 QR 绑定 |
| `code=460` | 上游风控 | 等待、降低频率或更换网络环境 |
| `code=503` | 上游过频 | 至少等待缓存窗口，避免立即循环重试 |

不要把 301 当成 DreamMusic 账户退出；它只表示网易云绑定失效。

## 10. 限频、缓存与重试建议

- API Key 调用方自行缓存不变查询，建议至少 2 分钟。
- 搜索输入做 300-500ms 防抖。
- QR 轮询间隔不少于 1.5 秒。
- 分页请求串行或低并发执行，避免同时请求大量歌单页。
- “我喜欢”歌曲详情按 500 个 ID 分批。
- 429/503 使用退避，不做紧密循环。
- 401 只触发一次重新登录流程，避免多个页面同时刷新 Key。
- 301 只触发一次绑定恢复流程，成功后重新调用 `/auth/me`。

## 11. 安全和存储建议

- API Key 存鸿蒙安全偏好/受保护存储，不写普通日志。
- `dm_session` 只用于登录引导；不要把网易云 Cookie 当成 App 凭证。
- 生产必须使用 HTTPS，并让服务器设置 `COOKIE_SECURE=true`。
- 不在错误日志中输出 Authorization、API Key、Cookie 或完整请求 URL。
- 服务器地址允许用户配置，但只接受 `http`/`https`，生产推荐 HTTPS。
- 下游只依赖本文件列出的白名单接口，不自行猜测 api-enhanced 其它路径。

## 12. 最小接入检查清单

- [ ] 配置 NightDream Base URL，并拼接 `/dreammusic/api/v1`
- [ ] 注册/登录成功后保存 `dm_session`
- [ ] 使用 Cookie 获取 API Key
- [ ] 后续请求统一使用 `X-API-Key`
- [ ] 调 `/auth/me` 确认账户和绑定状态
- [ ] 未绑定时完成 QR 流程
- [ ] 所有转发请求不携带网易云 Cookie
- [ ] 处理 401/403/429/502/301
- [ ] 对歌单、喜欢列表做分页/分批
- [ ] 对查询做缓存和退避
- [ ] 生产使用 HTTPS

## 13. 代码核验来源

- 中间层白名单：`server/config.js`
- 鉴权、绑定和转发：`server/proxy.js`
- 自有账户接口：`server/auth.js`
- 限流和 `Retry-After`：`server/rateLimit.js`
- 鸿蒙认证调用：`DreamMusic/entry/src/main/ets/service/network/DreamMusicAuth.ets`
- 鸿蒙网络封装：`DreamMusic/entry/src/main/ets/service/network/ApiClient.ets`
- 鸿蒙网易云转发调用：`DreamMusic/entry/src/main/ets/service/network/NetEaseApi.ets`
