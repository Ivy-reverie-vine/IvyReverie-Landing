# PRD — DreamMusic 网页播放器

> **Status**: ready-for-agent
> **Source**: synthesized from `docs/CONTEXTS-dreammusic.md` + 三轮拷问决策
> **Issue tracker**: 项目未配置 issue tracker，本 PRD 以文件发布于 `docs/PRD-dreammusic.md`，后续接入 tracker 时迁移。

---

## Problem Statement

作为 IvyReverie 站点的拥有者，我已经有了一个深空梦幻调性的 Landing 首页，但缺少一个能实际「使用」的功能页。我希望在 `/dreammusic` 路由下有一个**个人专属的网页音乐播放器**：用 QR 扫码登录我的网易云账号，能搜索歌曲、查看推荐歌单、播放高音质音乐、看逐字卡拉OK歌词、管理播放队列。视觉上要**延续** Landing 的深空 + 粉色手写 + 粒子梦幻调性，而不是变成一个普通亮色 SaaS 播放器。音源走我自建的 NeteaseCloudMusicApiEnhanced API，排版参考鸿蒙手机 QQ 音乐，但因是桌面网页可两栏并存。

## Solution

在现有 Vite + React + TS 项目中新增 `react-router-dom` 路由：Landing 留 `/`，播放器挂 `/dreammusic`，并把 Landing 的 `start dream` 按钮接成跳转入口。播放器是一个**两栏并存**的桌面布局：

- **强制 QR 登录**：进 `/dreammusic` 未登录 → QR 登录页（展示二维码 + 1.5s 轮询），登录后 cookie 持久化到 `localStorage`，失效自动回登录页。
- **左栏**：队列/歌单 tab —— 队列视图（当前播放列表，当前曲高亮，可删/清空）+ 歌单视图（`/personalized` 推荐歌单卡片，点进歌单详情）。
- **右栏 NowPlaying**：大专辑封面（+ 模糊背景）+ 逐字歌词 yrc（卡拉OK滚动）+ 控制条（上一首/播放/下一首/进度 seek/音质切换/播放模式）。
- **搜索浮层**：按钮点开 overlay，输入防抖 400ms 搜歌，结果可加入队列或直接播放。
- **歌单详情**：点推荐歌单 → 拉全部歌曲 → 加入队列/播放全部。
- **底部 mini 条**：焦点不在主播放视图时显示精简控制。
- **解灰兜底**：`/song/url/v1` 返回空（无版权）时自动 `/song/url/match?source=qq` 换源。
- **音源**：自建 API @ `localhost:3000`，dev 经 Vite proxy `/api`→3000 绕 CORS；限频（防抖/2 分钟缓存/QR 节流）。

整体延续 Landing 调性：深黑背景 `#05070F`、主粉 `#EA8BA7`、深紫 `#2A182C`、粒子背景（降密度不抢内容）、`ivy-move-font` 手写体用于品牌标题。

---

## User Stories

### 路由与入口
1. 作为访客，我希望 Landing 首页的 `start dream` 按钮点击后跳转到 `/dreammusic`，以便从首页进入播放器。
2. 作为访客，我希望直接访问 `/dreammusic` 也能进入播放器，以便快速直达。
3. 作为访客，我希望 Landing `/` 与播放器 `/dreammusic` 共存于同一站点，以便品牌体验连续。

### 登录（QR）
4. 作为用户，我希望进入 `/dreammusic` 时若未登录，先看到 QR 登录页，以便用网易云 App 扫码登录。
5. 作为用户，我希望登录页展示二维码图片和「请用网易云 App 扫码」提示，以便知道怎么操作。
6. 作为用户，我希望扫码后页面自动检测并进入播放器，以便无需手动点确认。
7. 作为用户，我希望二维码每隔一段时间刷新（过期重生成），以便二维码失效后能继续扫。
8. 作为用户，我希望登录态在刷新页面后保持，以便不用反复扫码。
9. 作为用户，我希望登录失效（接口 301）时被引导回登录页，以便重新登录。

### 搜索
10. 作为用户，我希望点搜索按钮弹出搜索浮层，以便主界面保持干净。
11. 作为用户，我希望在搜索框输入关键词后（防抖）自动搜索，以便不用手动点搜索按钮。
12. 作为用户，我希望看到搜索结果列表（歌名/歌手/专辑），以便快速识别目标。
13. 作为用户，我希望点搜索结果直接播放，以便立即听歌。
14. 作为用户，我希望能把搜索结果加入队列，以便稍后播放。
15. 作为用户，我希望搜索请求不要过于频繁，以免触发 API 风控。

### 队列与播放
16. 作为用户，我希望左栏看到当前播放队列，当前曲高亮，以便知道在放什么、下一首是什么。
17. 作为用户，我希望点队列里任意一首直接切过去播放，以便快速切歌。
18. 作为用户，我希望从队列删除某首或清空队列，以便管理列表。
19. 作为用户，我希望空队列时有占位提示引导去搜索/看歌单，以便知道下一步。
20. 作为用户，我希望播放控制条有上一首/播放暂停/下一首，以便基本控制。
21. 作为用户，我希望进度条显示当前进度并可拖动 seek，以便跳到任意位置。
22. 作为用户，我希望切换播放模式（顺序/单曲循环/随机），以便按喜好播放。
23. 作为用户，我希望空队列点下一首不报错，以便边界稳健。
24. 作为用户，我希望最后一首播放完按当前模式处理（顺序停/单曲循环/随机下一首），以便行为符合预期。

### NowPlaying 与歌词
25. 作为用户，我希望右栏看到当前曲的大专辑封面，以便视觉沉浸。
26. 作为用户，我希望封面背后有模糊背景烘托氛围，以便延续深空梦幻调性。
27. 作为用户，我希望看到逐字歌词（yrc）随播放高亮当前字，以便卡拉OK式跟唱。
28. 作为用户，我希望当前歌词行自动滚动到可视区，以便不用手动翻。
29. 作为用户，我希望拿不到 yrc 时退化为逐行 lrc 滚动，以便无逐字数据的歌也有歌词。
30. 作为用户，我希望纯音乐/无歌词时显示「纯音乐，无歌词」提示，以便不困惑。

### 音质与解灰
31. 作为用户，我希望默认 exhigh(320k) 音质，以便体积/质量平衡。
32. 作为用户，我希望在播放页切换音质（standard/exhigh/lossless/...），以便按需调整。
33. 作为用户，我希望切音质后重新取链接并续播，以便音质立即生效。
34. 作为用户，我希望无版权歌曲自动尝试解灰换源（qq），以便能听到尽量多的歌。
35. 作为用户，我希望解灰仍失败时给友好提示并跳下一首，以便不被卡住。

### 歌单
36. 作为用户，我希望左栏歌单 tab 看到推荐歌单卡片（封面+名字），以便发现音乐。
37. 作为用户，我希望点歌单进入详情看到全部歌曲，以便浏览。
38. 作为用户，我希望在歌单详情里「播放全部」或「加入队列」，以便整单播放。
39. 作为用户，我希望从歌单详情返回，以便回到上一层。

### mini 条
40. 作为用户，我希望在搜索浮层/歌单详情打开时底部仍能精简控制播放，以便不中断听歌。
41. 作为用户，我希望点 mini 条能回到全屏 NowPlaying，以便快速展开。

### 视觉与响应式
42. 作为用户，我希望播放器延续 Landing 的深空 + 粉色 + 粒子调性，以便品牌一致。
43. 作为用户，我希望窄屏（手机/窄窗）时两栏折叠为单栏 + 队列抽屉，以便移动端可用。
44. 作为用户，我希望页面在桌面 1440/1920 下两栏舒展，以便大屏体验好。

### 限频与稳健
45. 作为用户，我希望重复搜索同一关键词时走缓存不重复请求，以便不触发风控。
46. 作为用户，我希望 API 460（海外风控）时自动加 randomCNIP 重试，以便海外也能用。
47. 作为用户，我希望网络异常时给错误提示而非白屏，以便知道发生了什么。

### a11y
48. 作为用户，我希望播放/上一首/下一首等按钮有 aria-label，以便辅助技术可识别。
49. 作为用户，我希望歌词滚动区域可读，以便视障用户也能感知当前歌词。

---

## Implementation Decisions

### 路由与入口
- 新增 `react-router-dom` v6。`App` 改为 `<BrowserRouter>` + `<Routes>`：`/` → 现有 Landing；`/dreammusic` → `DreamMusic`。
- Landing 的 `start dream` 按钮从 `href="#"` 改为 `<Link to="/dreammusic">`（或 `useNavigate`）。
- Landing 现有粒子/Logo/导航保持不变。

### 模块划分（DreamMusic）
- **`auth` 模块**：QR 登录状态机 `useQrLogin()` —— key→create→poll(1.5s)；状态 `idle/qrcode/scanning/expired/error/logged`；`code=803` 存 cookie 到 `localStorage`（key `dreammusic_cookie`）并回调 `onLogin`。
- **`api` 客户端**：`fetch` 封装，统一拼 `/api` 前缀 + `?cookie=` + `randomCNIP=true`；2 分钟内存缓存（key=URL）；错误码处理（301→登出、460→加 randomCNIP 重试、503→提示）。导出 `search`、`songDetail`、`songUrlV1`、`songUrlMatch`、`lyricNew`、`personalized`、`playlistTrackAll` 等函数。**可被 `vi.mock` 替换**以支持测试。
- **`player` reducer**：纯函数 `playerReducer(state, action)`，状态 `{ queue, currentIndex, isPlaying, mode, level, currentTime, duration }`，action 含 `PLAY/PAUSE/TOGGLE/NEXT/PREV/SEEK/ADD_TO_QUEUE/REMOVE_FROM_QUEUE/CLEAR_QUEUE/SET_MODE/SET_LEVEL/SET_TIME/SET_DURATION`。边界：空队列 NEXT/PREV 不越界；最后一首按 mode 处理。
- **`lyric` 解析器**：纯函数 `parseLyric(lrcStr, yrcStr?)` → `{ lines: [{time, text, chars?:[{time,text}]}], hasYrc }`；`findActiveLine(lines, currentTime)` → 当前行/字索引。优先 yrc，退 lrc。
- **`<audio>` 单例**：PlayerLayout 顶层一个 `<audio ref>`，由 PlayerContext 驱动 `play()/pause()/src`；`timeupdate` 通过 ref 订阅更新 reducer（不入 Context 避免高频 re-render）。
- **`PlayerContext`**：Context + useReducer 暴露 `playerReducer` 状态 + dispatch；音频时间用 ref + 订阅。
- **UI 组件**：`LoginView`、`PlayerLayout`、`TopBar`（标题+搜索按钮+用户态）、`LeftPane`（队列 tab / 歌单 tab）、`QueueView`、`PlaylistGrid`、`PlaylistDetail`、`RightPane`/`NowPlaying`（封面+歌词+控制条）、`LyricsView`（yrc/lrc 滚动）、`Controls`（上一首/播放/下一首/进度/音质/模式）、`SearchOverlay`、`MiniBar`。

### API 用法（关键接口）
- QR：`/login/qr/key` → `/login/qr/create?key=&qrimg=true` → 轮询 `/login/qr/check?key=`（1.5s；`code=803` 拿 cookie）。
- 搜索：`/search?keywords=&type=1&limit=30`（防抖 400ms，缓存 2 分钟）。
- 播放链接：`/song/url/v1?id=&level=exhigh`；`data[0].url` 为空 → `/song/url/match?id=&source=qq` 解灰。
- 歌词：`/lyric/new?id=`，优先 `yrc`，退 `lrc`。
- 推荐歌单：`/personalized?limit=30`；歌单详情：`/playlist/track/all?id=&limit=1000`。
- 歌曲详情：`/song/detail?ids=`（批量）。

### 视觉规格
- 背景 `#05070F` + 极轻 radial-gradient（延续 Landing）；粒子背景复用 `ParticleBackground` 但降为移动端量级（≤600）。
- 主粉 `#EA8BA7`（高亮/进度条/当前歌词）、深紫 `#2A182C`（选中/pill）、白/淡粉文字。
- `DreamMusic` 品牌标题可用 `ivy-move-font` 手写体呼应。
- 卡片半透明、圆角、克制 hover。
- 桌面两栏（左 ~320-380px 列表，右 flex 播放页）；窄屏（≤768px）折叠为单栏 + 左栏变抽屉。

### 限频与缓存
- 搜索输入防抖 400ms；同 URL 2 分钟内只请求一次（api 客户端内存缓存）；QR 轮询 1.5s/次；不重复拉同一接口。

### 错误与降级
- 无版权 → 自动解灰换源；仍失败 → 友好提示 + 自动跳下一首。
- 301（未登录）→ 清 cookie 回登录页；460 → `randomCNIP=true` 重试；503 → 提示「请求过频繁，稍后再试」。
- 网络异常 → 错误提示，不白屏。

---

## Testing Decisions

### 测试哲学
- **只测外部行为，不测实现细节**。真实网络请求、真实音频播放不测（环境/版权不可控）。
- API 客户端用 `vi.mock` 替换为 fixture，保证测试 hermetic 且快。
- 纯逻辑（reducer/解析器）单测，无 DOM。

### Seam A（既有，扩展）— RTL 组件渲染 + mock API
- `vi.mock('dreammusic/api')` 返回固定 fixture（搜索结果、歌单、歌词、播放链接）。
- 断言：
  - 未登录 → `LoginView` 渲染二维码占位 + 扫码提示
  - 已登录 → `PlayerLayout` 两栏渲染
  - 搜索浮层：输入 → 结果列表渲染（歌名/歌手）
  - 点搜索结果 → 调 `ADD_TO_QUEUE`/`PLAY`，队列出现该曲
  - 队列视图：当前曲高亮、删除/清空生效
  - 控制条按钮存在（上一首/播放/下一首/模式/音质）
  - 歌单 tab → 推荐歌单卡片渲染 → 点进详情 → 全部歌曲
  - 无版权 fixture → 触发解灰调用
  - mini 条在搜索浮层打开时显示
- 不测：真实 fetch、真实 `<audio>` 播放、真实 QR 轮询网络。

### Seam C（新增）— 纯逻辑 Vitest（Node，无 DOM）
- **player reducer**：`NEXT`/`PREV` 边界（空队列、最后一首、单曲循环/随机）、`ADD_TO_QUEUE`/`REMOVE_FROM_QUEUE`/`CLEAR_QUEUE`、`SET_MODE`/`SET_LEVEL`、`SEEK`。
- **lyric 解析器**：`parseLyric` 正确解析 lrc 时间戳行；yrc 逐字时间戳；`findActiveLine` 给定 currentTime 返回正确行/字；空歌词 → 空数组 + 标记。
- **api 客户端纯函数**：URL 构建（拼 cookie/randomCNIP）、缓存 key 生成、错误码分流（301/460/503）。
- Prior art：`src/particles/engine.test.ts`（纯逻辑 Vitest 范式）、`src/App.test.tsx`（RTL 范式）。

### 不测的部分
- 真实 API 请求（依赖外部服务，不可控）。
- 真实音频播放（浏览器/版权限制）。
- 真实 QR 扫码流程（需手机）。

---

## Out of Scope

- **私人 FM / 每日推荐 / 红心** UI 入口：QR 全功能已具备 API 能力，但 MVP 不做 UI 入口，后续扩展。
- **评论 / MV / 视频 / 云盘 / 电台 / 用户主页**：不在 MVP。
- **队列拖拽排序**：MVP 只做删/清，拖拽为 stretch。
- **生产环境 CORS/反代**：暂只保 dev proxy；上生产（`nd.ivyreverie.dpdns.org`）时再处理同源反代。
- **多语言切换**：Landing 的 `A/文` 按钮仍仅视觉，播放器不做 i18n。
- **离线模式 / 下载**：不在 MVP。
- **歌词翻译/罗马音**：API 可取 `tlyric`，但 MVP 不展示翻译。
- **音频可视化（频谱）**：不在 MVP。
- **真实 issue tracker 发布**：项目未配置 tracker，PRD 以文件发布。

---

## Further Notes

### 与 Landing 的关系
- 共享站点、共享调性（深空/粉/粒子/手写体），但路由独立、状态独立（播放器不依赖 Landing 的粒子引擎状态）。
- Landing 的 `start dream` 按钮从死链接变为 `/dreammusic` 入口（语义「start dream → 进入梦境播放器」）。
- Landing 的粒子背景在播放器内复用但降密度（≤600，移动端量级），避免抢播放器内容焦点。

### 限频提醒（用户强调）
用户明确要求「别过于频繁请求」。实现必须：搜索防抖 400ms、同 URL 2 分钟缓存、QR 轮询 1.5s、避免重复拉同一接口、列表分页而非全量。这些是硬约束，写入 api 客户端与各调用点。

### 待确认开放问题（见 CONTEXTS-dreammusic.md §9）
6 个开放问题已给默认假设：歌单入口在左栏 tab、播放模式三态默认顺序、队列操作删/清（拖拽 stretch）、私人FM等后续、生产 CORS 延后、粒子降密度。实现按默认假设处理，review 时可推翻。

### 后续管线
按 `grill-with-docs → to-prd → to-issues → implement-review`：
- ✅ grill-with-docs → `docs/CONTEXTS-dreammusic.md`
- ✅ to-prd → 本文件
- ⏭ to-issues → 拆 vertical-slice（路由+脚手架 / QR 登录 / api 客户端 / player reducer+audio / 搜索浮层 / 队列视图 / NowPlaying+歌词 / 歌单详情 / mini 条 / 解灰与错误 / 响应式 / 测试），审批后发布。
- ⏭ implement-review → 逐 issue 实现 + 全量 code review。
