# Issue 08 — 移动/平板垂直切片 + a11y 收尾

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-iyvreverie-landing.md`（响应式 + 性能 / 可访问性）

## What to build

让整个页面在平板与移动端完整跑通的端到端垂直切片，并完成跨断点的 a11y 收尾。平板：Logo 自动缩到 70~85px、顶部导航间距缩小。移动：Logo 缩到 55~70px、副标题 16px、顶部导航换行（`start dream` 单独一行，`Bird / 占位1/2/3` 收起或只保留 `Bird`，见 `docs/open-questions.md` Q7 默认假设）、底部链接允许换行、粒子数量降至 300~600、无横向滚动条。桌面端按 1440×900 / 1920×1080 比例呈现。a11y 收尾：装饰性 canvas 已 `aria-hidden`（Issue 04 已做，此处复核）、Logo 与导航用语义化标签（`header`/`nav`/`main`/`footer`/`h1`）、`prefers-reduced-motion` 全链路降级生效。色板严格遵循五色（`#05070F`/`#FFFFFF`/`#F4D6F4`/`#EA8BA7`/`#2A182C`）。

## Acceptance criteria

- [x] 桌面端（1440×900 / 1920×1080）按参考图比例呈现
- [x] 平板端 Logo 自动缩到 70~85px、顶部导航间距缩小
- [x] 移动端 Logo 缩到 55~70px、副标题 16px
- [x] 移动端顶部导航换行或隐藏非核心项（`start dream` 单独一行等），不挤压
- [x] 移动端底部链接允许换行
- [x] 移动端粒子数量 ≤600，页面保持流畅
- [x] 平板/移动端均无横向滚动条
- [x] Logo 与导航使用语义化标签（`header`/`nav`/`main`/`footer`/`h1`）
- [x] 装饰性 canvas `aria-hidden`，`prefers-reduced-motion` 全链路降级生效
- [x] 全站色板严格遵循五色，无越界色值
- [x] Seam A 测试覆盖：移动断点下无横向溢出、关键文案仍存在

## Blocked by

- Issue 02（Hero，决定 Logo 缩放基准）
- Issue 04（粒子背景，决定移动端粒子降数）
- Issue 05（Header，决定导航换行）
- Issue 06（Language button）
- Issue 07（Footer，决定底部换行）
