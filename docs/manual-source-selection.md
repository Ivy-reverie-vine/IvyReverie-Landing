# 当前队列条目的同录音来源选择（DreamMusic #28 / T09）

在现有 `GET /dreammusic/api/v2/song/url/v1` 上传入：

- `manual=true`：只解析指定候选，不进行自动回退。
- `mediaRef`：所选音频的具体引用，客户端不拼接平台 URL。
- `catalogRef`：原目录引用，作为展示、收藏及歌词身份。
- `searchSession`：所属用户的聚合搜索会话；候选须在原目录分组内，并再次通过 `sameRecording` 判定。原目录自身允许重试。

第一阶段仅接受网易、QQ、酷狗已确认的同录音候选。未知录音和 Bilibili 人工确认入口属于后续 T10；不能用此参数绕过其判断。

返回 `mediaRef/catalogRef/lyricsRef` 保留原目录，`playbackRef/playbackSource` 指向用户指定音频，`lyricsSource` 仍为原目录平台。`audioIntegrity` 原样保留：`preview/unknown/unavailable` 不能作为成功播放；DreamMusic 只在 URL 非空且 `full` 时送入播放器。

候选不属于同录音分组返回 `INVALID_SOURCE_SELECTION`；外部用户、过期会话返回 `INVALID_SEARCH_SESSION`；禁用、熔断或并发饱和返回 `SOURCE_UNAVAILABLE`。失败后可重试同一候选或重新选择；不会静默请求其他平台。HTTP 断开取消提供方请求，取消不计入来源失败。

选择、候选快照和会话只保存在 DreamMusic 当前队列 Track 上，不新增永久绑定或收藏实体。搜索重新点播创建新条目，恢复自动解析。队列切换/再次选择使旧请求失效，原网易下载完成也须通过原请求和音频引用校验才能原位替换。

复现：在 NightDream 运行 `npm test -- --run server/proxy.manualPlayback.test.js`；在 DreamMusic 完成 API 23 `assembleHap` 后运行 `node scripts/check-manual-playback.mjs --record`。后者执行 Hvigor 编译的实际控件回调及 ArkTS 业务逻辑，ArkUI 渲染、Kit 音频和第三方提供方响应为受控边界；不是原生布局、触摸或真实来源音频证明。
