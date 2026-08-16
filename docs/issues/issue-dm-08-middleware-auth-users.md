# Issue DM-08 — Express 中间层 + 账户体系 + 白名单转发

> **Triage**: `ready-for-agent`（已实现）
> **Source**: CONTEXTS-dreammusic §11 · ADR-002

## What to build

同仓 Node(Express) 中间层：静态托管 `dist/` + `/dreammusic/api/v1/*` 鉴权转发。
- SQLite 用户表（bcrypt 密码 / API key / 网易 cookie / 角色 / 封禁 / 统计字段）。
- 注册邀请码、登录会话（HttpOnly cookie）、登出、`/auth/me`、API key 查看与轮换。
- QR 绑定：`login/qr/*` 免网易 cookie，`803` 时清洗 cookie 并落库，拉 `/login/status` 存头像。
- 双通道鉴权：会话 cookie（UI）与 `X-API-Key`（外部调用）。
- 默认端点白名单 + `API_ALLOWED_PATHS` 扩展；上游 301 标记绑定失效。

## Acceptance criteria

- [x] `npm run server` 在 3001 启动，`UPSTREAM` 默认 localhost:3000
- [x] 注册（邀请码）/ 登录 / 登出 / me 可用
- [x] QR 绑定成功落库并剥离 cookie，绑定失效返回 301 提示重新扫码
- [x] UI 会话 cookie 与外部 X-API-Key 均可访问放行接口
- [x] 白名单外接口 404，未登录/无 key 401，未绑定 403
- [x] SQLite 数据目录可配置，Cookie/Hash 不通过 `/auth/*` 响应外泄
- [x] 静态托管 `dist/` 且 SPA fallback

## Blocked by

- Issue DM-01（前端 API 前缀与 Vite proxy）
