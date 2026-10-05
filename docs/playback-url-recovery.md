# 所选资源 URL 失效恢复（T13 / DreamMusic #32）

日期：2026-10-05，Asia/Shanghai。仅覆盖 G7 的短时 URL 恢复；不代表父 #19 或设备验收完成。

## 协议与边界

可靠完整的 v2 播放解析返回 `recoveryToken`。网关保存用户、目录/实际音频/歌词身份与已授权录音证据；不保存播放 URL。凭据最长 24 小时、最多 1000 项，仅在网关内存有效；重启、淘汰或凭据过期后明确要求重新选择。客户端不写 SQLite 或 localStorage。原来的搜索会话 15 分钟期限不再限制已经选定资源的恢复。

沿用 `/dreammusic/api/v2/song/url/v1?recover=true&mediaRef=<实际播放引用>&recoveryToken=<凭据>`。仍需现有账户认证；用户与具体引用必须匹配。恢复只请求该资源，包括 Bilibili 的原 BV/CID，不重新搜索，不换成其他录音。来源开关、并发、熔断和媒体代理均沿用现有实现。

Meting/Audius 恢复时删除该资源的 URL 缓存；Meting 和 api-enhanced 带新时间戳突破上游 URL 请求缓存。Bilibili 每次重新请求元数据和播放 URL；自动选择的 Bilibili 资源重新通过同录音和无额外片段检查，元数据被改为 Live/MV 等时拒绝恢复。手动其他录音仍保留其独立身份和静态/无同步歌词语义，不把用户选择升级为同录音证据。

客户端媒体错误触发最多两次恢复，单次恢复工作共用 15 秒截止时间（涵盖 HTTP 与媒体准备）；播放成功后可处理另一轮媒体失败，但同一播放选择最多消耗两次自动尝试，用户明确重试可重开预算。恢复保留队列、目录和当前位置，重复 state/error/异常只归一个恢复工作所有。持续失败或凭据无效结束并提供重试/重新选择；切歌、取消或截止时间会销毁旧会话并隔离迟到回调。播放就绪钩子在同次选择最多触发一次，恢复不会重复启动下载。

恢复后重新请求原目录歌词并检查与实际音频的关系，刷新时间轴状态；歌词失败不阻塞播放。不会将 QQ/酷狗/Bilibili 音频送入网易数字 ID 下载链。

## 可复现验证

```powershell
cd D:\DreamMusic\NightDream
npm test -- --maxWorkers=2 --minWorkers=2
npm run build
node scripts/check-url-recovery-browser.mjs
# 浏览器打开 http://127.0.0.1:5186/server/test-support/recovery-browser.html
# 依次操作：开始受控过期播放；持续失效；慢解析后取消播放。
# 验证完成：Invoke-WebRequest -Method Post http://127.0.0.1:5186/test/shutdown

cd D:\DreamMusic\DreamMusic
node scripts/check-url-recovery.mjs --record
```

浏览器复现服务仅本机测试：临时 SQLite/测试账户、受控第三方响应和本地生成的 90 秒 PCM WAV，音频静音；HTTP 旧地址真实返回 410，新地址返回 WAV 并支持 Range。媒体使用独立轮次 URL 与 no-store，避免先前成功响应被浏览器缓存而掩盖持续失败。关闭复现服务后清理其临时 SQLite。

## 证据与结论

- 全量 52 文件 / 322 项通过（限制两个 worker）；首次默认高并发运行有一个既有 200ms 预算时序断言失败，单独复测和完整受限并发运行均通过，未放宽断言。随后 Audius 强制缓存失效与播放器 2 文件 / 10 项通过。
- TypeScript/Vite build 通过。真实 HTTP 恢复测试覆盖存活缓存绕过、搜索会话失效、身份/用户隔离、试听/不可用终态、提供方超时和自动 Bilibili 原证据复查。
- 实际 ArkTS API/队列/PlayerSession 与鉴权 HTTP/媒体字节链路验证初始及播放中失效、12s/23s 断点、双错误去重、两次持续失败、切到本地、总超时及一次就绪/下载钩子；Kit 的解码与设备数据库使用受控边界。
- 原生浏览器生产 PlayerProvider/API 完成 410 → 重解析 → `playing`；`readyState=4`、`paused=false`，观察进度从 0.039s 推进到 33.103s；另一轮样本实际播放至 90s 结束。持续失败发生三次媒体错误（初次加两次恢复），终止并保留所选来源；慢解析中取消后无迟到播放。

验收记录与原生截图位于 DreamMusic 仓库：`docs/research/issue-32-validation.md`、`docs/research/assets/issue32-client-recovery.json`、`issue32-browser-recovery.json`、`issue32-native-recovery.jpg`、`issue32-native-failure.jpg`。

这证明**受控失效**恢复和真实浏览器解码，不是第三方自然过期成功率；没有声称当前鸿蒙真机 AVPlayer、后台或锁屏通过。设备验收必须另行保留失效前后来源、进度及系统播控记录。
