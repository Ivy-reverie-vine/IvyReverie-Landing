# Issue 07 — Footer：五链接 + 描述句

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-ivyreverie-landing.md`（底部导航）

## What to build

页面底部中央一组低调链接，位置 `bottom:65~75px; left:50%; translateX(-50%)`。第一行五个链接 `ST   Ivy2API   Guide   GitHub   Status`（链接间留较大间距），全部 `href="#"` 占位。文字颜色 `rgba(255,255,255,.48)`、字号 14~16px，hover 变亮带轻微粉色（与全局 hover 一致）。第二行是描述句 `I can see u and I can't see u`（撇号用正常 `'` 而非反引号，见 `docs/open-questions.md` Q1 默认假设），颜色 `rgba(255,255,255,.3)`、字号 12~14px。Footer z-index 高于背景 canvas。

## Acceptance criteria

- [x] 底部中央（`bottom:65~75px` 居中）渲染第一行 `ST   Ivy2API   Guide   GitHub   Status` 五个链接
- [x] 五个链接全部 `href="#"` 占位，链接间留较大间距
- [x] 第一行文字 `rgba(255,255,255,.48)`、14~16px，hover 变亮带轻微粉色
- [x] 第二行渲染 `I can see u and I can't see u`（撇号为 `'`，非反引号）
- [x] 第二行文字 `rgba(255,255,255,.3)`、12~14px
- [x] Footer z-index 高于背景 canvas
- [x] Seam A 测试通过：`render(<App/>)` 断言 `ST` / `Ivy2API` / `Guide` / `GitHub` / `Status` 与描述句文案存在、链接 `href` 为 `#`

## Blocked by

- Issue 01（脚手架 + 全屏布局）
