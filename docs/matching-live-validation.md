# T15 / DreamMusic #34：真实匹配播放采样

2026-10-06（Asia/Shanghai）。**当前验收未完成，DreamMusic #34保持OPEN。** 不修改父#19、来源生产默认开关、匹配/完整性规则或下载入库边界。

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

三平台聚合、普通网易完整音频、真实试听进入B站回退、原平台同步歌词、本轮受控410恢复通过。实际完整样本89.07068秒播放结束，完整GET3565236字节、FFmpeg解码通过。

B站一次风控只返回v_voucher，另一次搜索得到五个分P且全部manual；手动确认实际候选BV1KR4y1w7A3:723641888后仍为unknown，未进入解码。没有真实B站自动成功、手动完整音频或LRCLIB仅普通文本的完整浏览器链路。三个LRCLIB同步命中与合成未命中只按其受控边界记录。

对应回归3文件/34项、TypeScript/Vite build通过。详细逐场景PASS/PARTIAL/BLOCKED/NOT EXECUTED及本轮截图见DreamMusic仓库`docs/research/issue-34-validation.md`。关键真实场景缺失，必须保持#34 OPEN。
