# Audius 免费授权来源 POC

Audius POC 使用官方 REST API 的只读能力：`/tracks/search`、`/tracks/{track_id}` 和 `/tracks/{track_id}/stream`。它只在 NightDream 服务端运行，默认关闭，不改变当前 api-enhanced 或 HarmonyOS 客户端行为。

## 配置

```powershell
$env:AUDIUS_SOURCE_ENABLED='true'
$env:AUDIUS_API_URL='https://api.audius.co/v1'
$env:AUDIUS_API_KEY='<server-api-key>'
$env:AUDIUS_BEARER_TOKEN='<server-only-bearer-token>'
```

API Key 和 Bearer Token 都只从服务端环境读取。Bearer Token 绝不进入客户端、普通日志、诊断事件或响应正文；客户端也不提供 Audius Cookie 或任意上游凭据。

## 内部结果

adapter 输出统一歌曲引用，并保留权利信息：

```json
{
  "source": "audius",
  "sourceId": "D7KyD",
  "kind": "song",
  "rights": {
    "license": "CC BY",
    "downloadable": true,
    "streamable": true,
    "streamGated": false
  }
}
```

`downloadable`、`streamable`、`license` 和 gate 状态必须如实传递。免费 API 额度、可免费播放和可下载内容是三个不同概念；在真实来源、授权、地区和内容条款验收完成前，不能以 Audius 搜索成功宣称整个来源可稳定播放或下载。

播放 URL 按来源歌曲 ID 短时缓存，过期后重新请求；不可流式播放的曲目直接返回 `NO_PLAYBACK`，不调用下载任务链路。
