# Issue DM-06 — 主界面：队列 + NowPlaying(封面+逐字歌词+控制+音质) + 歌单详情

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-dreammusic.md`（队列/NowPlaying/歌词/音质/歌单）
> **注意**：本切片由原 06+07+08 合并，是最大的切片，实现中如遇阻塞可拆回三个子 issue。

## What to build

DreamMusic 两栏主界面的完整内容（左栏队列/歌单 + 右栏 NowPlaying）。这是用户日常停留的主视图。

**左栏**（tab 切换）：
- **队列 tab**：当前播放队列列表，当前曲高亮，点任意首切过去播放，可删歌/清空；空队列显占位提示引导去搜索/看歌单。
- **歌单 tab**：调 `personalized(30)` 拉推荐歌单卡片（封面+名），点进 `PlaylistDetail`：调 `playlistTrackAll(id)` 显全部歌曲，支持「播放全部」/「加入队列」/点单首播放，可返回。

**右栏 NowPlaying**：
- 大专辑封面（封面图来自 `songDetail` 的 `al.picUrl`）+ 模糊背景烘托。
- 逐字歌词：调 `lyricNew(id)`，优先 `yrc` 逐字（卡拉OK式高亮当前字），拿不到退 `lrc` 逐行滚动；当前行自动滚到可视区；纯音乐/无歌词显「纯音乐，无歌词」。
- 控制条：上一首/播放暂停/下一首 + 可拖进度条 + 播放模式切换 + **音质切换**（standard/exhigh/lossless 等，默认 exhigh），切音质后重新取链接并续播当前位置。
- 视觉延续深空+粉色调性，主粉 `#EA8BA7` 用于高亮/进度/当前歌词，深紫 `#2A182C` 用于选中。

## Acceptance criteria

- [x] 左栏 tab 切换「队列 / 歌单」
- [x] 队列 tab：当前曲高亮、点切歌、删歌、清空、空态提示
- [x] 歌单 tab：推荐歌单卡片渲染（封面+名），点进详情显全部歌曲
- [x] 歌单详情：「播放全部」/「加入队列」/点单首播放，可返回
- [x] 右栏大封面 + 模糊背景，封面来自 `songDetail` 的 `al.picUrl`
- [x] 逐字歌词 yrc：当前字高亮、当前行自动滚动
- [x] 拿不到 yrc 退 lrc 逐行滚动；无歌词显「纯音乐，无歌词」
- [x] 控制条：上一首/播放/下一首 + 可拖进度 + 播放模式 + 音质切换
- [x] 切音质后重新取链接并续播当前位置
- [x] 视觉延续深空+粉色调性
- [x] Seam A 测试（mock api）：队列渲染/切歌/删歌、歌单卡片→详情、歌词渲染（yrc/lrc fixture）、音质切换触发重新取链接

## Blocked by

- Issue DM-02（api 客户端：lyric/songDetail/personalized/playlistTrackAll）
- Issue DM-04（player reducer + audio + 控制条）
