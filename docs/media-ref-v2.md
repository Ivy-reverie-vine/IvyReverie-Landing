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

除搜索外，其余 v2 音乐请求必须携带 `mediaRef`。无效或缺失引用返回 400；来源未启用或暂不可用返回 503；来源未提供该能力返回 501（例如 Audius 歌词），不得当作「纯音乐」或触发换源歌词。v2 音乐搜索和播放不要求用户绑定网易云账号，但仍要求登录 DreamMusic 账户。

## T01：兼容扩展的三种身份（2026-10-04）

搜索和详情的每个条目、播放响应顶层及首个音频条目、歌词响应增加以下可选字段，原字段继续保留：

| 字段 | 语义 | 客户端用途 |
| --- | --- | --- |
| `catalogRef` | 用户选定的目录资源引用 | 目录身份、原曲展示与详情/封面查询 |
| `playbackRef` | 实际音频资源引用 | 播放与同资源 URL 重解析 |
| `lyricsRef` | 歌词资源引用 | 独立歌词查询 |
| `playbackSource` | 音频提供方 | 播放来源展示；播放响应为实际解析结果 |
| `lyricsSource` | 歌词提供方 | 歌词公开状态中的来源 |

本切片保持单来源：三个引用均等于已有的具体资源 `mediaRef`，编码仍为 version 1。它建立后续身份分离的消费入口，不意味着跨源匹配、自动换源或歌词时间轴适配已经实现。新客户端遇到未返回新字段的旧 v2 服务端时回退到 `mediaRef`；旧 v2 客户端继续使用原字段；v1 响应不扩展。

每次请求仍以 `mediaRef` 指定具体资源，客户端从相应角色字段取值后回传。资源引用优先于旧 `id`、`ids` 或 `source` 提示，不能被这些参数改写。若请求还携带 `catalogRef` / `playbackRef` / `lyricsRef`，T01 只接受指向同一资源的组合；不同资源返回 400 `IDENTITY_UNSUPPORTED`，不自行匹配或换源。

引用错误额外返回机器可读的 `errorCode`：`MEDIA_REF_REQUIRED`、`INVALID_MEDIA_REF`、`SOURCE_UNAVAILABLE`、`CAPABILITY_UNSUPPORTED`、`IDENTITY_UNSUPPORTED`；HTTP 状态与原有中文提示继续保留。无效版本、资源类型、空来源或空资源 ID 均不可解析。失败或空 URL 不会让 v2 改用其他来源。

HarmonyOS 与 Web 播放状态消费播放身份并显示音频来源，详情消费目录引用，歌词消费歌词引用。迟到封面只补缺失封面；选定目录的标题、歌手和已有封面保持稳定。网易原有下载与本地缓存优先行为继续保留，非网易资源不进入数字 ID 入库链。检查入口见 `server/proxy.identity.test.js`、`src/dreammusic/MediaIdentity.test.tsx` 和 `../DreamMusic/scripts/check-media-identity.mjs`。

单来源演示：运行 `D:\DreamMusic\Start-NightDream.cmd --source api-enhanced`（也可用 `tencent`），登录后在打开的 `/music-test.html` 搜索并试听；页面显示三种引用、原目录信息、实际音频来源及歌词，观察 `playing` 和进度。`--check` 只验证启动前置条件，不能证明真实来源或浏览器已播放。

## 当前边界

普通在线音乐仍是瞬态播放，不进入本地 SQLite。现有本地替换/下载链路只对带网易云数字 ID 的兼容结果运行；Audius、Meting 等非网易来源播放成功后保持在线播放，不伪装成可离线文件。后续若要支持跨来源本地库，需要单独设计 `source + sourceId` 的数据库迁移和权利校验。

Audius 的授权、`downloadable`、`streamable` 和地区可用性必须在真实来源验收中分别确认，不能把免费 API 额度等同于所有曲目可下载或永久可播放。
