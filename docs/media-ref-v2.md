# 版本化 mediaRef 播放契约

## 目标

`/dreammusic/api/v2` 为跨音乐源播放提供稳定的来源中立契约。客户端不再把网易云数字 ID 当作所有来源的统一主键；v1 接口和旧客户端行为保持不变。

## mediaRef

`mediaRef` 是服务端生成的 base64url 编码、版本化不透明引用，当前载荷为：

```json
{
  "version": 1,
  "source": "audius",
  "sourceId": "track-id",
  "kind": "song"
}
```

客户端只保存并回传完整 `mediaRef`，不得自行拼接 `sourceId`，也不得把来源凭据或直链写入引用。服务端按 `source` 选择已启用 adapter，并由单一来源完成详情、播放链接和歌词请求。

## v2 接口

- `GET /dreammusic/api/v2/search?keywords=...`：返回 `data[]`，每项包含 `mediaRef`、标题、艺人、专辑、时长和来源信息。
- `GET /dreammusic/api/v2/song/detail?mediaRef=...`：返回该引用的标准化详情。
- `GET /dreammusic/api/v2/song/url/v1?mediaRef=...`：返回该引用的短时播放 URL；启用媒体代理时返回代理 URL。
- `GET /dreammusic/api/v2/lyric/new?mediaRef=...`：返回该引用的歌词响应。

除搜索外，其余 v2 音乐请求必须携带 `mediaRef`。无效或缺失引用返回 400；来源未启用或不支持能力时返回 502。v2 音乐搜索和播放不要求用户绑定网易云账号，但仍要求登录 DreamMusic 账户。

## 当前边界

普通在线音乐仍是瞬态播放，不进入本地 SQLite。现有本地替换/下载链路只对带网易云数字 ID 的兼容结果运行；Audius、Meting 等非网易来源播放成功后保持在线播放，不伪装成可离线文件。后续若要支持跨来源本地库，需要单独设计 `source + sourceId` 的数据库迁移和权利校验。

Audius 的授权、`downloadable`、`streamable` 和地区可用性必须在真实来源验收中分别确认，不能把免费 API 额度等同于所有曲目可下载或永久可播放。
