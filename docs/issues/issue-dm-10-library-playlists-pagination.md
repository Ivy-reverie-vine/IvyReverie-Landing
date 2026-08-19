# Issue DM-10 — 我的歌单分页与独立重试

> **Triage**: `ready-for-agent`（主体已实现，重试/绑定集成测试待补）
> **Parent**: `docs/PRD-dreammusic-readonly-library.md`

## What to build

让已绑定用户能够完整读取自己的网易云创建歌单和收藏歌单。歌单列表按页加载，推荐歌单保持可用；任一数据源失败时只影响自己的区域，并提供重试。

## Acceptance criteria

- [x] 已绑定用户通过中间层白名单调用 `user/playlist`，未绑定用户仍返回绑定错误。
- [x] “我的歌单”首次加载显示创建和收藏歌单。
- [x] 超过一页后可以继续加载，不静默丢弃歌单。
- [x] “推荐歌单”和“我的歌单”独立加载、独立错误、独立重试。
- [x] UID 缺失时沿用 `login/status` 回退。
- [~] API、组件测试覆盖分页和空结果；失败重试与绑定守卫集成测试待补。

## Blocked by

None - can start immediately
