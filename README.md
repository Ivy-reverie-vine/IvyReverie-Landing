# IvyReverie · DreamMusic

Vite + React + TS 单页站：Landing `/` + DreamMusic 播放器 `/dreammusic`。
DreamMusic 通过同仓 Express 中间层（`server/`）鉴权转发到
NeteaseCloudMusicApiEnhanced（api-enhanced），对外提供 `/dreammusic/api/v1/*` API。

## 本地运行

```bash
npm install
npm run dev:all   # 中间层(3001) + 前端(5173) 一条命令同时启动
```

也可以分开跑（两个终端）：

```bash
npm run server   # 中间层 @ http://localhost:3001（转发到 localhost:3000 的 api-enhanced）
npm run dev      # 前端 @ http://localhost:5173
```

首次使用：注册（需要邀请码，默认 `dreammusic`，可用环境变量 `REGISTER_CODE` 修改）→
登录 → 扫码绑定自己的网易云账号 → 进入播放器。

## 文档

- `docs/API-DreamMusic.md` — 本平台对外 API 文档（登录、API Key、白名单转发、错误码、curl/Node 示例）
- `docs/API-DreamMusic-HarmonyOS.md` — 鸿蒙 DreamMusic App 标准接入顺序、鉴权、绑定、错误处理与调用建议
- `docs/media-ref-v2.md` — 版本化 `mediaRef` 搜索、详情、播放和歌词契约
- `docs/music-source-operations.md` — 来源灰度、熔断、指标、管理员回滚与生产闸门
- `docs/TODO.md` — 待办清单（私人FM/每日推荐/红心/队列拖拽/梦点规则/用户操作/公告等）
- `docs/music-download-proxy-notes.md` — 音乐获取与下游返回注意事项（下载管理/代理/安全/版权）
- `API文档.md` — 上游 NeteaseCloudMusicApiEnhanced 接口参考

## 中间层环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3001` | 中间层端口 |
| `UPSTREAM` | `http://localhost:3000` | api-enhanced 上游 |
| `REGISTER_CODE` | `dreammusic` | 注册邀请码 |
| `API_ALLOWED_PATHS` | 默认白名单 | 额外放行端点（逗号分隔） |
| `DATA_DIR` | `data` | SQLite 数据目录 |
| `COOKIE_SECURE` | `false` | https 生产环境设为 `true` |
| `ADMIN_USERNAMES` | 首个注册用户 | 追加管理员（逗号分隔） |
| `API_ENHANCED_SOURCE_*` | 见 `server/config.js` | api-enhanced 来源开关、超时、并发和熔断参数 |
| `METING_SOURCE_*` | 默认关闭 | Meting sidecar 来源开关、平台、并发和熔断参数 |
| `AUDIUS_SOURCE_*` | 默认关闭 | Audius 来源开关、服务端凭据、并发和熔断参数 |
| `MEDIA_PROXY_*` | 默认关闭 | AVPlayer 直链兼容代理参数 |

## 测试与构建

```bash
npm test          # vitest（当前 180 个用例）
npm run build     # tsc + vite build → dist/
```

多来源管理员控制面（需要管理员会话或 API Key）：

```text
GET  /dreammusic/api/v1/auth/music-sources
POST /dreammusic/api/v1/auth/music-sources/:sourceId
     {"action":"enable"|"disable"|"reset-circuit"}
     {"action":"priority","priority":20}
```

## Docker

最终形态为 docker-compose 双服务：`dreammusic`（本仓库，Express 静态托管 +
API 中间层，挂卷持久化 SQLite）+ `api-enhanced`（官方镜像，仅内网可达）。

```bash
docker compose up -d --build
# 访问 http://localhost:3001
```

- `dreammusic` 服务对外暴露 `3001`；SQLite 数据保存在 `dreammusic-data` 卷。
- `api-enhanced` 只在 compose 内网可达，公网请求由中间层鉴权后转发。
- 生产走 HTTPS 时设置 `COOKIE_SECURE=true`（并用反代终止 TLS）。
- 首个注册用户自动成为管理员；可用 `ADMIN_USERNAMES` 追加管理员。
