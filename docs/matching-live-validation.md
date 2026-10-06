# T15 / DreamMusic #34：真实匹配播放采样

2026-10-06（Asia/Shanghai）。T15核心真实场景已通过。仅关闭DreamMusic #34，不修改父#19/#35、来源生产默认开关或下载入库边界；完整性及录音证据的修正见`bilibili-fallback.md`。

## 复现

在`D:\DreamMusic\api-enhanced`启动独立上游（保持此窗口运行）：

```powershell
$env:HOST='127.0.0.1'
$env:PORT='30325'
node app.js
```

另一个窗口，在`D:\DreamMusic\NightDream`执行：

```powershell
node --check scripts/check-matching-live.mjs
# 本机需要已安装、支持Chromaprint的ffmpeg和ffprobe；缺引擎仍未知，不会改记full。
ffmpeg -hide_banner -h muxer=chromaprint
$env:LIVE_MATCHING_REPORT='docs/evidence/issue34-new-run.json'
node --disable-warning=ExperimentalWarning scripts/check-matching-live.mjs
# 打开 http://127.0.0.1:5187/server/test-support/matching-live.html
# 输入 q 回车，或用下一条命令收尾
Invoke-RestMethod -Method Post http://127.0.0.1:5187/test/shutdown
```

入口沿用现有隔离验收方式：独立临时SQLite、本地测试账户、生产auth/router/registry/adapters及已有媒体代理。仅开启本次进程的网易/QQ/酷狗/B站，自动预算10000ms、音乐阶段7000ms；Meting侧车为30328、页面为5187，已占用则失败，不复用未知服务。不读取用户的NightDream/data，也不绑定或写入真实第三方账户。服务端全部提供方回复是真实fetch，没有第三方fixture替换。

浏览器共用生产`PlayerProvider`、API、`NowPlaying`与控制条；固定样本不由搜索排名改变：

| 操作 | 目录与目的 |
| --- | --- |
| 播放固定完整样本 | 网易33984241 / Kevin MacLeod / Scheming Weasel (faster version)，真实聚合→automatic→原生playing/ended |
| 验证明确试听与B站回退 | 网易18520488 / Rick Astley；真实试听后才搜索B站。只允许选本次实际返回的具体mediaRef，再明确确认后调用生产manual=other |
| 验证原平台歌词 | 网易2652820720 / Lucky小爱 / 晴天(深情版)，实际条目与歌词来源可追溯；不是搜索词所指的周杰伦录音 |
| 验证真实 LRCLIB 文本 | 网易1465951 / Profoundly in Love with Pandora，原平台真正空词→LRCLIB plain，静态显示 |
| 验证真实 LRCLIB 同步 | 网易2673931252 / Sweet Gene Vincent，仅元数据头→LRCLIB synced，使用可靠时间轴 |
| 验证真实歌词未命中 | 网易36578812 / I Want to Be Straight，真实get404/search无匹配，暂无歌词且音频继续 |
| 重载已过期链接 | 先自动B站成功，等30秒签名到期再点击；cache-busting要求真实HTTP，旧代理404→生产恢复同一资源→新媒体200/playing |

选择候选只保存待确认状态，不发playurl；确认后full才送入生产播放器，unknown/preview/失败保留停止。这个诊断页面验证网关和播放器，不替代HarmonyOS SourceSelection触摸验收。

## 记录与整曲检查

默认覆盖写入`docs/evidence/issue34-live.json`。下一轮可用`LIVE_MATCHING_REPORT`指定另一个文件；上游可用`LIVE_NETEASE_UPSTREAM`指向另一个本地端口。不同报告是分开的执行轮次，不混用失效搜索会话。

`scenarios`保存三平台分组身份及元数据、匹配/完整性、目录/实际/歌词引用、自动总预算与耗时；`http`只保存主机、API路径、状态、耗时和B站风控响应结构。`browser`记录原生playing、每10秒进度、error/pause/ended；`sinceSelectionMs`包含整次操作，`sinceHandoffMs`从URL交给生产播放器起计，第一条playing用于单独测量缓冲。账户/恢复凭据及签名媒体URL不写入报告，媒体路径脱敏。

完整样本已选定后可额外检查整文件（需要本机已有ffmpeg）：

```powershell
Invoke-RestMethod -Method Post http://127.0.0.1:5187/test/full-media/full
```

该端点完整GET最多32MiB、90秒，检查HTTP200、字节数及SHA256，以临时文件运行FFmpeg整文件解码，60秒上限。它不是Range前段探测，也不修改full判断。媒体文件在成功后删除；失败遗留由关闭服务时的唯一临时目录清理。启动/退出码与单样本解码通过**不表示T15全部通过**。

LRCLIB与受控恢复分开运行：

```powershell
node --disable-warning=ExperimentalWarning scripts/check-lrclib-live.mjs docs/evidence/issue34-lrclib-live.json
node --disable-warning=ExperimentalWarning scripts/check-url-recovery-browser.mjs
# 打开 http://127.0.0.1:5186/server/test-support/recovery-browser.html
# 点击“开始受控过期播放”，记录playing与进度；然后关闭
Invoke-RestMethod -Method Post http://127.0.0.1:5186/test/shutdown
```

LRCLIB是真实公共服务，但目录元数据/原平台缺词受控；恢复为受控提供方/410与本地WAV，经真实HTTP及原生浏览器解码。两者不能补记为真实B站自动成功或公开来源自然过期恢复。

## 当前结论

三平台聚合、普通网易完整音频、真实试听→搜索→B站自动匹配、自动拒绝→手动独立整曲、原平台及真实LRCLIB同步/文本/未命中、真实公开音频在代理签名到期后的恢复均已通过。普通样本89.07068秒、手动样本250.6025秒播放结束；自动样本整文件1167163字节、实测PCM212394.75ms。

B站搜索仍可能返回v_voucher，独立失败轮次保留；成功样本经实际搜索发现BV1GJ411x7h7:137649199，并用原目录真实试听的约24秒声音指纹及完整媒体验证自动起播，解析4973ms。手动候选BV1KR4y1w7A3:723641888只有完整媒体解码后才full，没有把“愿意播放”当完整证据。新的真实LRCLIB样本替代早期受控缺词/合成未命中作为最终验收。

全量54文件/335项及后续两个反例的相关4文件/40项、TypeScript/Vite build通过，ArkTS签名HAP/主机检查通过。最终矩阵、分轮JSON及截图见DreamMusic仓库`docs/research/issue-34-validation.md`。Docker daemon未启动，未验证容器构建；未声称真机或父规格完成。
