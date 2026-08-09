# PRD — IvyReverie Landing Page

> **Status**: ready-for-agent
> **Source**: synthesized from `docs/CONTEXTS.md` + `docs/ADR-001-vite-react-ts.md` + `docs/open-questions.md` (grill-with-docs 产出)
> **Issue tracker**: 项目未配置 issue tracker（无 git 仓库、GitHub 连接器断开）。本 PRD 以文件形式发布于 `docs/PRD-ivyreverie-landing.md`，后续接入 tracker 时迁移。

---

## Problem Statement

作为一个 AI 故事生成产品的发布者，我希望访客打开首页的瞬间被一种「漂浮在深空中的、梦境般的、高级的」氛围击中，而不是看到又一个普通 SaaS Dashboard。当前我只有一份详细的视觉规格 `goal.md` 和一个手写体字体包 `ivy-move-font`，但规格内部存在品牌名、副标题、字体、导航项等多处自相矛盾，且没有任何可运行的代码。我需要把它实现成一个真正动态的、流畅的、响应式的网页，让中央 `IvyReverie` 手写体 Logo 被高密度的三角/碎片/星尘粒子云环绕并缓慢向外漂浮，从而传达「AI、宇宙、梦境、故事生成」的产品调性。

## Solution

一个基于 **Vite + React + TypeScript** 的单页 Landing Page，全屏 16:9、不滚动、深黑偏蓝宇宙背景。核心由三层构成：

1. **粒子氛围层** — 全屏 `<canvas>`（`position:fixed; z-index:0`）用 `requestAnimationFrame` 驱动 4 类粒子（普通星点 / 小型三角碎片 / 大型碎片 / 中央高密度云），中心 Logo 周围密度显著高于四周，粒子缓慢向外漂移、边缘 respawn、大碎片超慢旋转。支持鼠标轻微 parallax 与 `prefers-reduced-motion` 降级。
2. **品牌 Hero 层** — 中央 `IvyReverie` 手写体 Logo（`ivy-move-font.ttf`，粉色 `#EA8BA7`，柔和 glow）+ 副标题 `night dream`，带入场动画。
3. **极简 UI 层** — 顶部右侧 `start dream` 胶囊按钮 + `Bird` 选中 pill + `占位1/2/3` 文本链接；右侧中下部悬浮 `A/文` 圆形语言按钮（仅视觉）；底部中央 `ST / Ivy2API / Guide / GitHub / Status` 链接行 + 描述句 `I can see u and I can't see u`。

视觉重点高度集中在中央，背景粒子丰富但不抢 Logo，整体极简、未来感、艺术感。

---

## User Stories

### 访客 / 首屏体验
1. 作为首次访客，我希望打开页面 1.5 秒内看到中央 `IvyReverie` Logo 从下方淡入浮现，以便立刻确认「这就是那个产品」。
2. 作为首次访客，我希望 Logo 出现后约 300ms 看到副标题 `night dream` 跟随淡入，以便感知品牌完整含义。
3. 作为首次访客，我希望页面背景充满白色与淡粉色的星点、三角碎片、大型碎片，而不是简单圆形星星，以便获得「被撕碎的纸片 / 晶体碎片 / 星尘」的艺术感。
4. 作为首次访客，我希望粒子在页面中央 `IvyReverie` Logo 周围明显更密集、向四周稀疏，以便视觉焦点自然汇聚到品牌名。
5. 作为首次访客，我希望粒子持续缓慢向外漂浮、到达边缘后重新生成，而不是静态截图，以便页面始终有「梦境 / 银河尘埃」的生命感。
6. 作为首次访客，我希望页面不出现滚动条、所有核心内容在 100vw×100vh 内居中，以便首屏即完整呈现。

### 粒子行为
7. 作为访客，我希望普通星点（1~3px，白/少量淡粉）数量最多、缓慢移动、部分闪烁，以便构成星场基底。
8. 作为访客，我希望看到大量 Canvas 绘制的不规则三角/多边形碎片（3~5 顶点、随机大小/旋转/透明度/粉白色），以便区别于普通星空。
9. 作为访客，我希望页面偶尔出现 15~45px 的大型三角形碎片（粉/白），以便形成视觉锚点。
10. 作为访客，我希望大型碎片以 20~60 秒每圈的周期超慢旋转，以便动态感克制不喧闹。
11. 作为访客，我希望不同粒子类型有不同速度（小星点最慢、小碎片慢、大碎片更慢、中心粒子向外扩散），以便运动层次丰富。
12. 作为访客，我希望粒子在页面加载时以 0~2s 随机 delay 逐渐出现，而不是同时闪现，以便开场有渐入的仪式感。

### 鼠标 / 交互
13. 作为访客，我希望移动鼠标时背景粒子产生轻微 parallax（整体向鼠标反方向偏移），而中央 Logo 不明显移动，以便交互微妙不打扰。
14. 作为访客，我希望不移动鼠标时页面仍正常动画，以便页面不会因静止而「死掉」。
15. 作为访客，我希望鼠标交互非常轻微、不产生强烈吸附，以便保持梦境般的克制感。

### 导航 / UI
16. 作为访客，我希望页面右上角看到 `start dream` 胶囊按钮（深色透明、白边、圆角 15px），以便识别主要入口。
17. 作为访客，我希望 hover `start dream` 时边框变亮、背景微亮、轻微 glow，以便感知可交互（点击暂为空链接）。
18. 作为访客，我希望 `start dream` 右侧看到 `Bird` 显示在深紫色选中 pill 里，以便知道当前主题。
19. 作为访客，我希望 `Bird` 右侧看到 `占位1 / 占位2 / 占位3` 三个文本链接，以便预留未来内容位（第一版指向 `#`）。
20. 作为访客，我希望所有导航链接默认白色 50% 透明、hover 变 100% 并带轻微粉色 text-shadow，以便交互反馈克制一致。
21. 作为访客，我希望页面右侧中下部看到一个贴边的圆形/半圆形 `A/文` 悬浮按钮，以便知道这里可切换语言（第一版仅视觉）。
22. 作为访客，我希望 hover 语言按钮时 `scale(1.05)`，以便反馈轻微可交互。
23. 作为访客，我希望 `Bird` pill 可点击（点击暂无可见主题切换，预留扩展），以便未来支持多主题。

### 底部
24. 作为访客，我希望页面底部中央看到 `ST   Ivy2API   Guide   GitHub   Status` 一组链接（较大间距、白色 48% 透明、14~16px），以便访问附属资源（第一版全部 `#`）。
25. 作为访客，我希望底部链接下方看到一句小字 `I can see u and I can't see u`（白色 30% 透明、12~14px），以便感受品牌诗意收尾。
26. 作为访客，我希望 hover 底部链接时颜色变亮带粉色，以便交互反馈一致。

### 响应式
27. 作为桌面访客（1440×900 / 1920×1080），我希望页面按参考图比例呈现，Logo 90~110px，以便获得设计预期效果。
28. 作为平板访客，我希望 Logo 自动缩到 70~85px、顶部导航间距缩小，以便不被挤压。
29. 作为移动端访客，我希望 Logo 缩到 55~70px、副标题 16px、顶部导航换行或隐藏非核心项、底部链接允许换行、粒子数量降至 300~600，以便低端设备仍流畅。
30. 作为移动端访客，我希望页面在窄屏下不出现横向滚动条，以便体验完整。

### 性能 / 可访问性
31. 作为使用低端设备的访客，我希望粒子数量根据设备性能自动调整（桌面 ≤2000、移动 ≤600），以便保持流畅。
32. 作为开启了 `prefers-reduced-motion` 的访客，我希望粒子动画被关闭或显著降低，以便不引发不适。
33. 作为使用 HiDPI 屏幕的访客，我希望 Canvas 按 devicePixelRatio 缩放、resize 时重算，以便粒子不模糊。
34. 作为访客，我希望粒子用 Canvas + requestAnimationFrame 实现而非数千个 DOM 元素，以便页面性能稳定。
35. 作为键盘/读屏用户，我希望装饰性 Canvas 标记为 `aria-hidden`、Logo 与导航用语义化标签，以便辅助技术不被干扰。

### 品牌 / 字体
36. 作为产品方，我希望 `IvyReverie` Logo 使用 `ivy-move-font.ttf` 手写体、粉色 `#EA8BA7`、700/800 字重、柔和 glow（`0 0 15px rgba(234,139,167,.25)` + `0 0 35px rgba(234,139,167,.12)`），以便品牌字呈现粗手写笔刷感。
37. 作为产品方，我希望正文用 Inter / -apple-system / Segoe UI 等无衬线字体，以便与手写 Logo 形成对比。
38. 作为产品方，我希望整体色板严格遵循 `#05070F` 背景、`#FFFFFF` 纯白、`#F4D6F4` 淡粉、`#EA8BA7` 主粉、`#2A182C` 深紫，以便视觉统一。

---

## Implementation Decisions

### 技术栈（见 ADR-001）
- **Vite + React 18 + TypeScript** 构建。理由：组件化契合 DOM 结构图、TS 给粒子 config 类型安全、Vite 热更新加速开发。
- 不用 Vue / 原生 TS / 纯 HTML：DOM 结构图（App→ParticleBackground→Header→Hero→LanguageButton→Footer）天然是组件树；Canvas 逻辑独立模块即可，不需要为它放弃组件化收益。

### 模块划分
- **`ParticleEngine`（纯逻辑模块，框架无关）** — 拥有粒子状态与 `step(dt, mouse)` 仿真。导出 `createParticleSystem(config)` 返回 `{ step, getState, resize }`。这是为可测性而抽出的 seam（见 Testing Decisions），把「仿真」与「渲染」分离。
- **`ParticleBackground`（React 组件）** — 持有 `<canvas>` ref，在 `useEffect` 里实例化 `ParticleEngine`、用 `requestAnimationFrame` 循环调用 `step` 并把 state 绘制到 canvas（`ctx.fill` 三角/多边形）。监听 `resize` / `devicePixelRatio` / `pointermove` / `prefers-reduced-motion`。
- **`Header`** — 含 `start dream` 胶囊按钮 + `Bird` 选中 pill + `占位1/2/3` 链接。
- **`Hero`** — `IvyReverie` Logo + `night dream` 副标题，入场动画。
- **`LanguageFloatingButton`** — 右侧贴边圆形 `A/文` 按钮。
- **`Footer`** — 5 链接 + 描述句。
- **`config/particles.ts`** — 桌面/移动两套粒子参数（数量、速度、尺寸、旋转周期、中心密度半径）。
- **`config/theme.ts`** — 色板常量。

### 粒子系统规格
- **4 类粒子**：普通星点（数量最多，1~3px，白/少量淡粉，部分闪烁）、小型三角碎片（3~5 顶点不规则多边形，随机大小/旋转/透明度/粉白）、大型碎片（15~45px，粉/白，20~60s/圈旋转）、中央高密度云（中心附近密度显著高于四周）。
- **分布**：非均匀，中心 `≈50vw,50vh` 半径内密度提高，但 Logo 安全半径（约 180~220px 桌面）内不生成粒子避免遮挡。
- **运动**：中心粒子缓慢向外扩散，到达边缘 respawn 回中心附近；不同类型不同速度（小星点最慢→大碎片更慢）；整体「梦境/银河尘埃」感，绝非高速星际穿越。
- **数量封顶**：桌面 1000~2000、移动 300~600，按设备性能自适应。
- **鼠标 parallax**：粒子整体向鼠标反方向轻微偏移，Logo 不动，无强吸附。

### 视觉规格
- 全屏 `100vw×100vh`，`overflow:hidden`，无滚动条。
- 背景 `#05070f` + 极轻微 radial-gradient（`rgba(35,18,42,.35)`→`rgba(5,7,15,.95)`→`#05070f`），整体仍近黑。
- Logo：`left:50%; top:48%`（视觉居中补偿），`translate(-50%,-50%)`，`#EA8BA7`，桌面 90~110px / 平板 70~85px / 移动 55~70px，700~800 字重，柔和 glow。
- 副标题 `night dream`：Sans-serif、中细、`rgba(255,230,245,.8)`、20~24px（移动 16px）、字间距略增、与 Logo 间距 15~25px。
- 顶部导航：`top:25px; right:35px`，`start dream` 胶囊（深色透明、白边、圆角 15px、padding 8px 13px）+ `Bird` 深紫 pill + `占位1/2/3`，文字 `rgba(255,255,255,.75)`、15~17px。
- 语言按钮：`right:0; top:64%`，40×40 圆形贴边，`rgba(100,65,90,.8)`，图标 `#f2b2c7`，轻微阴影，hover `scale(1.05)`，**仅视觉不切语言**。
- 底部：`bottom:65~75px` 居中，第一行 `ST   Ivy2API   Guide   GitHub   Status`（`rgba(255,255,255,.48)`、14~16px、大间距、全部 `#`），第二行 `I can see u and I can't see u`（`rgba(255,255,255,.3)`、12~14px，撇号用 `'` 而非反引号）。
- 字体：Logo 用 `ivy-move-font.ttf`（Vite 导入 + `@font-face`，**不依赖 `bundle.ts`** 因其引用了旧文件名 `./unknown.ttf`）；正文 Inter / -apple-system / Segoe UI / sans-serif。

### DOM / 层级
```
App
├── ParticleBackground (canvas, z-index:0, aria-hidden)
├── Header (z-index 高于 canvas)
│   ├── start dream 按钮
│   ├── Bird pill (selected)
│   └── 占位1 / 占位2 / 占位3
├── Hero (z-index 高于 canvas)
│   ├── IvyReverie Logo
│   └── night dream 副标题
├── LanguageFloatingButton
└── Footer
    ├── ST / Ivy2API / Guide / GitHub / Status
    └── I can see u and I can't see u
```
Canvas 在最底层，UI 在其上。`goal.md` 第 12 章 DOM 图中的 `Light/Dark/中文` **已作废**（grill 决议：占位为内容链接，语言仅右侧按钮视觉）。

### 入场动画
- Logo：`opacity 0→1` + `translateY(10px)→0`，1~1.5s。
- 副标题：delay 300ms 后同样淡入。
- 粒子：0~2s 随机 delay 渐入。

---

## Testing Decisions

### 测试哲学
- **只测外部行为，不测实现细节**。Canvas 的 `ctx.fill` / `ctx.beginPath` 调用不测（是绘制实现细节）；粒子状态机与组件 DOM 输出是外部行为，测这两层。
- **新代码优先复用 seam**，本项目 greenfield 无既有 seam，故新建 2 个（已是最低数）。

### Seam A — 组件渲染层（React Testing Library + Vitest）
- `render(<App/>)` 后断言：
  - 5 个区域存在（canvas、header、hero、language button、footer）
  - 文案：`IvyReverie` / `night dream` / `start dream` / `Bird` / `占位1` `占位2` `占位3` / `ST` `Ivy2API` `Guide` `GitHub` `Status` / `I can see u and I can't see u`
  - 链接 `href` 全为 `#`（除 start dream/Bird/语言按钮按决议）
  - canvas 带 `aria-hidden="true"`
  - `prefers-reduced-motion: reduce` 时 `ParticleBackground` 进入降级模式（可通过 data-attribute 或 engine 行为断言）
- 不断言 canvas 像素 / ctx 调用。

### Seam B — 粒子引擎纯逻辑层（Vitest，无 DOM/Canvas）
- `createParticleSystem(config)` 返回 `{ step, getState, resize }`，纯函数式仿真。
- 断言：
  - 4 类粒子配比数量符合 config
  - 中心 N×N 区域粒子数显著高于边缘（密度偏置生效）
  - `step(dt)` 后中心粒子距中心距离单调递增（向外扩散）
  - 粒子超出 viewport 后 respawn 到中心附近
  - desktop config 总数 ≤2000、mobile ≤600
  - 大碎片角速度换算周期落在 20~60s
  - `prefers-reduced-motion` 时 `step` 返回静止（位置不变）
- 引擎不 import canvas/DOM，可在 Node 下跑。

### 不测的部分
- Canvas 实际像素渲染（Seam A 间接覆盖「canvas 存在且降级正确」）。
- 鼠标 parallax 的像素级偏移（属实现细节，靠 code review 把关）。
- 字体加载（依赖网络/资源，属环境）。

### Prior art
- greenfield，无既有测试可参照。采用 React + Vite 项目最常见的 RTL + Vitest 组合。

---

## Out of Scope

- **多语言切换真实实现**：`A/文` 按钮仅视觉，不切换文案（grill 决议）。中文文案集不在本 PRD 范围。
- **多主题切换**：`Bird` 可点但暂无其他主题，无实际粒子风格切换。
- **导航真实路由**：`start dream` / `占位1/2/3` / 底部 5 链接全部 `#`，无跳转。
- **后端 / API / 故事生成**：本 PRD 仅 Landing Page，`start dream` 不触发任何生成流程。
- **`bundle.ts` 修复**：字体直接 Vite 导入 `.ttf` + `@font-face`，不修复 `bundle.ts` 的旧文件名引用。
- **`goal.md` 第 12 章 DOM 图中的 `Light/Dark/中文`**：已作废，不实现顶部主题/语言切换项。
- **品牌名/副标题的其他候选**（`monotal` / `monotale` / `Where AI calls become tales`）：已作废，不复用。
- **部署到具体博客框架**：D:\Blog 与博客框架的关系待定，本 PRD 只产出 `vite build` 的 `dist/`。
- **视觉回归 / 截图快照测试**：Seam 提案时未采纳，不在本 PRD。

---

## Further Notes

### 与 `goal.md` 的偏差（以本 PRD 为准）
经 grill-with-docs 三轮拷问，`goal.md` 内 6 处矛盾已修正，实现时**以本 PRD 与 `docs/CONTEXTS.md` 为单一事实源**：
1. Logo 统一 `IvyReverie`（原 monotal/monotale/IvyReverie 三处不一致）。
2. 副标题统一 `night dream`（原 `night dream` 与 `Where AI calls become tales` 并存）。
3. Logo 字体用 `ivy-move-font.ttf`（原另有 Brush Script Google Font 方案）。
4. 顶部按钮文案 `start dream`（原 DOM 图称 `SignIn`）。
5. 顶部导航占位为内容链接 `占位1/2/3`（原 DOM 图 `Light/Dark/中文` 作废）。
6. 语言切换仅右侧悬浮按钮、仅视觉（原 DOM 图顶部 `中文` 作废）。

### 待确认小问题（见 `docs/open-questions.md`）
8 个不阻塞开工的小问题已列明默认假设：撇号渲染、HiDPI 方案、`top:48%` 是否有意、部署目标、Logo 安全半径、`start dream` hover 反馈、移动端导航换行策略、`Bird` 点击反馈。实现时按默认假设处理，review 时可推翻。

### 后续管线
按 `grill-with-docs → to-prd → to-issues → implement-review`：
- ✅ grill-with-docs → CONTEXTS.md / ADR-001 / open-questions
- ✅ to-prd → 本文件
- ⏭ to-issues → 将本 PRD 拆为 vertical-slice issues（如：脚手架+背景色 / 粒子引擎 / 粒子渲染组件 / Hero / Header / LanguageButton / Footer / 响应式 / 降级与性能 / 测试），呈现用户审批后发布。
- ⏭ implement-review → 逐 issue 实现 + 全量 code review。
