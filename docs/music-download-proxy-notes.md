# 音乐获取与下游返回注意事项

> 适用：DreamMusic 下载管理、`POST /auth/downloads`、`GET /auth/downloads/:id/file`，
> 以及未来任何“中间层代替浏览器获取音乐文件”的功能。
> 目标：**不要让上游音乐直链直接暴露给浏览器**，也不要让下载行为导致页面跳转。

## 1. 当前架构

```
浏览器
  → POST /auth/downloads         创建下载任务（立即返回，扣 1 梦点）
  → 中间层后台：
      1) 解析直链（download/url/v1 → unblock → qq/kugou/kuwo/migu）
      2) 服务器 fetch 音频文件，流式写入 data/downloads/
  → 浏览器轮询 GET /auth/downloads
  → 文件 ready 后 GET /auth/downloads/:id/file
  → Express res.download() 以 Content-Disposition: attachment 返回
```

这样浏览器始终只和本项目中间层交互，不会跳到 `m801.music.126.net` 等上游域名。

## 2. 鉴权与数据暴露

- 文件接口必须 `requireUser`，且只能获取 `task.user_id === 当前用户` 的任务。
- 外部 API Key 也应遵守同一 owner 规则（`requireUser` 已统一）。
- **绝不能**把 `netease_cookie` 回传给下游。
- **不要**把上游直链放在前端任务对象里；任务对象只返回 `id/status/progress/fileName` 等元数据。
- 日志与审计中不能打印完整 cookie；上游日志已打印时应在代理侧考虑脱敏。

## 3. 上游直链特性

- 网易云/解灰音源直链通常**短时有效**，可能几十分钟到几小时过期。
- 因此拿到直链后应**尽快完成抓取**，不要只保存 URL 以后再取。
- 直链可能要求：
  - 特定 `Referer`（部分 CDN 防盗链）。
  - 特定 `User-Agent`。
  - 跟随 302 跳转（当前 `redirect: 'follow'`）。
- 当前实现统一使用 `User-Agent: DreamMusic/1.0 ...`；如果后续发现某些音源拒绝，需要在 fetch 层按 source 配置 UA/Referer。
- 解灰源（qq/kugou/kuwo/migu）的 URL 可能来自第三方，稳定性差；任务失败必须自动退款。

## 4. 文件抓取

- 必须流式处理：`Readable.fromWeb(res.body)` → `Transform(计数)` → `createWriteStream`。
- 禁止 `arrayBuffer()` 后写文件，否则大文件会打爆内存。
- 建议为上游 fetch 设置超时（例如 30s 连接、5 分钟总时长），避免任务永久卡在 downloading。
- 建议限制并发任务数（例如每用户 2 个、全局 5 个），避免上游风控。
- 文件名必须 sanitize，禁止 `../`、盘符、`/`、控制字符。
- 扩展名应从 Content-Type 或 URL path 推断；不允许 `Content-Disposition` 上游文件名直接决定本地路径。
- 写盘成功后以 `size = received` 为准，不信任 Content-Length。

## 5. 返回给下游

- 使用 `Content-Disposition: attachment`。
- 中文/特殊字符文件名走 RFC 5987：
  `filename*=UTF-8''...`（Express `res.download` 已处理）。
- 设置正确的 `Content-Type`（如 `audio/mpeg`、`audio/flac`）。
- 设置 `Cache-Control: private, no-store`，避免浏览器/中间 CDN 缓存个人文件。
- 文件属于个人资产，禁止 `public` 缓存。
- 下载场景不需要支持 Range；如果未来要在线播放缓存文件，再实现 `Accept-Ranges`。
- 返回前确认 `task.status === 'ready'`；未完成返回 409，不要返回半截文件。

## 6. 计费与退款

- 创建任务即扣 1 梦点，写 `song_download` 流水。
- 任何失败（解析、抓取、超时）都要：
  1. 标记 `failed`；
  2. 退回 1 梦点，写 `download_refund` 流水；
  3. 保证不会重复退款（只有 downloading → failed 时退款一次）。
- “已扣点但无文件”是不可接受状态。

## 7. 存储与清理

- 文件保存在 `DATA_DIR/downloads/task_<id>.<ext>`。
- 需要定期清理：
  - 删除任务时同步删文件。
  - 超过 N 天未访问的 ready 文件可清理。
  - 超出磁盘配额时先删最旧任务。
- 当前未实现自动清理，本地使用需注意磁盘占用。
- 服务重启时 `downloading` 任务会残留，应加启动恢复：标记失败并退款或继续任务。

## 8. 网络与部署

- 浏览器不直接访问上游，因此**站点是 HTTPS 时不会出现 mixed content**。
- 中间层抓取上游时如果上游只有 HTTP，也不影响下游 HTTPS。
- 生产环境不要把这套下载代理暴露成匿名公共代理：必须登录 + 限额 + 限速。
- 公网部署建议限制单文件大小（例如 200MB）和每日下载次数。
- 反向代理（nginx/caddy）应允许 `/dreammusic/api/v1/auth/downloads/*` 的正常下载响应头，不要改写 Content-Disposition。

## 9. 版权与合规

- 仅供个人已授权账号自用，禁止公开分发下载链接。
- 解灰换源涉及第三方平台内容，仍应遵守对应平台条款与当地法律。
- 对外 API 文档应明确“仅个人使用”，不要把 `/downloads/:id/file` 设计成永久公开 URL。
- 管理员生成兑换码/开放下载能力时，建议在公告或用户协议中注明用途。

## 10. 故障排查清单

| 现象 | 优先检查 |
|---|---|
| 任务一直 downloading | 上游 fetch 未设置超时；URL 卡住；进程重启导致任务残留 |
| ready 但文件 404 | 文件被清理/磁盘移动；file_path 与磁盘不一致 |
| 下游文件名乱码 | 是否使用 RFC 5987 filename*；浏览器是否支持 |
| 点下载页面跳转 | 是否误把上游 URL 返回前端；应只给 `/auth/downloads/:id/file` |
| 点数扣了但失败 | 退款逻辑是否执行；是否重复退款 |
| 上游拒绝 | UA/Referer/cookie 是否有效；换源顺序是否正确 |
