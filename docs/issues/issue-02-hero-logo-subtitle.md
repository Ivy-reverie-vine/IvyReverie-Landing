# Issue 02 — Hero：IvyReverie Logo + night dream 副标题

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-ivyreverie-landing.md` · CONTEXTS `docs/CONTEXTS.md`

## What to build

页面中央的品牌 Hero。Logo 文案 `IvyReverie`，使用 `ivy-move-font/ivy-move-font.ttf` 手写体（通过 Vite 导入 `.ttf` + `@font-face` 自行命名 family，**不依赖 `bundle.ts`**，因其引用了旧文件名 `./unknown.ttf`），颜色 `#EA8BA7`，700/800 字重，桌面端字号 90~110px，柔和粉色 glow（`text-shadow: 0 0 15px rgba(234,139,167,.25), 0 0 35px rgba(234,139,167,.12)`，不加更强阴影）。位置 `left:50%; top:48%`（视觉居中补偿），`translate(-50%,-50%)`。Logo 正下方副标题 `night dream`，Sans-serif（Inter / -apple-system / Segoe UI / sans-serif）、中细字重、`rgba(255,230,245,.8)`、20~24px、字间距略增、与 Logo 间距 15~25px。入场动画：Logo `opacity 0→1` + `translateY(10px)→0`，持续 1~1.5s；副标题 delay 300ms 后同样淡入。Hero 位于背景层之上、z-index 高于 canvas。

## Acceptance criteria

- [x] 中央渲染 `IvyReverie`，使用 `ivy-move-font.ttf` 手写体（粗手写笔刷感）
- [x] Logo 颜色 `#EA8BA7`、700/800 字重、桌面 90~110px、柔和 glow（两层 text-shadow），无更强阴影
- [x] Logo 位置 `left:50%; top:48%; translate(-50%,-50%)`
- [x] Logo 正下方 `night dream` 副标题，Sans-serif、`rgba(255,230,245,.8)`、20~24px、字间距略增、间距 15~25px
- [x] 入场动画：Logo 1~1.5s 淡入上移，副标题 delay 300ms 后淡入
- [x] Hero z-index 高于背景 canvas，不被粒子遮挡（粒子后续 issue 处理留空安全区）
- [x] Seam A 测试通过：`render(<App/>)` 断言 `IvyReverie` 与 `night dream` 文案存在

## Blocked by

- Issue 01（脚手架 + 色板 + 全屏布局）
