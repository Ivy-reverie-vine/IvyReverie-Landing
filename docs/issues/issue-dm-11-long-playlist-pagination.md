# Issue DM-11 — 长歌单详情分页加载

> **Triage**: `ready-for-agent`（主体已实现，异常场景测试待补）
> **Parent**: `docs/PRD-dreammusic-readonly-library.md`

## What to build

让歌单详情能够完整浏览长歌单。详情页同时读取歌单元数据和歌曲分页，用户可以继续加载后续歌曲，并继续使用播放全部、加入队列和单曲播放。

## Acceptance criteria

- [x] `playlist/detail` 和 `playlist/track/all` 均通过中间层白名单并要求绑定。
- [x] 歌单详情显示名称、封面和歌曲列表。
- [x] 超过单页歌曲数量后可以继续加载，不静默截断。
- [x] 分页加载期间保留已加载歌曲，失败时提供重试。
- [x] 播放全部、加入队列、单曲播放继续作用于已加载歌曲。
- [~] API、组件和播放器交互测试覆盖歌曲分页；元数据失败和更多异常边界测试待补。

## Blocked by

None - can start immediately
