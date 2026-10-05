# HarmonyOS 媒体传输兼容层

媒体代理是针对已确认的 AVPlayer 直链传输失败样本提供的可选兼容层，不是默认下载代理。默认关闭；关闭时 `/song/url/v1` 继续返回原始短时直链。

## 配置

```powershell
$env:MEDIA_PROXY_ENABLED='true'
$env:MEDIA_PROXY_SECRET='<stable-server-secret>'
$env:MEDIA_PROXY_TTL_MS='30000'
$env:MEDIA_PROXY_TIMEOUT_MS='15000'
$env:PUBLIC_BASE_URL='https://music.example.com'
```

启用后，NightDream 将播放 URL 替换为：

```text
/dreammusic/media/stream/<short-lived-signed-reference>
```

引用只包含随机 ID、用户 ID、过期时间和签名；真实上游 URL 只保存在服务端内存。媒体请求支持客户端 `Range`/`If-Range`，并转发 `206`、`Content-Type`、`Content-Length`、`Content-Range`、`Accept-Ranges`、`ETag` 和 `Last-Modified` 等必要响应头。

媒体代理不记录 Cookie、Token、签名、完整上游 URL 或响应正文。引用过期、签名错误、上游超时和上游 HTTP 错误分别返回受控错误；本地音乐、队列、账户会话和下载任务不经过此链路。

指定 Bilibili BV/CID 播放复用此代理，必须启用后才返回播放地址。来源提供的 Referer/User-Agent 留在服务端引用内；Range/If-Range 在重定向后继续生效。`MEDIA_PROXY_TIMEOUT_MS` 约束连接和传输空闲时间，持续传输不按整段响应耗时切断；客户端断开会取消上游并记录 `media_client_cancelled`。详见 [指定分 P 播放](bilibili-playback.md)。
