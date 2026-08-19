# Issue DM-12 — 我喜欢歌曲完整分批同步

> **Triage**: `ready-for-agent`（主体已实现，部分失败测试待补）
> **Parent**: `docs/PRD-dreammusic-readonly-library.md`

## What to build

让“我喜欢”完整读取网易云返回的歌曲 ID，并按歌曲详情接口的批量上限分批补齐，不再硬编码截断。加载状态、部分失败和重试不应阻塞播放器其它功能。

## Acceptance criteria

- [x] `likelist` 返回的歌曲 ID 不被固定数量静默截断。
- [x] 歌曲详情按批次请求并合并为稳定顺序。
- [x] 批次加载显示进度或明确的加载状态。
- [x] 单个批次失败时保留已成功歌曲并提供重试。
- [x] 空列表显示明确空态，绑定失效沿用 301 流程。
- [~] API 和组件测试覆盖多批次；部分失败和重试测试待补。

## Blocked by

None - can start immediately
