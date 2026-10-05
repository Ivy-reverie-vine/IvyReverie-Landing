# 多源播放组合回归（DreamMusic #33 / T14）

日期：2026-10-06（Asia/Shanghai）。本轮保持来源调度、媒体代理及 v1 契约，补充组合链路验收。

`server/proxy.playbackRegression.test.js` 使用既有真实 Express/认证/临时 SQLite 网关与生产 adapter，控制第三方响应，验证：

- 禁用、并发饱和、熔断同时约束自动换源、手动来源、精确资源恢复及目录歌词；其他来源和绑定后的 v1 网易调用继续可用。
- 手动与恢复结果经过同一媒体代理，Range/206/Content-Range 保持正确；解析 full 与后续媒体 HTTP 410 保持分层。
- 手动与恢复并发时仍遵守 Meting 请求间隔，不绕过来源节流，工作完成归还来源并发计数。

```powershell
npm test -- --maxWorkers=2 --minWorkers=2
npm run build
```

本轮全量 **53 文件 / 327 项通过**，其中新增 HTTP 回归 5 项；TypeScript/Vite build 通过。既有 automatic/manual/otherRecording/playbackRecovery/catalogLyrics/lrclib/mediaProxy/downloadManager 测试继续证明候选匹配、完整性、请求取消、超时、Bilibili 指定分段、原网易下载与传输边界。

客户端实现和 13 个主机检查的验收映射见 [DreamMusic issue #33 验收记录](https://github.com/Ivy-reverie-vine/DreamMusic/blob/master/docs/research/issue-33-validation.md)。客户端修复下载任务合并、封面/入库的恢复凭据保留、恢复中展示对象更新、Ability 销毁取消以及在线列表迟到状态文字。

服务端使用真实测试 SQLite；客户端文件/SQLite 和 HarmonyOS Kit 使用受控边界。没有把主机系统播控或歌词替身视为设备后台/锁屏验收，没有增加跨源离线迁移，也没有以此关闭父 #19。
