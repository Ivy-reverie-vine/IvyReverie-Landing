# Bilibili 自动回退（DreamMusic #27 / T08）

日期：2026-10-05。入口继续使用 `song/url/v1?automatic=true&mediaRef=...&searchSession=...`。普通音乐平台取得可靠完整版即返回；平台候选耗尽或阶段预算到期后，才在同一个 10 秒总预算内进入 B 站。指定 BV/CID 点播和旧客户端契约保持兼容。

## 2026-10-06：T15真实验收修正

B站缺试听字段时，可由完整AAC读取与实际PCM解码独立取得完整性证据；目录/提供方/解码时长必须相容，显式试听优先拒绝。读取上限12MiB、解码上限15分钟且受原来源/总等待期限约束；HTTP200或覆盖全部范围的响应仍必须核对字节/完整解码，普通前段Range不能通过。FFmpeg/FFprobe缺失、截断、超限或无法解码仍未知；Docker runtime声明FFmpeg依赖，源码部署须提供引擎。

新增`catalog-preview-chromaprint-v1`，补充下述元数据署名政策：以所选网易条目、经ID核对的明确试听作为服务器内部声音参照，至少150个且足够多样的哈希，依照提供方试听起点最多1秒对齐偏差，平均位差≤4、P95≤8。分P标题须精确对应歌名/歌手，目录/分P时长仍严格匹配，Live/翻唱/Remix/变速/对白/额外片段仍拒绝；只有声音证据通过的普通MV可通过，不把MV标签或官方UP作为录音证明。参照不足/失败保留手动。原试听仅用于录音比对，完整候选另作整文件解码。

使用既有[Chromaprint近似相同音频指纹](https://github.com/acoustid/chromaprint)与[FFmpeg媒体检查](https://ffmpeg.org/ffprobe.html)，上述阈值是本项目的小样本保守策略，不是官方覆盖率承诺。原平台试听URL与原始指纹不下发；响应只含引用、摘要、对齐及位差证据。恢复重新解析相同资源，必须重新完整检查且已验证摘要一致，否则拒绝，不换录音。

真实网易18520488试听→实际WBI搜索发现BV1GJ411x7h7:137649199→约24秒声音对齐/整文件解码→原生playing，4973ms内自动成功；手动候选BV1KR4y1w7A3:723641888完整播放至250.6025秒。对应矩阵与分轮JSON见`matching-live-validation.md`及DreamMusic `docs/research/issue-34-validation.md`。以下2026-10-05章节记录原元数据政策和当时的验收边界。

## 来源与预算

启用条件是 `BILIBILI_SOURCE_ENABLED=true` 与可用的既有媒体代理。默认仍关闭。所有搜索、视频详情、分 P 音频请求都经过注册表的开关、能力、并发和熔断控制，每次超时取来源配置与原始 deadline 剩余时间的较小值。搜索的 nav/WBI 签名、HTTP 正文和详情发现全部消耗这份预算。断开/切歌取消请求，迟到结果不能返回成功或覆盖当前音轨；取消不计熔断失败。

B 站视频发现使用内部 `fallbackSearch` 能力，搜索结果是 BV 提示，不能伪装成可播放歌曲引用。普通公共 `search?source=bilibili` 保持不支持；只有核对 pages 后的具体 BV/CID 才生成歌曲 mediaRef。搜索最多读取 5 个视频，每个最多 20 个分 P，剩余预算不足便结束；未取得 CID 的提示也保留 BV 与失败理由。搜索响应缺失 result（例如风险控制）返回 `BILIBILI_SEARCH_INCOMPLETE`，不冒充无结果。

## 保守录音判定

搜索词来自原目录歌名、歌手和版本标注；时长和版本用于候选判定。搜索排名、视频“完整版”字样、URL 存在、UP 主或播放进度都不能证明同一录音。

`bilibili-credits-v1` 要求原目录满足已有 `metadata-strict-v1`，视频描述只有一份明确歌名/歌手/专辑署名，并提供原目录条目的网易或 QQ 链接；描述明确标注 `音频：原专辑音轨`（或 `audio: original album audio`）。署名与目录严格匹配，具体分 P 标题必须是该歌名或“歌手 - 歌名”，分 P 时长偏差不超过 2 秒与 1% 的较小值。搜索缺 dt 时，只使用所选资源播放尝试中已核对 ID 的提供方详情时长，不借用其他候选时长。酷狗来源链接尚未实现可靠录音关联，保留手动候选。

翻唱、现场、MV、伴奏、Remix、重制、不确定版本、剪辑、额外片段、对白、变速/升降调/环绕、谱例或缺失署名/关联/内容声明均保留为手动候选。该规则是保守的元数据与来源署名证据政策，没有音频指纹识别；不提供关键词推断或首条兜底。多歌署名无法明确关联到分 P 时也不自动通过。

匹配通过才请求指定分 P 音频，并再次检查本次详情的录音证据和原目录时长；沿用 #24 `audioIntegrity`，只有 `full` 才自动成功。B 站实际响应通常缺显式非试听证据，会继续是 `unknown`，不会为了命中率改成 full。受控成功测试的非试听字段是第三方边界 fixture，不能称为本轮真实平台成功。

## 返回和客户端

`playback.bilibili` 返回 `status/reason/query/candidates`。具体候选含 `mediaRef/sourceId/resource(BV、CID、page、视频名、分 P 名、uploader)`、录音判定证据、拒绝理由及取得的完整性证据。尚未读取分 P 的 BV 提示没有 mediaRef。仅具体候选可供后续手动选源；#28 负责选择交互。拒绝匹配的候选不会额外解析音频，完整性尚未检查。

终态继续是 `success/exhausted/timeout/cancelled`。总超时为 `total_budget`，无候选为 `bilibili_no_candidates`，有手动候选为 `bilibili_manual_candidates`；来源、代理、搜索失败保留可识别错误码。成功只更新实际 `playbackRef/playbackSource`，原 `mediaRef/catalogRef/lyricsRef`、显示资料与收藏身份保持。请求头和源直链仍由媒体代理留在服务端；候选不带 URL。ArkTS 保存完整 outcome，在当前队列失败音轨中保留候选；成功显示 Bilibili，非网易音频不进入下载/入库。

## 验证与复查

`server/proxy.bilibiliFallback.test.js` 使用真实鉴权、SQLite、HTTP、注册表、编排、适配器和代理引用，只控制第三方回复；覆盖平台成功不回退、P2 自动成功、手动/未知/试听、无候选、源控制、缺代理、来源中途关闭、迟到与总超时、断开及详情时长补足。真实 ArkTS 消费与切歌检查在同级 DreamMusic `scripts/check-automatic-playback.mjs`；Kit 是替身。

真实网络复查：先在本地启动 api-enhanced `PORT=30325`，再运行 `node --disable-warning=ExperimentalWarning scripts/check-bilibili-fallback-live.mjs`。支持 `LIVE_NETEASE_UPSTREAM` 和 `LIVE_MUSIC_SAMPLES` JSON 数组，每项为 `{ "keyword": "...", "id": "可选原平台ID" }`；未指定 ID 时点播真实搜索的第一条目录条目，日志记录实际身份，不能把搜索词当作已选歌手。脚本创建并清理临时本地账户/SQLite，全部提供方 HTTP 是真实网络，不使用已知 BV，不下载媒体，只输出脱敏证据。

本轮真实网易试听触发 B 站搜索，5 个分 P 候选全部手动；没有真实 B 站自动成功或新链路浏览器/鸿蒙解码证据。完整样本见同级 DreamMusic `docs/research/issue-27-validation.md` 及 `assets/issue27-real-fallback.json`。前置 #26 的指定 BV 播放记录不能替代本轮自动匹配成功。

实现参考：[BBPlayer WBI](https://github.com/bbplayer-app/BBPlayer/blob/master/apps/mobile/src/lib/api/bilibili/wbi.ts)、[搜索请求](https://github.com/bbplayer-app/BBPlayer/blob/master/apps/mobile/src/lib/api/bilibili/api.ts)。本轮 WBI 搜索已通过真实 HTTP；未引入依赖或账号凭证。
