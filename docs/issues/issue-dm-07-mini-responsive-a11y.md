# Issue DM-07 — 底部 mini 条 + 响应式 + a11y 收尾

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-dreammusic.md`（mini 条 + 视觉响应式 + a11y）

## What to build

DreamMusic 的收尾切片：底部 mini 播放条 + 全响应式 + 无障碍收尾。`MiniBar`：当焦点不在主播放视图时（如 `SearchOverlay` / `PlaylistDetail` 打开）底部显示精简控制（小封面 + 歌名 + 播放/暂停 + 进度条），点 mini 条回到全屏 NowPlaying。响应式：桌面 1440/1920 两栏舒展；窄屏（≤768px）两栏折叠为单栏，左栏变抽屉（汉堡按钮调出），mini 条适配窄屏。a11y：播放/上一首/下一首/搜索等按钮带 `aria-label`；歌词滚动区可读（语义化 + 可聚焦）；错误提示用 `role="alert"`。整体色板复核（无越界色值），粒子背景在播放器内降为移动端量级（≤600）不抢内容。

## Acceptance criteria

- [x] `MiniBar` 在搜索浮层/歌单详情打开时显示精简控制（小封面+歌名+播放+进度）
- [x] 点 `MiniBar` 回到全屏 NowPlaying
- [x] 焦点在主播放视图时不显 `MiniBar`
- [x] 桌面 1440/1920 两栏舒展
- [x] 窄屏（≤768px）两栏折叠为单栏，左栏变抽屉（汉堡调出），无横向滚动
- [x] mini 条窄屏适配
- [x] 播放/上一首/下一首/搜索等按钮带 `aria-label`
- [x] 歌词滚动区语义化可读，错误提示 `role="alert"`
- [x] 色板严格遵循 Landing 五色 + 主粉/深紫，无越界
- [x] 播放器内粒子背景降密度（≤600）不抢内容
- [x] Seam A 测试：mini 条显隐、窄屏无横向溢出、关键按钮 aria-label 存在

## Blocked by

- Issue DM-05（搜索浮层，决定 mini 条触发时机）
- Issue DM-06（主界面，决定两栏折叠基准）
