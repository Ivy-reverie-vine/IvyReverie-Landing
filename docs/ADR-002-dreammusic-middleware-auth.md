# ADR-002: DreamMusic 中间层与用户体系

- **状态**：Accepted
- **日期**：2026-08-16
- **决策者**：青藤（用户）+ grill-with-docs 会话

## 背景

DreamMusic 当前是纯前端 SPA，经 Vite dev 代理 `/api` → `localhost:3000` 直连
NeteaseCloudMusicApiEnhanced（无鉴权）。用户计划把 DreamMusic 暴露到公网（Docker 化），
但 api-enhanced 无鉴权不能暴露公网；同时希望 DreamMusic 对外提供 `/dreammusic/api/v1/*` API，
并支持"每个用户绑定自己的网易云账号"。

## 决策

1. 同仓新增 Node(Express) 中间层：静态托管 `dist/` + `/dreammusic/api/v1/*` 鉴权转发到 api-enhanced。
2. 双通道鉴权：浏览器走 HttpOnly 会话 cookie（网易 cookie 存服务端）；外部调用走 `X-API-Key`。
3. 多用户体系：SQLite 存账户（bcrypt 密码）+ 每用户绑定的网易 cookie；邀请码注册；登录后 QR 绑定。
4. 端点白名单：只放行播放器所需接口 + QR 绑定接口；`API_ALLOWED_PATHS` env 可扩展。
5. 统一 API 前缀 `/dreammusic/api/v1`（前端 `API_BASE` + Vite dev 代理 + 生产 Express 一致）。
6. 播放状态按用户持久化到 localStorage：队列 + 音质 + 模式（不含 isPlaying/进度/URL）。
7. 播放器主页背景 = 当前歌曲封面（模糊+压暗），无封面保持上一张，兜底 `img/` 默认图。
8. 移除顶部「播放示例」；UI 按鸿蒙/QQ 手机版设计语言改造（布局不变）。
9. Docker：compose 双服务（dreammusic + api-enhanced）已落地；本地调试与 Docker 部署并行支持。

## 备选方案与权衡

| 方案 | 结论 |
|---|---|
| nginx + auth_request 鉴权 | 配置式，但会话/SQLite/key 签发等自定义逻辑难做，否决 |
| 全局静态 key（前端携带） | key 可从前端包扒出，鉴权形同虚设，否决 |
| 端点全量透传 | 滥用面大（captcha 骚扰任意手机号、涉及花钱的接口），否决 |
| 单镜像捆绑 api-enhanced | 第三方上游绑死进自家镜像，升级麻烦，否决 |

## 影响

- 新增 `server/` 目录：Express、SQLite（better-sqlite3）、会话、白名单转发。
- 前端 `api.ts` 改为 `/dreammusic/api/v1`；登录页改为账户登录 + 注册 + QR 绑定；
  `PlayerContext` 恢复 localStorage 队列。
- 播放器 UI 视觉重构 + 移除「播放示例」+ 背景图接入。
