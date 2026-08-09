# ADR-001: 技术栈选型 — Vite + React + TypeScript

- **状态**：Accepted
- **日期**：2026-08-09
- **决策者**：青藤（用户）+ grill-with-docs 会话

## 背景

`goal.md` 描述了一个以 Canvas 粒子系统为核心的电影感 Landing Page，但未指定技术栈。项目根目录当前只有 `goal.md` 和 `ivy-move-font/` 目录，无 `package.json`。`ivy-move-font/bundle.ts` 使用了 `import ... with { type: 'url' }` 语法（Vite + TS 5.3+ 风格），暗示 Vite 生态。DOM 结构图（App → ParticleBackground → Header → Hero → Footer）呈组件树形态。

## 决策

采用 **Vite + React + TypeScript**。

## 备选方案与权衡

| 方案 | 优势 | 劣势 | 结论 |
|---|---|---|---|
| Vite + React + TS ✅ | 组件化契合 DOM 图；TS 类型安全；Vite HMR 快；生态成熟 | 比 vanilla 略重 | **采纳** |
| Vite + Vue + TS | 同样组件化 | 用户未表偏好 Vue | 否决 |
| Vite + 原生 TS | 体积最小，Canvas 直接写 | 无组件化，DOM 结构图失去意义；后续扩展难 | 否决 |
| 纯 HTML/CSS/JS 单文件 | 零构建，双击即跑 | 无法用 TS；`with {type:'url'}` 语法用不上；难维护 | 否决 |

## 影响

- 脚手架：`npm create vite@latest . -- --template react-ts`
- 字体加载：`import fontUrl from '../ivy-move-font/ivy-move-font.ttf'` + `@font-face { font-family: 'IvyMove'; src: url(${fontUrl}); }`
- 粒子系统：独立 `ParticleBackground.tsx` 组件，`useRef` 持有 canvas，`useEffect` 跑 rAF 循环，组件卸载时 cancel。
- `bundle.ts` 不直接使用（其 `family:'Unknown'` 与坏引用），改为 Vite 直接导入 `.ttf`。如需保留 bundle，需修复其 `./unknown.ttf` → `./ivy-move-font.ttf`。

## 遵循

- 组件划分严格对齐 CONTEXTS.md 第 5 节组件树。
- Canvas 逻辑与 React 渲染解耦：React 只负责静态 UI，粒子数据在 ref 内 mutable，不触发 re-render。
