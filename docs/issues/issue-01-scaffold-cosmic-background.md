# Issue 01 — 项目脚手架 + 宇宙背景 + 测试管线（tracer bullet）

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-ivyreverie-landing.md` · ADR-001 `docs/ADR-001-vite-react-ts.md`

## What to build

搭起整个项目的端到端骨架并证明管线通畅：Vite + React + TypeScript 脚手架，`npm run dev` 能起、`npm run build` 产出 `dist/`、Vitest + React Testing Library 已接入且至少一条测试通过。页面是一个全屏（`100vw×100vh`、`overflow:hidden`、无滚动条）的深黑偏蓝宇宙背景：纯色 `#05070f` 叠一层极轻微的 radial-gradient（`rgba(35,18,42,.35)` → `rgba(5,7,15,.95)` → `#05070f`），整体仍接近黑色、无明显渐变带。App 内部留出五个空区域占位（ParticleBackground / Header / Hero / LanguageFloatingButton / Footer 的空容器，按正确 z-index 层级叠放：背景层在最底，UI 层在其上），每个区域暂时为空。建立 `config/theme.ts` 色板常量（`#05070F` / `#FFFFFF` / `#F4D6F4` / `#EA8BA7` / `#2A182C`）供后续 issue 复用。这是 tracer bullet：让后续所有 issue 站在能跑的管线和已定的色板上。

## Acceptance criteria

- [x] Vite + React 18 + TypeScript 脚手架可运行：`npm run dev` 起本地服务、`npm run build` 产出 `dist/`
- [x] Vitest + React Testing Library 已配置，`npm run test` 通过至少一条 RTL 测试
- [x] 页面 `100vw×100vh`、`overflow:hidden`，桌面与移动均无滚动条（无横向溢出）
- [x] 背景为 `#05070f` + 极轻微 radial-gradient，目视接近纯黑、无明显渐变带
- [x] App 内存在五个空区域占位容器，z-index 层级正确（背景层 < UI 层）
- [x] `config/theme.ts` 导出五色色板常量
- [x] Seam A 基础测试通过：`render(<App/>)` 后背景区域存在、无横向滚动

## Blocked by

None — can start immediately.
