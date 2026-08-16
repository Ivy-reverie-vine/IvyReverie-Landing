# Issue 05 — Header：start dream 按钮 + Bird pill + 占位1/2/3

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-ivyreverie-landing.md`（导航 / UI）

## What to build

页面右上角顶部导航（`top:25px; right:35px`），从左到右一行：`start dream` 胶囊按钮 + `Bird` 选中 pill + `占位1` / `占位2` / `占位3` 三个文本链接，项目间用 `/` 分隔。`start dream` 是圆角胶囊（深色透明背景、1~2px 白边、圆角约 15px、padding 8px 13px、白色文字），hover 时边框变亮、背景微亮、轻微 glow；点击为空链接（`href="#"`）。`Bird` 显示在深紫色（`#2A182C`）圆角 pill 里表示当前主题选中态，可点击但暂无其他主题、点击无可见切换（预留扩展，可给极轻微亮度脉冲提示可交互）。三个占位链接字面显示 `占位1/占位2/占位3`，`href="#"`，默认文字 `rgba(255,255,255,.75)`、15~17px。所有导航项 hover 反馈一致：默认白色 50% opacity、hover 变 100% 并带轻微粉色 text-shadow。Header 的 z-index 高于背景 canvas。**注意**：`goal.md` 第 12 章 DOM 图里的 `Light/Dark/中文` 已作废，不实现。

## Acceptance criteria

- [x] 右上角渲染 `start dream` 胶囊按钮（深色透明、白边、圆角 15px、padding 8px 13px、白字）
- [x] `start dream` hover：边框变亮、背景微亮、轻微 glow；`href="#"`
- [x] `start dream` 右侧 `Bird` 在深紫 `#2A182C` pill 里（选中态）
- [x] `Bird` 可点击但点击无可见主题切换（可给极轻微亮度脉冲）
- [x] `Bird` 右侧 `占位1 / 占位2 / 占位3` 三个文本链接，字面显示，`href="#"`
- [x] 所有导航项默认 `rgba(255,255,255,.75)`、15~17px、hover 变 100% 带轻微粉色 text-shadow
- [x] Header z-index 高于背景 canvas
- [x] Seam A 测试通过：`render(<App/>)` 断言 `start dream` / `Bird` / `占位1` / `占位2` / `占位3` 文案存在、链接 `href` 为 `#`

## Blocked by

- Issue 01（脚手架 + 色板 + 全屏布局）
