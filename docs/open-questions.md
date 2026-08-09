# Open Questions — 待确认的小问题

> 以下问题不影响开工，实现时按「默认假设」处理，用户若不同意请在 review 时指出。

| # | 问题 | 默认假设 | 说明 |
|---|---|---|---|
| Q1 | 底部描述 `I can see u and I can`t see u` 中的反引号 | 渲染为 `I can see u and I can't see u`（用正常撇号 `'`） | goal.md L604 用了反引号 `` ` ``，疑似输入法误触；若是有意风格化请告知保留 |
| Q2 | HiDPI / devicePixelRatio 适配细节 | Canvas 按 `dpr` 缩放：`canvas.width = cssW * dpr`，`ctx.scale(dpr,dpr)`，resize 时重算 | goal.md L755 提到监听 devicePixelRatio 但未给方案 |
| Q3 | Logo `top:48%` 是否有意 | 按 goal.md L325 保留 `48%`（略高于几何中心，视觉居中补偿） | 与多数 `50%` 居中不一致，疑似有意视觉补偿 |
| Q4 | 部署目标 | 先按独立静态站点，`vite build` 产出 `dist/`；D:\Blog 是否挂载到某博客框架后续再定 | 项目目录名 Blog 但内容是 Landing Page，关系待澄清 |
| Q5 | 粒子「中央留空」半径 | Logo 安全半径约 180-220px（桌面）内不生成粒子，避免遮挡 `IvyReverie` | goal.md L251 说「不能完全遮挡」但未给数值 |
| Q6 | `start dream` 按钮 hover 是否跳转或反馈 | 仅 hover 视觉（边框变亮、轻微 glow），点击无动作 | 与 R2-Q4 空链接一致 |
| Q7 | 移动端顶部导航换行策略 | `start dream` 单独一行，`Bird / 占位1/2/3` 收起或只保留 Bird | goal.md L823 给了两种方案，未定 |
| Q8 | `Bird` pill 点击是否给视觉反馈 | 点击给极轻微的亮度脉冲，提示「可交互」但不切主题 | R3-Q3 可点但无其他主题 |

---

## 下一步

按 `grill-with-docs → to-prd → to-issues → implement-review` 管线推进：
1. 本文件 + CONTEXTS.md + ADR-001 已完成 **grill-with-docs** 阶段产出。
2. 下一步可进入 **to-prd**：基于本 CONTEXTS 直接生成 `docs/PRD-ivyreverie-landing.md`。
