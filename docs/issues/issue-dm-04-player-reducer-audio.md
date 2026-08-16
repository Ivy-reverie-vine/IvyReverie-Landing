# Issue DM-04 — player reducer + 单例 `<audio>` + 基础控制（Seam C）

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-dreammusic.md`（队列与播放 + Testing Decisions Seam C）

## What to build

DreamMusic 的播放引擎核心，先用 sample song 证明播放路径通，不依赖 API。`playerReducer(state, action)` 纯函数管理状态 `{ queue, currentIndex, isPlaying, mode, level, currentTime, duration }`，action 含 `PLAY/PAUSE/TOGGLE/NEXT/PREV/SEEK/ADD_TO_QUEUE/REMOVE_FROM_QUEUE/CLEAR_QUEUE/SET_MODE/SET_LEVEL/SET_TIME/SET_DURATION`。播放模式三态 `order/single/shuffle`，默认 `order`。边界：空队列 `NEXT`/`PREV` 不越界不崩；最后一首按 mode 处理（order 停、single 循环、shuffle 随机下一首）。单一 `<audio ref>` 挂在 PlayerLayout 顶层，由 `PlayerContext`（Context + useReducer）驱动 `src/play()/pause()`；`timeupdate`/`durationchange` 通过 ref 订阅更新 reducer（不入 Context 避免高频 re-render）。控制条 UI：上一首/播放暂停/下一首 + 进度条（可拖 seek）+ 播放模式切换。用一首 sample 歌曲验证可播可控。本 issue 落地全套 Seam C reducer 测试。

## Acceptance criteria

- [x] `playerReducer` 纯函数，状态/action 如上；不依赖 DOM
- [x] 空队列 `NEXT`/`PREV` 不报错不越界
- [x] 最后一首按 mode 处理：order 停、single 循环、shuffle 随机选一首
- [x] `PlayerContext`（Context + useReducer）暴露状态与 dispatch
- [x] 单一 `<audio ref>` 在 PlayerLayout 顶层，`timeupdate` 用 ref 订阅不触发 Context 高频 re-render
- [x] 控制条：上一首/播放暂停/下一首 + 可拖进度条 + 播放模式切换（三态）
- [x] sample song 可播放、可暂停、可 seek、可切模式
- [x] Seam C 测试覆盖 reducer 全 action + 边界（空队列/最后一首/三态）

## Blocked by

- Issue DM-01（PlayerLayout 空壳）
