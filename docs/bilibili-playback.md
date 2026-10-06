# 指定 Bilibili 分 P 音频（DreamMusic #26 / T07）

日期：2026-10-05。#26 接口仍只解析指定 BV/CID，不下载入库。#27 已新增服务端自动搜索及回退，见 [Bilibili 回退](bilibili-fallback.md)。来源默认关闭，经已有注册表调度并受并发、熔断和开关控制。

## 统一接口

资源 `source=bilibili`，`sourceId=BVxxxxxxxxxx:CID`，仍用已有 `createMediaRef`/v2 `mediaRef`；详情和播放分别走 `/dreammusic/api/v2/song/detail`、`/dreammusic/api/v2/song/url/v1`。客户端不拼接 B 站请求，不提供 Referer/Cookie，不把网易数字 ID 当 B 站资源。

适配器先读取真实视频详情，确认 BV 以及 CID 在 `pages` 中的准确归属；错误 CID 返回 `BILIBILI_CID_NOT_FOUND`，不选首 P。再以同一 BV/CID 请求音频，整个详情及解析共享一个来源超时。只接受 `dash.audio` 的 AAC/MP4（`mp4a.40.2/5/29`），不将 durl 视频或 Dolby 假装为兼容音频。缺音频、格式不支持和提供方拒绝都有明确 errorCode。

详情的 `title/artists/album/durationMs` 与 `resource` 分别保留。`resource` 包含 BV、CID、page、视频名、分 P 名及 uploader；UP 主不进入 `artists`。播放响应继续保留 catalogRef/playbackRef/lyricsRef 和 playbackSource，附加资源时长及 `media`（容器、MIME、codec、DASH 形态、representationId、DASH 时长）。本票选择 B 站自身资源，没有接受任意外部目录与 B 站录音的匹配声明。

`audioIntegrity` 沿用 #24。目录时长来自**选定分 P**，资源时长来自 `timelength`；BV/CID归属、DASH形态、URL可读与前段Range不证明完整。2026-10-06的T15修正增加完整AAC读取、容器检查与实际PCM样本数验证，无试听字段时也可取得独立full证据；无法完成检查仍unknown，显式试听仍拒绝。规则、引擎与边界见[Bilibili回退的T15补充](bilibili-fallback.md)。下方指定BV旧样本的unknown是当时结论，不代替新链路验收。

## 服务端媒体传输

```powershell
$env:BILIBILI_SOURCE_ENABLED='true'
$env:MEDIA_PROXY_ENABLED='true'
$env:MEDIA_PROXY_SECRET='<server-secret>'
$env:PUBLIC_BASE_URL='https://music.example.com'
```

沿用已有 `/dreammusic/media/stream/<short-lived-reference>`。B 站响应要求代理，关闭时明确返回 `MEDIA_PROXY_REQUIRED`，不泄露需要额外协议处理的直链。适配器给出的 Referer 和 User-Agent 仅保存在服务端短时内存，公开响应剥离 mediaTransport；不传账号凭证。代理跟随重定向并转发 Range/If-Range 与媒体响应头。媒体超时现在约束连接和连续空闲时间，持续传输超过该时间仍可完成；客户端中断归为 `media_client_cancelled`。

不持久保存直链，每次播放重新解析。默认签名引用 30 秒、来源超时 8 秒、媒体连接/空闲超时 15 秒，均使用现有配置机制。长时间等待后重试或新的 Range 请求需要未过期引用；过期恢复是后续 G7 的范围，不在本票伪造无限期链接。

## 隔离真实样本

```powershell
node scripts/check-bilibili-live.mjs
```

打开 `http://127.0.0.1:30327/`，输入已知 BV/CID，点击解析，再主动点击播放指定验收样本。夹具使用临时本地账户/SQLite和真实 NightDream 编排、适配器、代理，只启用 B 站；第三方 HTTP 不注入假响应。它在同一个 audio 元素中播放指定样本，并明确显示 `unknown`，此动作仅用于隔离验收，不更改生产完整版门禁。短时媒体引用设置为 120 秒便于人工操作；不是生产默认值。`POST /stop` 或输入 `stop` 可停止服务并清理临时账户/SQLite。

本轮指定 `BV1GJ411x7h7 / CID 137649199 / P1`，资源时长 212393ms，浏览器 duration=212.393833s，进度 19.113146 → 61.641203 → 105.758588s，paused=false、readyState=4、error=null；随后主动暂停。完整性 `unknown/missing_evidence`，未测完整播放完毕，也没有证明同网易目录是同一录音。

多分 P、错误 CID、空音频和格式/身份错误通过受控提供方 HTTP 边界覆盖；媒体重定向、Range/请求头与媒体失败通过实际本地 HTTP 服务覆盖。真实样本是 P1，不将受控 P2 冒充真实 P2，也不宣称鸿蒙 AVPlayer 解码、后台/锁屏通过。

参考已有 [BBPlayer 音频解析实现](https://github.com/bbplayer-app/BBPlayer/blob/master/apps/mobile/src/lib/api/bilibili/api.ts)，本票使用实际验证可用的 `/x/player/playurl` 和严格 CID 归属；没有复制其宽松 durl 回退策略。截图、客户端主机检查和完整验收对照见同级 DreamMusic `docs/research/issue-26-validation.md`。
