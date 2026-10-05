# 手动选择其他录音（DreamMusic #29 / T10）

沿用 `/dreammusic/api/v2/song/url/v1`，传 `manual=other`、所选具体分 P 的 `mediaRef`、原曲 `catalogRef` 和所属用户的 `searchSession`。同录音选源仍用 `manual=true`，两者不能互相代替。

自动回退结束时，服务端将具体的手动候选快照绑定在搜索会话与原目录上。仅含 BV 的搜索提示不能点播；客户端不能用自造引用或其他目录/用户的候选绕过归属检查。会话仍沿用已有 15 分钟期限，不新增永久匹配存储。来源禁用、熔断、并发上限、超时、取消和媒体代理继续有效。

明确选择后只请求该资源的最新详情和 playurl，不静默回退。返回的 `mediaRef/catalogRef/playbackRef` 均为所选资源，`lyricsRef/lyricsSource` 为空；`manualSelection.originalCatalogRef` 只表达授权上下文，不能当作收藏或歌词身份。`manualSelection.entry` 提供所选分 P 自己的标题、署名、专辑/视频名、封面和时长，UP 主仅保留在资源上传者字段中。原自动拒绝原因及匹配证据仍保留，没有因人工接受升级成已验证同录音。

音频完整性按所选分 P 自己的时长独立判断：例如 100 秒 MV 对应 90 秒原曲，MV 音频为 100 秒且有非试听证据才可判 full；30 秒试听或未知证据继续保留 preview/unknown。录音选择不修改完整性分类，DreamMusic 仍只将 full 且 URL 非空的结果送到播放器。

DreamMusic 的失败/来源面板先展示候选的版本提示、Bilibili 来源、分 P、视频名、拒绝/额外片段原因及完整性状态，再通过“选择候选”与“确认播放此独立曲目”触发解析。创建新瞬态队列身份，仅原位替换当前项，播放从零开始，不沿用原曲收藏或网易下载。重复的本地音轨条目也只替换当前项。搜索重新点播原曲继续自动解析。

本票候选尚无适配歌词，因此统一清空旧同步状态并显示暂无歌词，不请求原曲歌词、不猜测对白/MV偏移；迟到歌词结果仍受切歌 token 限制。

复现：

- NightDream：`npm test -- --run server/proxy.otherRecording.test.js`，实际鉴权 HTTP/SQLite/适配器业务，第三方 HTTP 回复受控。
- DreamMusic 完成 API23 HAP 编译后：`node scripts/check-other-recording.mjs --record`，实际编译控件回调 → ArkTS 播放/队列/歌词/API → 实际网关。
- 实际网易上游在 `127.0.0.1:30325` 运行时：`node scripts/check-other-recording.mjs --live --record`；可通过 `LIVE_NETEASE_UPSTREAM/LIVE_MUSIC_KEYWORD/LIVE_MUSIC_ID` 指定样本。第三方请求使用真实网络，Kit 媒体和 ArkUI 渲染边界仍受控。真实音频 unknown 会按生产规则拒绝，不提供验收绕过按钮。

完整证据在 DreamMusic `docs/research/issue-29-validation.md`；真实来源整曲、原生布局/触摸与设备音频仍属 G8。
