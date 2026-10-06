# DreamMusic #35 鸿蒙真机验收记录入口

2026-10-06（Asia/Shanghai）。本轮当前签名 HAP 安装到 MIA-AL00 / API24；代理采集真实三平台搜索、同录音分组、网易完整播放与下载入库、网关断连后本地冷启动播放、后台和锁屏暂停/恢复。其余跨源、手动候选、歌词、URL恢复、非网易下载边界由用户明确确认“整张 #35 的全部场景”实机通过。分项证据和人工/自动边界见 DreamMusic `docs/research/issue-35-validation.md`，不把 #34 浏览器记录作为原生验收。

`docs/evidence/issue35-device-live.json` 来自现有真实来源隔离网关；`docs/evidence/issue35-native-gateway.json` 来自 HAP 经过只读中继的实际请求。没有注入第三方响应，媒体链仍为生产代理与真实 AVPlayer。

## 重复采集

先按 `matching-live-validation.md` 启动独立 api-enhanced 与现有真实来源隔离入口，使用单独报告，避免覆盖旧轮次：

```powershell
$env:LIVE_MATCHING_REPORT='docs/evidence/device-new-run.json'
node --disable-warning=ExperimentalWarning scripts/check-matching-live.mjs
```

另开终端启动透明中继：

```powershell
$env:DEVICE_GATEWAY_REPORT='docs/evidence/device-new-native.json'
node --check scripts/record-device-gateway.mjs
node scripts/record-device-gateway.mjs
hdc rport tcp:5187 tcp:5188
```

在当前 HAP 的设置中增加临时 `http://127.0.0.1:5187` 服务器，通过现有 UI 登录临时测试账户。真实网易下载场景由用户在网易 App 扫码确认绑定；不生成虚假绑定。

网关媒体 URL 使用其独立随机监听端口，还需为该端口建立 `hdc rport tcp:<gateway-port> tcp:<gateway-port>`；端口可从运行 `check-matching-live.mjs` 的 Node 进程的监听连接查询。本轮为62662，新轮次以实际端口为准，不能照搬旧值。

中继可通过 `DEVICE_GATEWAY_UPSTREAM` 和 `DEVICE_GATEWAY_PORT` 指定回环 HTTP 上游/本地端口。它原样转发请求与响应；仅以白名单保存版本化音乐响应的公开身份、分组、状态与耗时。认证请求仅保存路径、HTTP状态和耗时；请求体、查询字符串、请求/响应头、歌词正文、URL和凭据均不保存。截图应限于本应用和系统媒体卡，不保存二维码或登录输入。

结束时 Ctrl+C 停止中继；向现有入口 `/test/shutdown` 发 POST 清理侧车/临时数据库；停止本轮独立上游；移除本轮 rport，退出手机临时账户并恢复原服务器。保留应用当前 HAP，清理本轮临时样本，避免影响热点连接和原有音乐。

中继的 JS 语法检查和实际 HAP 请求通过；本票未修改业务规则或生产来源开关，未重复 #34 已完成的全量测试，不关闭父 #19。
