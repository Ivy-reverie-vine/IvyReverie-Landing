# CONTEXTS-dreammusic.md — DreamMusic 网页播放器

> 单一事实源（本功能）。基于 `API文档.md` + 三轮需求拷问决策固化。
> **当本文件与口头描述冲突时，以本文件为准。**
> 延续 `docs/CONTEXTS.md`（Landing）的 IvyReverie 深空梦幻调性。

---

## 1. 产品定位

**DreamMusic** 是 IvyReverie 站点下的个人网页音乐播放器，挂在路由 `/dreammusic`。
- **个人个性化使用**，非公开产品。
- 音源：自建的 **NeteaseCloudMusicApiEnhanced** API（`API文档.md`，默认 `localhost:3000`）。
- UI 风格**延续** Landing 的深空 + 粉色手写 + 粒子梦幻调性。
- 排版参考**鸿蒙手机 QQ 音乐**，但桌面网页形态，可多列并存。

一句话：**深空梦幻调性的个人网易云播放器，QR 登录全功能，逐字歌词 + 两栏布局**。

---

## 2. 术语表（Glossary）

| 术语 | 定义 | 来源/决策 |
|---|---|---|
| **DreamMusic** | 播放器名称，路由 `/dreammusic`。 | 决策 D1-Q3 |
| **NeteaseCloudMusicApiEnhanced** | 自建网易云 API 服务，默认 `localhost:3000`，无 CORS。 | `API文档.md` |
| **Vite proxy** | dev 下 `/api` → `http://localhost:3000`（rewrite 去前缀），绕过 CORS。生产需同源部署或反向代理。 | 决策 D1-Q1 + 代码核验 |
| **QR 登录** | `/login/qr/key` → `/login/qr/create?qrimg=true` → 轮询 `/login/qr/check`（1.5s/次），`code=803` 拿 cookie。 | `API文档.md` §4 + D2-Q4 |
| **cookie** | 网易云 Cookie 只存 NightDream 服务端 SQLite；浏览器/鸿蒙 App 只保存 DreamMusic `dm_session`（登录引导）或 `X-API-Key`，不接触网易云 Cookie。 | D4-Q2 + D10-Q1 |
| **强制先登录** | 进 `/dreammusic` 未登录 → 先 QR 登录页，登录后才能用。 | D2-Q4 |
| **level / 音质** | `standard`(128k) / `exhigh`(320k) / `lossless` / `hires`... 默认 `exhigh`，全屏页可切。 | D2-Q3 |
| **yrc** | 逐字歌词（卡拉OK式），来自 `/lyric/new`。优先 yrc，拿不到退 `lrc` 逐行。 | D2-Q2 |
| **解灰换源** | `/song/url/v1` 返回 `url` 为空（无版权）时，自动调 `/song/url/match?id=&source=qq` 换源。 | `API文档.md` §8 + 实现决策 |
| **队列（queue）** | 当前播放列表，左栏展示，当前曲高亮。初始为空。 | D3-Q1 + D3-Q3 |
| **两栏布局** | 左栏=歌曲列表/队列，右栏=大封面+逐字歌词+控制条。 | D3-Q1 |
| **搜索浮层** | 按钮点开的搜索 overlay（非顶部常驻框），结果可加入队列/直接播放。 | D3-Q2 |
| **歌单详情** | MVP 内：点推荐歌单 → 详情页看全部歌曲 → 加入队列。入口 `/personalized` 推荐歌单。 | D3-Q4 |
| **mini 条** | 底部精简控制条，焦点不在主播放视图时显示。 | D1-Q4 |

---

## 3. 三轮拷问决策清单

| 决议 ID | 问题 | 结论 |
|---|---|---|
| D1-Q1 | API 服务器状态 | 已在 `localhost:3000` 运行；**别频繁请求**（防抖/缓存/节流） |
| D1-Q2 | 登录方式 | QR 扫码全功能（高音质/个人歌单/每日推荐/私人FM/红心） |
| D1-Q3 | 路由 + start dream | 加 `react-router-dom`；Landing `/`，播放器 `/dreammusic`；Landing 的 `start dream` 按钮跳转 `/dreammusic` |
| D1-Q4 | MVP 功能 | 搜索 + 全屏播放页 + 底部 mini 条 + 歌词（+ 歌单详情，见 D3-Q4） |
| D2-Q1 | 首页布局 | 两栏并存（左队列/列表 + 右封面+歌词+控制） |
| D2-Q2 | 歌词模式 | 逐字 yrc（优先 yrc，退 lrc） |
| D2-Q3 | 默认音质 | `exhigh`，全屏页可切 |
| D2-Q4 | 登录触发 | 强制先登录（未登录进 `/dreammusic` → QR 登录页） |
| D3-Q1 | 主布局 | 两栏并存 |
| D3-Q2 | 搜索入口 | 按钮点开浮层 |
| D3-Q3 | 初始队列 | 空队列，等用户搜歌/加歌单 |
| D3-Q4 | 歌单详情 | 进 MVP（点推荐歌单→详情→加入队列） |

---

## 4. 技术栈（在 Landing 基础上新增）

- **路由**：`react-router-dom` v6（Landing `/` + `/dreammusic`）。
- **音频**：单一 `<audio>` 元素挂在播放器根，`ref` 控制；`timeupdate` 通过订阅模式更新歌词/进度，避免 Context 高频 re-render。
- **状态**：React Context + `useReducer` 管理播放器状态（当前曲/队列/播放模式/音质/登录态）；音频时间用 ref + 订阅，不入 Context。
- **API 客户端**：`src/dreammusic/api.ts`，统一 `fetch` 封装，走 `/dreammusic/api/v1` 前缀和会话凭证，使用 2 分钟内存缓存、错误码处理（301/460/503）。
- **QR 登录**：`src/dreammusic/auth.ts`，key→create→poll，cookie 存 `localStorage`。

---

## 5. 架构 / 组件树（/dreammusic）

```
DreamMusic（路由 /dreammusic）
├── 若未登录 → LoginView（QR 二维码 + 轮询状态）
└── 已登录 → PlayerLayout
    ├── ParticleBg（延续 Landing 粒子，可选更弱）
    ├── TopBar（标题 + 搜索按钮 + 用户态）
    ├── 两栏 Main
    │   ├── LeftPane
    │   │   ├── 队列视图（当前队列，当前曲高亮，可删/切）
    │   │   └── 歌单视图（我的/收藏歌单 + /personalized 推荐歌单 → 点进歌单详情）
    │   └── RightPane（NowPlaying）
    │       ├── 大封面（+ 模糊背景）
    │       ├── 逐字歌词 yrc（卡拉OK滚动）
    │       └── 控制条（上一首/播放/下一首/进度/音质切换/播放模式）
    ├── SearchOverlay（按钮触发浮层：搜索框 + 结果列表 → 加入队列/播放）
    ├── PlaylistDetail（歌单详情：全部歌曲 → 加入队列/播放全部）
    └── MiniBar（底部，焦点不在主播放视图时显示）
```

**音频**：单一 `<audio ref>` 在 PlayerLayout 顶层，由 PlayerContext 驱动。

---

## 6. API 用法（关键接口）

| 能力 | 接口 | 说明 |
|---|---|---|
| QR key | `GET /login/qr/key` | 返回 `data.unikey` |
| QR 图 | `GET /login/qr/create?key=&qrimg=true` | 返回 base64 二维码 |
| QR 轮询 | `GET /login/qr/check?key=` | 1.5s/次；`code=803` 拿 cookie |
| 游客 | `GET /register/anonimous` | 备用（本项目用 QR，不用） |
| 搜索 | `GET /search?keywords=&type=1&limit=30` | 防抖 400ms，缓存 2 分钟 |
| 歌曲详情 | `GET /song/detail?ids=` | 批量逗号分隔 |
| 播放链接 | `GET /song/url/v1?id=&level=exhigh` | `data[0].url` 为空 → 解灰 |
| 解灰换源 | `GET /song/url/match?id=&source=qq` | 无版权时自动 fallback |
| 歌词 | `GET /lyric/new?id=` | 优先 `yrc`，退 `lrc` |
| 推荐歌单 | `GET /personalized?limit=30` | 歌单视图列表 |
| 用户歌单 | `GET /user/playlist?uid=&limit=&offset=` | 当前用户创建和收藏歌单 |
| 歌单详情 | `GET /playlist/detail?id=` | 歌单名称、封面和 ID |
| 歌单全部歌曲 | `GET /playlist/track/all?id=&limit=1000` | 歌单详情 |
| 我喜欢 | `GET /likelist?uid=` + 批量 `/song/detail` | 当前用户喜欢歌曲 |
| 每日推荐 | `GET /recommend/songs?cookie=` | 备用（初始队列选空，不用） |

**通用**：所有请求走 `/api` 前缀（Vite proxy）；需登录接口自动带 `?cookie=`；`460` 加 `randomCNIP=true`。

---

## 7. 视觉调性（延续 Landing）

- 色板同 Landing：背景 `#05070F` + 极轻 radial-gradient；主粉 `#EA8BA7`；深紫 `#2A182C`；白/淡粉。
- 粒子背景延续（可降低密度，避免抢播放器内容）。
- 字体：正文 Inter；`DreamMusic` 标题可用 `ivy-move-font` 手写体呼应品牌。
- 圆角、半透明卡片、粉色高亮，克制 hover。
- **不是**：玻璃卡片堆砌、SaaS Dashboard、亮色 UI。

---

## 8. 质量属性 / 约束

- **限频**：搜索防抖 400ms；同 URL 2 分钟内只请求一次（缓存）；QR 轮询 1.5s；不重复拉同一接口。
- **CORS**：dev 用 Vite proxy；生产部署到 `nd.ivyreverie.dpdns.org` 时需同源反代或 API 加 CORS。
- **登录态**：cookie 持久化 `localStorage`，刷新不丢；失效（301）时回登录页。
- **无版权**：自动解灰换源；仍失败给友好提示，跳下一首。
- **音频**：`<audio>` 单例；切歌平滑；进度可拖动 seek。
- **响应式**：桌面两栏；窄屏可叠为单栏（左队列折叠为抽屉）。
- **a11y**：播放按钮 aria-label；歌词滚动可读。

---

## 9. 待确认 / 开放问题

| # | 问题 | 默认假设 |
|---|---|---|
| O1 | 歌单详情入口位置 | 左栏「歌单」tab（推荐歌单列表），点进详情；队列空时默认显歌单 tab |
| O2 | 播放模式 | 顺序/单曲循环/随机三态切换，默认顺序 |
| O3 | 队列操作 | 可删歌、清空、拖拽排序（拖拽为 stretch，MVP 可只做删/清） |
| O4 | 私人FM/每日推荐/红心 | QR 全功能已含能力，但 MVP UI 不做入口，后续扩展 |
| O5 | 生产 CORS | 暂只保 dev proxy；上生产时再处理反代 |
| O6 | 粒子背景密度 | 播放器内粒子降为移动端量级（≤600），不抢内容 |

---

## 10. 后续管线

按 `grill-with-docs → to-prd → to-issues → implement-review`：
- ✅ grill-with-docs → 本文件
- ⏭ to-prd → `docs/PRD-dreammusic.md`
- ⏭ to-issues → `docs/issues/issue-NN-dreammusic-*.md`
- ⏭ implement-review → 实现 + code review

---

## 11. 中间层与 API 暴露（第四轮拷问，已完成）

> 用户目标：DreamMusic 不仅能自己播放，还能对外提供 `/dreammusic/api/v1/*` API；
> 因 api-enhanced 无鉴权，不暴露公网，由中间层鉴权后转发。
> 全部决策已固化并实现（2026-08-16）。

| 决议 ID | 问题 | 结论 |
|---|---|---|
| D4-Q1 | 中间层形态 | 同仓库新增 Node(Express) 服务：静态托管 `dist/` + `/dreammusic/api/v1/*` 鉴权转发到 api-enhanced |
| D4-Q2 | 鉴权模型 | 双通道：UI 走 HttpOnly 会话 cookie（网易 cookie 存服务端，前端不再持有）；外部调用走 `X-API-Key` |
| D4-Q3 | DreamMusic 用户体系 | 多用户（几个朋友），受控注册，账户存 SQLite（Docker 挂卷）；每用户绑定自己的网易云 cookie（存服务端库） |
| D4-Q4 | 注册方式 | 注册页 + 全局邀请码（env `REGISTER_CODE`）；登录后引导 QR 绑定网易云，未绑定不进播放器 |
| D4-Q5 | 前端 API 路径 | 统一 `/dreammusic/api/v1`（前端 `API_BASE` + Vite dev 代理 + 生产 Express 同一前缀） |
| D4-Q6 | 端点暴露范围 | 白名单，默认只放行播放器所需接口 + QR 绑定；`API_ALLOWED_PATHS` env 可扩展 |
| D4-Q7 | UI 背景图 | 播放器主页背景 = 当前歌曲封面（模糊+压暗），切歌自动切换；无封面保持上一张；从未播放/无封面兜底显示 `img/` 默认背景图（`backend.png` 压暗） |
| D4-Q8 | 播放状态持久化 | localStorage 按用户名分 key 持久化队列+音质+模式；不持久化 isPlaying/进度/URL（恢复后自动重取链接） |
| D4-Q9 | Docker 形态 | compose 双服务已落地（`docker-compose.yml` + `Dockerfile`）：dreammusic 暴露 3001，api-enhanced 仅内网可达，SQLite 挂卷 |

### 对外文档

- 平台对外 API 文档：`docs/API-DreamMusic.md`
- 鸿蒙下游接入规范：`docs/API-DreamMusic-HarmonyOS.md`
- 待办清单：`docs/TODO.md`

### 新增术语

| 术语 | 定义 |
|---|---|
| **中间层（API 网关）** | 同仓 Express 服务：静态托管 SPA + `/dreammusic/api/v1/*` 鉴权转发。 |
| **api-enhanced** | 上游网易云 API 服务（`localhost:3000`），只在内网/容器网络可达，不暴露公网。 |
| **/dreammusic/api/v1** | DreamMusic 对外 API 前缀；中间层在此路径上做鉴权、转发、限流。 |
| **DreamMusic 账户** | 多用户登录账户（用户名+bcrypt 密码），存 SQLite；每个账户绑定一个网易云账号。 |
| **绑定** | 账户首次使用时 QR 扫码网易云，cookie 存服务端库；失效（301）时标记"绑定失效"，提示重新扫码。 |
| **个人音乐库只读闭环** | 从网易云读取用户歌单和喜欢歌曲，补齐歌曲/歌单元数据后用于播放或加入队列；不向网易云写入任何数据。 |
| **同步歌曲数据** | 以网易云歌单、喜欢列表及其歌曲详情为数据源，更新播放器可用的歌曲集合；不等同于修改网易云歌单。 |
| **下游客户端** | 使用 DreamMusic 中间层 API 的鸿蒙 DreamMusic App 或其它受控调用方。 |
| **转发中间层** | NightDream 的 Express 服务：验证 DreamMusic 身份和网易云绑定状态、执行白名单和限流、注入服务端网易云 Cookie，再转发到 api-enhanced。 |

### 本地调试

```bash
# 1) 启动中间层（默认 3001，转发到 localhost:3000 的 api-enhanced）
npm run server

# 2) 另一个终端启动前端（Vite 5173，/dreammusic/api/v1 代理到中间层）
npm run dev
```

中间层 env（全部可省，有默认值）：

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3001` | 中间层监听端口 |
| `UPSTREAM` | `http://localhost:3000` | api-enhanced 地址（compose 时 `http://api-enhanced:3000`） |
| `REGISTER_CODE` | `dreammusic` | 注册邀请码 |
| `API_ALLOWED_PATHS` | （默认白名单） | 额外放行端点，逗号分隔，追加到默认白名单 |
| `DATA_DIR` | `data` | SQLite 数据目录 |
| `COOKIE_SECURE` | `false` | 生产 https 下设为 `true` |

已验证（curl + stub 上游全链路）：注册 → 登录 → QR 绑定 803 落库（cookie 清洗）→
会话转发自动注入 cookie → 301 标记绑定失效 → `X-API-Key` 外部通道 → 白名单拒绝。

---

## 12. 第二轮视觉优化 + 用户中心（第五轮拷问）

> 依据 `DreamMusic_UI_第二轮视觉优化规范.md`：做减法、压低背景、歌词为核心、
> 播放器向原生靠拢、队列加缩略图、API/退出移出一级导航。
> 用户新增需求：一级导航显示用户名 → 点击左侧弹出用户信息面板（覆盖队列），
> 含签到/头像/签名/播放时长/歌曲数量/梦点；角色分管理员与用户；封禁分类。
> 全部决策已固化并实现（2026-08-16）。

| 决议 ID | 问题 | 结论 |
|---|---|---|
| D5-Q1 | 队列封面加载 | 懒加载：队列项缺 `picUrl` 时调 `songDetail(id)` 补（2 分钟缓存）；mini 条同 |
| D5-Q2 | 一级导航 | Logo + 搜索框 + 用户名 + 「⋯」；API Key/退出入 ⋯ 菜单；点用户名左侧弹出用户信息面板（覆盖队列） |
| D5-Q3 | 角色与封禁模型 | `role`: admin/user；首个注册用户自动 admin + env `ADMIN_USERNAMES` 追加；封禁 = `status: banned` + `ban_reason`，被封禁直接拒绝登录（会话/API 一并失效） |
| D5-Q4 | 播放时长/歌曲数量统计 | 客户端节流上报：播放中每 30s `POST /auth/stats {seconds, songId}`（切歌/暂停补报）；服务端累计 `play_seconds` + 去重 `played_song_ids` |
| D5-Q5 | 头像与签名 | 绑定成功后中间层自动拉 `/login/status` 存 `avatarUrl`；缺失时首字母彩色头像兜底；签名用户自编辑存 `signature`（≤60 字） |
| D5-Q6 | 签到与梦点规则 | 每日签到固定 +10 梦点（东八区自然日），无连续奖励；梦点来源仅签到；本期只累计展示 |
| D5-Q7 | 梦点限制查询 | 本期只累计，扣减/限制规则后续再设计 |
| D5-Q8 | 图标方案 | 内置轻量 SVG 线性图标组件（零依赖，统一线宽，联动主题色） |

### 实施要点

- 背景氛围层：`img/backend.jpg` 固定底图 + `blur(50px) brightness(.45) saturate(.65)` +
  `scale(1.15)` + 深色蒙层 + 8~15% 主题色环境光；封面缩至 180px、歌词当前行 22px/600、
  普通行 19px/opacity .3、行距 2.1；播放按钮圆形 46px 主题色；Header 68px。
- 用户面板：头像（绑定成功自动拉 `/login/status` 存 `avatar_url`，缺失首字母兜底）、
  签名（≤60 字自编辑）、签到（东八区自然日 +10 幂等）、梦点/播放时长/歌曲数统计；
  admin 面板内嵌用户管理（封禁/解封/设管理员，不能操作自己）。
- 新接口：`GET/POST /auth/profile`、`POST /auth/stats`（≤120s/次节流上报）、
  `POST /auth/checkin`、`GET /auth/users`、`POST /auth/users/:id`。
- 环境变量：`ADMIN_USERNAMES`（逗号分隔，启动时同步为管理员；首个注册用户自动 admin）。

## 13. 第三轮功能扩展（2026-08-16，已实现）

| 决议 ID | 问题 | 结论 |
|---|---|---|
| D6-Q1 | 私人FM / 每日推荐 / 红心 | 左栏新增「每日推荐 / 私人FM / 我喜欢」tab；白名单放行 `personal_fm` `fm_trash` `recommend/songs` `recommend/resource` `like` `likelist` |
| D6-Q2 | 队列排序 | `REORDER_QUEUE` reducer action + HTML5 拖拽 + 上移/下移按钮，顺序持久化 |
| D6-Q3 | 梦点记账 | 新增 `dream_point_logs` 流水表；签到/admin 调整/下载扣款统一记账；规则见 `docs/dream-points-rules.md` |
| D6-Q4 | 用户基础操作 | 修改密码（销毁全部会话）、上传本地头像（`data/avatars/`，≤2MB）、在线会话列表/踢下线 |
| D6-Q5 | 平台公告 | `announcements` 表 + 公开列表 + admin CRUD + 顶部铃铛未读红点 + 公告弹层 |
| D6-Q6 | 管理员能力 | 给用户增减梦点（必填原因）、重置用户密码、操作审计日志查询 |
| D6-Q7 | 安全 | 登录失败 5 次锁 15 分钟；全 API IP 限流默认 300/分钟（`RATE_LIMIT_PER_MIN`）；X-API-Key 可用于 `/auth/*` 登录后接口 |

### 新增/变更接口

- `POST /auth/password`、`POST /auth/avatar`、`GET /auth/avatar-file/:file`
- `GET /auth/sessions`、`POST /auth/sessions/revoke`
- `GET /auth/points/log`
- `GET/POST/DELETE /auth/announcements*`
- `POST /auth/users/:id/points`、`POST /auth/users/:id/reset-password`
- `GET /auth/audit-logs`
- 白名单新增 FM / 推荐 / 红心 / `login/status` 路径

## 16. 第七轮调整：个人音乐库只读边界（2026-08-18）

> 用户目标：方便同步网易云歌曲数据，不建设网易云管理后台或社交功能。

| 决议 ID | 问题 | 结论 |
|---|---|---|
| D9-Q1 | 网易云能力边界 | 只实现个人音乐库只读闭环：用户歌单 / 我喜欢 → 歌单或歌曲详情 → 播放 / 加入队列；不做创建、编辑、收藏、删除、评论、动态、关注等写操作或社交能力。 |
| D9-Q2 | 既有红心能力 | 保留播放器已有的红心按钮和 `/like` 写接口，避免回退现有功能；本轮不新增其它网易云写操作。用户喜欢歌曲的同步读取使用 `/likelist` + `/song/detail`。 |
| D9-Q3 | 用户歌单范围 | 同步 `/user/playlist` 返回的全部歌单，包含用户创建歌单和收藏歌单；未来做统一歌曲汇总时按歌曲 ID 去重。 |
| D9-Q4 | 同步方式 | 采用按需读取 + 2 分钟内存缓存，不把网易云歌曲数据永久复制到 DreamMusic SQLite。 |
| D9-Q5 | 大数据量处理 | 用户歌单、歌单歌曲和喜欢歌曲均采用分页/分批加载；达到单页上限时继续请求下一页，不静默截断结果。 |
| D9-Q6 | 部分失败处理 | “我的歌单”和“我喜欢”独立加载；已成功数据继续显示，失败区域提供重试；上游 301 沿用现有绑定失效流程。 |
| D9-Q7 | API 清单边界 | 当前必需：`user/playlist`、`likelist`、`playlist/detail`、`playlist/track/all`、`song/detail`、`login/status`；既有 `/like` 保留。后续可选只读接口暂缓：`user/detail`、`user/record`、`user/subcount`、`user/level`、`user/cloud`、专辑/歌手收藏。其它写操作和社交接口不纳入本阶段。 |

## 17. 第八轮调整：下游鸿蒙客户端 API 契约（2026-08-18）

| 决议 ID | 问题 | 结论 |
|---|---|---|
| D10-Q1 | 下游客户端认证 | 鸿蒙 App 通过登录后的 `X-API-Key` 调用长期 API；`dm_session` 只用于登录引导和换取/轮换 API Key；客户端永不接触网易云 Cookie。 |
| D10-Q2 | 响应格式 | 保留双层契约：NightDream 自有 `/auth/*` 使用 `{code,data}`；网易云转发接口透传 api-enhanced 原始 JSON，不额外包裹 `data`。 |
| D10-Q3 | 下游文档目标 | API 文档只解决下游客户端正确接入、标准调用顺序、鉴权、绑定、错误处理、限频和推荐实践；不扩展产品功能范围。 |

## 14. 第四轮调整（2026-08-16 下午，已实现）

| 决议 ID | 问题 | 结论 |
|---|---|---|
| D7-Q1 | 梦点扣减 | 下载歌曲扣 1 梦点；`POST /auth/points/download` 先取直链后扣款，余额不足 402；管理员可给自己调整梦点 |
| D7-Q2 | 红心刷新 | 红心切换后定向清 `/likelist` 缓存 + 派发 `dm-liked-changed`，我喜欢列表立即刷新 |
| D7-Q3 | 红心按钮位置 | 移除 NowPlaying 封面下方红心；队列项红心保留 |
| D7-Q4 | 音质切换 | 播放控制条音质从循环按钮改为 `<select>` 下拉，一次选择只触发一次换链，避免连续切换卡顿 |
| D7-Q5 | 注册邀请码 | `settings` 表存储运行时可编辑邀请码；admin `GET/POST /auth/invite-code`；注册时优先读库，其次 env |
| D7-Q6 | 歌词翻译 | 明确不做，已从待办移除 |

## 15. 第六轮调整（已实现）

| 决议 ID | 问题 | 结论 |
|---|---|---|
| D8-Q1 | 公告格式 | 公告内容支持 Markdown（marked + DOMPurify 渲染） |
| D8-Q2 | 左栏折叠 | 桌面左侧列表可收成 44px 竖条，可展开 |
| D8-Q3 | 用户中心位置 | 点击顶部头像 → 左栏收起 + 右侧抽屉弹出用户中心 |
| D8-Q4 | 顶部 UI | 搜索框居中；头像替代 user icon；顶部加入公告/兑换/更多；窄屏适配 |
| D8-Q5 | 头像异常 | 统一 UserAvatar 组件，加载失败回退首字母；上传成功后刷新顶部头像 |
| D8-Q6 | 滚动条 | 全站滚动条统一 5px 细窄圆角样式 |
| D8-Q7 | 兑换码 | `redeem_codes` 表；用户 `POST /auth/redeem`；admin 生成/查询兑换码；顶部礼物入口 |
