# Issue 06 — 右侧悬浮语言按钮 A/文

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-iyvreverie-landing.md`（右侧语言按钮）

## What to build

页面右侧中下部一个贴边的悬浮圆形/半圆形按钮，位置约 `right:0; top:64%`，尺寸 40×40px，一部分贴在页面右侧边缘。按钮内显示 `A / 文` 图标（类似语言翻译图标）。背景 `rgba(100,65,90,.8)`，图标颜色 `#f2b2c7`，有非常轻微的阴影。hover 时 `scale(1.05)`。**第一版仅视觉，点击不切换语言**（grill 决议：DOM 图顶部 `中文` 作废，语言切换只留此按钮且不实现真实切换）。按钮 z-index 高于背景 canvas。

## Acceptance criteria

- [ ] 右侧中下部（约 `right:0; top:64%`）渲染 40×40 圆形/半圆形贴边按钮
- [ ] 按钮内显示 `A / 文` 图标
- [ ] 背景 `rgba(100,65,90,.8)`，图标 `#f2b2c7`，轻微阴影
- [ ] hover 时 `scale(1.05)`
- [ ] 点击不切换语言（仅视觉，无实际行为）
- [ ] 按钮 z-index 高于背景 canvas
- [ ] Seam A 测试通过：`render(<App/>)` 断言语言按钮存在

## Blocked by

- Issue 01（脚手架 + 全屏布局）
