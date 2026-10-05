# T11：原目录歌词与音频来源解耦

对应 DreamMusic [Issue #30](https://github.com/Ivy-reverie-vine/DreamMusic/issues/30)，2026-10-05。

## 请求与身份

`GET /dreammusic/api/v2/lyric/new?catalogRef=<原目录>&playbackRef=<实际音频>`。
可同时传 `mediaRef`，但必须等于 `catalogRef`；非法或冲突引用返回 400 `INVALID_MEDIA_REF`。
省略 `playbackRef` 时默认原目录资源。只带旧 `mediaRef` 的调用和 v1 保持原协议。

请求仍经过会话/API Key、账户状态和白名单检查。原目录引用决定唯一歌词 adapter 及该平台自己的 ID。
实际音频引用只用于判断时间轴关系，不用于歌词查询；遗留 id/source、音频引用、客户端 Cookie 等不会被转发到提供方。
即使音频来自 QQ、酷狗或 Bilibili，也不会把该音频 ID 填进网易歌词接口。

## 响应

正常业务结果均为 HTTP 200 / `code:200`，保留 `lrc.lyric`、`yrc.lyric`。
返回 `catalogRef`、`playbackRef`、`lyricsRef`（本票等于原目录），成功内容或纯音乐的 `lyricsSource` 为实际提供方；没有内容时为空，尝试的平台另记 `lyrics.catalogSource`。

| `lyrics.status` | 含义 |
| --- | --- |
| `available` | 存在可读文本，不代表时间轴可信 |
| `missing` | 提供方成功返回空内容；不推断纯音乐 |
| `instrumental` | 提供方明确 `nolyric:true` 或 `instrumental:true`；同步返回 `nolyric:true` |
| `unsupported` | 原平台未提供歌词能力 |
| `unavailable` | 原平台关闭、缺配置、并发受限或熔断 |
| `timeout` | 超过来源配置与 5 秒上限的较小预算 |
| `failed` | 请求/提供方业务失败，包括绑定限制；不全局登出或自动换歌词平台 |
| `cancelled` | 请求取消；HTTP 断开时不再写响应 |

`lyrics.timeline` 为 `trusted` / `uncertain` / `none`。
只有实际音频与目录引用指向同一个具体资源、且提供方返回时间标签时，本票按该资源自身时间轴使用。
不同资源即使同录音匹配成立也保持 `uncertain`；纯文本同样静态显示，不自动猜偏移。
`lyrics.reason` 区分 `same_resource`、`audio_relation_unverified`、`plain_text` 和失败原因。

`lyrics.fallback={provider:'lrclib',implemented:false,eligible:...}` 留出后续状态；缺失、错误或跨资源不适配可以回退，纯音乐及取消不需要。
本票不请求 LRCLIB，也不声称穷尽其他歌词平台。成功原平台内容直接返回。

## 生命周期与客户端

歌词请求独立于音频解析/起播。使用原有来源开关、并发槽、熔断和脱敏诊断；取消不计提供方故障，并释放槽位。
断开会取消上游信号，Meting 的迟到或取消结果不能写进资源缓存。

HarmonyOS/Web 均按原目录请求、实际音频引用判断同步。正文来源与音频来源分别保存。
跨资源/纯文本显示静态歌词，禁止高亮与自动跟随；明确纯音乐、空结果、不支持、超时及加载失败分别提示。
HarmonyOS 系统桌面歌词只接收可信时间轴；静态歌词不会被打包成伪同步 LRC。
切歌取消 HTTP 请求并清空显示；同目录切源或自动重解析产生新音频时重新加载、旧成功/失败无权覆盖。
客户端缓存按服务端、账户、目录与音频引用隔离，失败结果不缓存。Meting 可以复用目录文本，时间轴结论每次按本次关系重新计算。

## 复现

- `npm test -- server/proxy.catalogLyrics.test.js`：实际 HTTP/Express/鉴权/临时 SQLite/来源注册表与 adapter，仅第三方 HTTP 受控；搜索→QQ 完整音频→网易目录取词，另覆盖 Bilibili 音频关系、纯文本/空/纯音乐/失败/超时/取消/禁用/不支持。
- `npm test -- src/dreammusic/NowPlaying.test.tsx src/dreammusic/MediaIdentity.test.tsx`：Web 显示状态、时间推进、换源、切歌、AbortSignal 与迟到结果。
- `cd ../DreamMusic; node scripts/check-catalog-lyrics.mjs`：真实 ArkTS API/队列/播放器/歌词连接同一网关；执行 Hvigor 编译的 NowPlayingPage 歌词显示和跟随方法。先构建 HAP 生成组件缓存。
- `node scripts/check-desktop-lyrics.mjs`：系统歌词的可信内容发布与静态内容撤回。

上述边界替身不代表真实来源整曲、浏览器音频解码或鸿蒙原生布局/触摸/后台能力验收；这些仍属于总规格 G8。
