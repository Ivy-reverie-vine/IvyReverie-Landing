# 多源音乐真实验收 — 2026-10-04

本次使用真实平台响应，经 NightDream 正式鉴权、调度器和 v2 `mediaRef` 路由测试。账户和数据库独立创建于系统临时目录，不使用用户网易云绑定。音频检查读取前 64 KiB，核对 HTTP 状态、媒体类型与文件签名；封面读取真实图片字节。没有执行整曲离线下载入库，也没有进行 HarmonyOS 真机验收。

## 结果

| 来源 | 音频 | 歌词 | 封面 | 边界 |
| --- | --- | --- | --- | --- |
| 网易云 | 两首样本音频字节通过；罗大佑《童年》浏览器播放的是约 47 秒试听片段；宋小睿样本 API 标记非试听、189.83 秒 | 两首时间戳歌词通过 | 两首真实图片通过 | 本次账户未绑定网易。109530 的 standard/exhigh 均返回 freeTrialInfo，不能算整曲下载成功 |
| 腾讯 / QQ | 宋小睿《童年》通过，浏览器实际播放 | 38 行歌词显示 | 大小封面均加载，300px | 罗大佑《童年》等样本空链接，不能宣称全部曲目可播放 |
| 酷狗 | 《Ode An Die Freude》《欢乐颂》通过，206 audio/mpeg；《欢乐颂》浏览器实际播放 | 两首时间戳歌词通过，浏览器显示 13 行 | 两首真实图片通过，浏览器 400px | 《童年》部分样本无链接，上游匿名解析返回 errcode 20028 |
| Audius | QJpGKw 通过，浏览器实际播放 | 当前来源没有提供歌词能力；返回 501，页面明确提示 | 默认节点证书错误，使用 API 声明的镜像后通过，480px | 0X2o9 样本在复测时出现内容节点连接失败/超时，另一次封面复查返回 200；稳定性未通过 |
| 酷我 | 未通过 | 未进入此阶段 | 未进入此阶段 | 搜索上游 HTTP 200 但业务响应 success=false / The request is illegal!；正常 HTTPS 与主页会话复查仍被拒绝 |

酷我仍需可用的上游接口/服务端会话或上游库修复后复测，不能标记完成。Audius 单曲成功不能代表所有内容节点稳定。

## 本次修复

- Meting 适配器补上歌词能力；本地 sidecar 支持签名 `lrc`、`pic` 请求，详情使用专辑图片 ID 解析真正的图片 URL。搜索不额外逐曲获取图片。
- 无效上游歌曲列表不再伪装成成功空结果，例如酷我的无 ID、无标题记录会返回上游错误。
- Audius 改为同时识别 REST 的 `is_streamable`、`is_downloadable`、`is_stream_gated` 和 artwork `480x480` 等字段，以及原有 SDK 字段；取得播放地址后取消未使用的响应体。
- Audius 封面详情对 API 声明的镜像进行有时限的回退，保留 TLS 校验，不向图片节点发送 API 凭据。
- 正式播放器不再跳过非网易歌词；所有歌曲沿用同一 `mediaRef`。修正封面地址被重复添加 `?param` 的问题，缩略图失败时可重新获取详情。
- 不支持歌词的来源返回 501，与来源不可用 503 分开；页面区分加载中、加载失败、来源不支持和空歌词。

REST 字段核对来源：[Audius 官方 API](https://docs.audius.co/api/)。SDK 对象字段与 REST 响应字段不同，旧 fixture 使用 SDK 字段，未覆盖真实响应。

## 证据与复现

- [首轮真实 API 结果](evidence/music-sources-live.json)：保留失败，不覆盖历史证据。
- [网易云与 Audius 复测](evidence/music-sources-live-followup.json)。
- [酷狗两首成功样本](evidence/music-sources-kugou.json)。
- [酷我最终失败记录](evidence/music-sources-kuwo.json)：脚本退出码 1，未误报通过。
- [网易云试听限制复核](evidence/music-sources-netease.json)：额外记录 freeTrialInfo 是否存在、实际音质与媒体时长。
- [腾讯浏览器截图](evidence/tencent-playing.png)：`paused=false`、`readyState=4`，进度从 24.09 秒推进至 58.98 秒，时长 189.79 秒；两张封面自然宽度 300，歌词列表 38 行。
- [Audius 浏览器截图](evidence/audius-playing.png)：`paused=false`、`readyState=4`，18.18 秒，时长 192 秒；两张封面自然宽度 480；明确显示来源未提供歌词。
- [酷狗浏览器截图](evidence/kugou-playing.png)：`paused=false`、`readyState=4`，21.27 秒，时长 62.68 秒；封面自然宽度 400，歌词列表 13 行。
- [网易云浏览器截图](evidence/netease-playing.png)：检查时 `paused=false`、`readyState=4`，23.60 秒，音频时长仅 46.77 秒；封面自然宽度 1500，歌词列表 43 行。API `time=46811`、`freeTrialInfo.start=0/end=47`，完整歌词并不代表音频为完整版。

运行 `node scripts/verify-music-sources.mjs`。先启动 `api-enhanced`，否则网易云测试会记录连接失败。支持 `VERIFY_SOURCES`、`VERIFY_KEYWORD`、`VERIFY_REPORT`、`VERIFY_PORT`、`VERIFY_METING_PORT`；`--serve` 提供隔离正式播放器，输入 q 或 Ctrl+C 清理测试数据库和服务。

自动化：38 个测试文件、187 项通过；`npm run build` 通过；`git diff --check` 通过。回归新增用例先复现了 REST 字段错误、歌词缺失、封面 URL 损坏与镜像失败，再验证修复。

所有结果只对应上述样本和本次网络环境。测试服务和浏览器试听已停止。没有提交或推送代码。
