# 同录音自动播放（DreamMusic #25 / T06、#27 / T08）

日期：2026-10-05。NightDream 保留具体资源 `mediaRef`，在已有 v2 播放路由上增加 opt-in 自动编排；v1 和未携带 automatic 的 v2 请求仍只解析具体来源。

## 请求与信任边界

`GET /dreammusic/api/v2/song/url/v1?automatic=true&mediaRef=<所选目录引用>&searchSession=<合并搜索会话>`，使用既有会话或 `X-API-Key` 鉴权。

会话来自 `search?aggregate=true&merge=true`，按用户隔离，沿用 15 分钟有效期。所选引用必须是该会话中的原目录条目；其他候选只能来自服务端保存的同录音组，并再次按 `metadata-strict-v1` 检查。客户端不提交任意候选，也不把网易数字 ID 发送到其他平台。版本不确定/证据不足的独立条目可以点播自身，不能参加另一个条目的自动换源。失效或重启后的会话返回 `INVALID_SEARCH_SESSION`，客户端提示重新搜索，不静默换曲。

候选限于已注册的网易、QQ、酷狗；来源开关、能力、熔断及并发配额仍由 MusicSourceRegistry 决定。每个平台同一时刻只尝试一个候选，各平台并行，平台内部先尝试所选资源。只有 `audioIntegrity.status=full` 的可靠 URL 才是成功。试听、未知和不可用保留证据并继续，首个可靠完整版立即返回，不等待优先级更高或音质更好的迟到结果。返回后取消其他工作；结果快照、媒体身份和 Meting 缓存不会被迟到结果修改。

## 预算与终态

- `AUTO_PLAYBACK_BUDGET_MS`：默认 10000，总自动解析预算。
- `AUTO_PLAYBACK_BILIBILI_RESERVE_MS`：默认 3000，为 B 站阶段保留的时间；普通平台阶段默认最多 7000ms。平台提前耗尽时直接接续剩余总预算。
- 每个候选的超时为来源配置超时和阶段剩余预算的较小值，涵盖 URL、详情证据与正文读取，不能逐次重置总预算。
- 客户端自动请求不执行普通查询的网络重试；重新点播是新操作。鉴权/base 获取和网络传输不计入服务端解析计时，客户端保留既有 15 秒传输超时。
- HTTP 断开、切歌或恢复另一音轨会取消解析；服务端传递 AbortSignal，客户端销毁 HTTP 请求并用请求序号阻止旧结果覆盖。

业务解析终态在 HTTP 200 的 `playback` 中，鉴权/输入错误仍使用既有 HTTP 错误信封：

| status | 含义 |
| --- | --- |
| success | 首个可靠完整版已选定 |
| exhausted | 已启用的自动候选耗尽，无可靠完整版；保留手动候选/来源失败理由 |
| timeout | 总预算到期时 reason=total_budget；B 站关闭时保留 music_stage_budget |
| cancelled | 请求取消；reason 为 request_cancelled。HTTP 已断开时不再发送响应 |

`playback` 保留 `totalBudgetMs`、`stageBudgetMs`、`elapsedMs`、`remainingBudgetMs` 和 `attempts`。每项尝试包括具体引用、来源、状态、理由、匹配理由，以及已取得的完整性证据。#27 已接上 B 站：平台成功立即结束；否则在原始 deadline 内搜索和读取分 P，按录音证据及完整版门禁决定。B 站关闭时保留原 `continuation.enabled=false` 契约；接续后 `enabled=true/eligible=false`，结果和可识别候选在 `playback.bilibili`。规则与实测见 [Bilibili 回退](bilibili-fallback.md)。

## 身份和客户端

成功响应的顶层和 `data[0]`：`mediaRef/catalogRef/lyricsRef` 保持原目录引用；`playbackRef/playbackSource` 指向实际音频。原曲标题、歌手、专辑、封面、收藏身份保持稳定。媒体代理沿用实际 URL 与用户隔离的既有媒体引用实现。

鸿蒙搜索合并主行发起自动解析；展开的具体来源行仍是手动单资源点播。在线资料页和旧客户端调用保持原行为。队列中的自动条目在恢复/重试时使用原目录和搜索会话，保存尝试结果与实际来源；封面更新保留这些字段。实际非网易音频和跨目录网易音频均不能进入原网易数字 ID 下载链；实际网易音频且目录/播放引用一致时沿用既有下载。

## 验证

`server/proxy.automaticPlayback.test.js` 通过真实 HTTP、鉴权、临时 SQLite、注册表、编排和实际 adapters，控制第三方响应。覆盖失败后成功、全部失败、试听/未知、不确定版本排除、来源限制、首个完整版、迟到结果/缓存、总预算、取消、来源超时后下个同源候选及旧契约。

同级 DreamMusic 的 `scripts/check-automatic-playback.mjs` 执行实际 ArkTS 搜索主行点播方法、API、队列、播放器及下载门禁，覆盖超时、切歌取消、恢复原目录和网易回归；Kit 与客户端持久化是受控边界。

真实来源复查：先启动同级 api-enhanced 在 `30325`，再运行 `node --disable-warning=ExperimentalWarning scripts/check-automatic-playback-live.mjs`，浏览器打开 `http://127.0.0.1:30326/` 点播。可用 `LIVE_NETEASE_UPSTREAM`、`LIVE_MUSIC_KEYWORD`、`LIVE_MUSIC_ID`、`LIVE_SAMPLE_PORT` 配置。控制台只打印脱敏结果；Ctrl+C 或 stdin 输入 `stop` 清理临时账户/SQLite。生产来源和客户端受控场景分别记录在同级 `DreamMusic/docs/research/issue-25-validation.md`。
