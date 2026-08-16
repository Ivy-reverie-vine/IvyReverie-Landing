# Issue DM-01 — 路由脚手架 + start dream 联动 + 播放器空壳 + Vite proxy（tracer bullet）

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-dreammusic.md` · CONTEXTS `docs/CONTEXTS-dreammusic.md`

## What to build

把现有单页 Landing 升级为多路由站点并打通播放器入口。新增 `react-router-dom` v6，`App` 用 `BrowserRouter` + `Routes`：`/` 渲染现有 Landing，`/dreammusic` 渲染 `DreamMusic` 播放器空壳。Landing 的 `start dream` 按钮从死链接 `href="#"` 改为跳转 `/dreammusic`。`/dreammusic` 的空壳是一个延续深空调性的 `PlayerLayout`：深黑背景 `#05070F` + 极轻 radial-gradient、顶部栏（标题 `DreamMusic` + 搜索按钮占位 + 用户态占位）、两栏空骨架（左栏列表区 + 右栏播放区），暂无功能。同时给 `vite.config.ts` 加 `server.proxy`：`/api` → `http://localhost:3000`（rewrite 去掉 `/api` 前缀），让后续 API 调用绕过 CORS。Landing 的粒子/Logo/导航保持不变。这是 tracer bullet：让后续所有播放器切片站在能跑的路由 + 空壳 + proxy 上。

## Acceptance criteria

- [x] `react-router-dom` v6 已安装并接入；`/` 渲染 Landing（原有内容不变），`/dreammusic` 渲染 `DreamMusic` 空壳
- [x] Landing 的 `start dream` 按钮点击跳转到 `/dreammusic`
- [x] `/dreammusic` 渲染 `PlayerLayout` 空壳：深空背景 + 顶部栏 + 两栏空骨架，延续 Landing 调性
- [x] `vite.config.ts` 加 `server.proxy`：`/api/*` → `http://localhost:3000/*`（rewrite 去前缀）
- [x] 现有 Landing 测试仍通过；新增路由测试：`/` 与 `/dreammusic` 均可渲染
- [x] `npm run build` 通过

## Blocked by

None — can start immediately.
