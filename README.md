# IvyReverie · DreamMusic

Vite + React + TS 单页站：Landing `/` + DreamMusic 播放器 `/dreammusic`。
DreamMusic 通过同仓 Express 中间层（`server/`）鉴权转发到
NeteaseCloudMusicApiEnhanced（api-enhanced），对外提供 `/dreammusic/api/v1/*` API。

## 本地运行

Windows 音乐获取测试：双击上一级目录的 `Start-NightDream.cmd`，默认“全部音源”，打开正式播放器 `http://127.0.0.1:5173/dreammusic`。登录后在搜索面板的“音源”选择网易云、腾讯、酷狗、酷我或 Audius；每个结果标明实际来源，搜索与播放使用同一 `mediaRef`。未绑定网易云可以点击“先使用其他音源”；网易云歌单、红心和下载仍需要网易云绑定。

停止服务：启动窗口按 Ctrl+C、输入 `q` 回车，或双击上一级 `Stop-NightDream.cmd`。后者只停止启动记录中、进程命令与本次随机标识都匹配的测试子进程。服务通过 IPC 监视启动器，启动器被强制结束时子进程也退出。端口已占用时不会复用未知配置的服务。

默认复用 `NightDream/data` 账户数据库。“全部音源”启动本地 `api-enhanced`、Meting、NightDream 和 Vite，并启用 Audius 适配器；也可单独启动一个来源。显式选择来源时不会回退至其他来源；“自动选择”按服务端优先级与可用状态调度，不是跨来源合并搜索。Meting 首次自动安装锁定版本的 `@meting/core`，然后启动本地 JSON sidecar（默认 `127.0.0.1:8000`）并自动连接 NightDream，无需 PHP、Docker 或手填接口地址。

如需使用已有的外部 sidecar、指定本地端口或填写平台凭据，复制 `music-test.env.example` 为 `music-test.env.local`，再填写相应变量。显式设置 `METING_API_URL` 时使用该外部服务，不启动本地 sidecar。Audius 凭据如需要也填入该本地文件，不在网页填写；本地配置不会被 Git 跟踪。脚本只开启本次测试进程的来源，不修改生产默认开关。

```powershell
# 项目总目录 D:\DreamMusic 下执行；也可直接双击，不需要参数
.\Start-NightDream.cmd
.\Start-NightDream.cmd --source all                 # 从正式前端切换音源
.\Start-NightDream.cmd --source audius
.\Start-NightDream.cmd --source tencent             # 自动启动本地 Meting + NightDream + 网页
.\Start-NightDream.cmd --source api-enhanced --check   # 只检查环境，不启动
```

需要 Node.js 22.13+ 和已安装的项目依赖。首次缺少依赖时按脚本提示安装。`/dreammusic` 搜索现在使用 v2；非网易曲目以来源引用进入播放队列，不调用网易数字 ID 的红心／下载接口。重新加载队列、切音质和播放链接失败重解析都保持原引用；播放链接不会写入持久化队列。`/music-test.html` 保留为接口诊断页。Meting 失败日志包含错误类别和上游 HTTP 状态，不包含凭据或完整上游 URL；真实浏览器通过不等于 HarmonyOS AVPlayer 真机通过。

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

真实多源验收（需要网络，网易云需先启动本地 `api-enhanced`）：`node scripts/verify-music-sources.mjs`。脚本使用独立临时数据库、真实鉴权和 v2 路由，逐源检查搜索、详情、歌词、封面图片字节及音频前 64 KiB；默认监听 18000/18001，不接触现有账户数据库。报告写入 `docs/evidence/music-sources-live.json`，失败退出码为 1。`--serve` 保留隔离播放器供浏览器试听，输入 `q` 或 Ctrl+C 清理；可用 `VERIFY_SOURCES`、`VERIFY_PORT`、`VERIFY_METING_PORT`、`VERIFY_REPORT` 限定复测。浏览器实际播放和真机验证需另外记录，不能由字节检查替代。

2026-10-04 验收及剩余上游问题见 [真实多源验收记录](docs/music-source-validation-2026-10-04.md)。

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
