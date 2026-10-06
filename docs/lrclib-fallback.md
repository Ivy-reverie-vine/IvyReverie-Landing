# T12：原目录 → LRCLIB 歌词回退

对应 DreamMusic [#31](https://github.com/Ivy-reverie-vine/DreamMusic/issues/31)，2026-10-05。
沿用 [原目录歌词契约](catalog-lyrics.md) 与 NightDream 唯一入口；v1 和仅传 mediaRef 的旧调用保持原协议。

## 查询与匹配

`GET /dreammusic/api/v2/lyric/new?catalogRef=...&playbackRef=...` 先请求原目录提供方。
原目录有适配的同步或普通文本、或明确纯音乐时直接返回；缺失、失败、不支持或跨资源时间轴不适配时再查公共 LRCLIB。
不增加音频平台歌词分支，不需要部署或克隆 LRCLIB。

元数据取当前账户有效搜索会话的原目录条目，否则请求该原目录自身详情，保留来源并发/熔断控制。
客户端传入的歌名、视频标题、UP 主、Cookie 和实际音频 ID 都不作为 LRCLIB 参数；Bilibili 目录不冒充音乐录音元数据。
使用 `track_name/artist_name/album_name/duration`（秒）先 `/api/get`，未命中或候选不适合再 `/api/search`。
两种返回均按既有 `sameRecording` 保守策略复核标题、歌手、专辑、版本及有效时长；差值最多 2 秒且不超过较短时长的 1%。
多名歌手无法严格对应、版本不确定或元数据缺失时拒绝自动使用；搜索中多个有效 ID 保留歧义，不取第一条。
搜索最多检查 100 项；这不是中文曲库覆盖率承诺。

官方 API：[LRCLIB 文档](https://lrclib.net/docs)，[维护者 API/匹配说明](https://github.com/tranxuanthang/lrclib/blob/main/ARCHITECTURE.md)。

## 状态、时间轴与缓存

LRCLIB get/search 合用 5 秒预算，最多 8 个并发；原目录请求最多 5 秒，额外详情最多 2 秒。
这条独立歌词链不阻塞音频解析和起播。客户端切歌/HTTP 断开会取消全部后续请求；忽略取消的迟到回复也不能进入缓存。

`lyrics.catalogStatus` 保留原平台状态，`fallback` 增加 implemented、attempted、status、reason；`retryable` 标识可重新请求。
最终歌词仍区分 available、instrumental、missing、timeout、failed、unavailable、cancelled。
原目录失败加 LRCLIB 未命中不冒充完整查无结果；有可读原静态词时，LRCLIB 升级失败仍保留原文并允许重试。

命中时 `lyricsSource=lrclib`，`lyricsRef` 为 LRCLIB 实际 ID 的版本化引用；目录与音频引用保持原义。
`textType` 保存 plain/synced/instrumental。同步文本至少有两个合法、顺序正确且在时长内的时间标签，加严格录音元数据匹配，且实际音频正是原目录资源时才 trusted。
跨资源音频（含 MV）、非法/不充分时间标签及普通文本均 uncertain，禁止自动高亮和滚动；不猜偏移。
明确纯音乐才显示“纯音乐，无歌词”，成功未命中显示“暂无歌词”，失败/超时可重试。

LRCLIB 缓存只保存匹配后的提供方内容（15 分钟、最多 256 项），每个响应重新判断与实际音频的关系。
两端客户端按目录与音频隔离缓存；失败及可重试的静态升级结果不缓存。歌词重试只重发歌词请求，不重启音频。

## 复现与证据

- `npm test -- server/proxy.lrclib.test.js --maxWorkers=2 --minWorkers=2`：实际 HTTP、鉴权、SQLite、注册表与提供方适配器，第三方回复受控。
- `npm test -- src/dreammusic/api.test.ts src/dreammusic/NowPlaying.test.tsx`：显示状态、来源、重试、播放状态与进度保留、缓存隔离。
- `cd ../DreamMusic; node scripts/check-catalog-lyrics.mjs`：实际 ArkTS API/队列/歌词状态与 Hvigor 编译组件，先构建 HAP。
- `node --use-env-proxy scripts/check-lrclib-live.mjs docs/lrclib-live-2026-10-05.json`：临时网关与公共 LRCLIB；按主机网络配置环境代理。脚本退出清理临时 SQLite。

真实样本记录见 [JSON](lrclib-live-2026-10-05.json)：《七里香》同步歌词命中（817ms 公共 API）；合成不存在条目 get 404/search 空；Rick Astley 与《晴天》均在 5 秒预算内超时。
另一次直接公共 API 探测取得 Rick Astley 同步与普通文本字段，但未用它替换上述业务请求超时记录。
本轮没有真实仅普通文本或纯音乐命中样本；对应行为由受控 HTTP/客户端用例验证。少量样本不代表曲库覆盖率。

浏览器生产 NowPlaying 组件截图：[同步](assets/issue31-synced-desktop.jpg)、[静态](assets/issue31-static-desktop.jpg)、[失败与重试](assets/issue31-retry-mobile.jpg)。
浏览器仅验证歌词 UI（受控第三方、临时无有效音频的测试条目），不宣称真实媒体 playing/进度或鸿蒙原生布局验收。

## 2026-10-06：T15真实回退补充

原目录搜索缺少时长/元数据时，不直接拿不完整搜索快照查询LRCLIB；补取该引用自身详情并核对ID。网易`{"t":-1,"c":[...]}`作词/作曲元数据头无正文时归missing，保留真实正文后再决定是否回退。真实样本：网易1465951→LRCLIB25549173 plain；网易2673931252仅元数据头→LRCLIB34577799 synced；网易36578812空词→真实get404/search无匹配。三者都有实际音频、生产组件状态及浏览器进度，见DreamMusic `docs/research/issue-34-validation.md`；以上章节保留T12原契约与历史受控样本边界。
