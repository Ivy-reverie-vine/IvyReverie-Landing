# CONTEXTS.md — IvyReverie Landing Page

> 单一事实源（Single Source of Truth）。
> 本文件基于 `goal.md` + 三轮需求拷问的决策固化而成。
> **当本文件与 `goal.md` 冲突时，以本文件为准。**

---

## 1. 产品定位

**IvyReverie** 是一个漂浮在深空中的 AI 故事生成产品首页（Landing Page）。
视觉调性：极简 + 艺术 + 宇宙 + AI + 梦幻 + 高级感。
明确**不是**：SaaS Dashboard、普通星空背景、星空图片+HTML 文字、满屏紫色渐变、Cyberpunk、科幻 HUD、玻璃卡片。

一句话目标：**cinematic starfield + handwritten branding + minimal SaaS landing page**。

---

## 2. 术语表（Glossary）

| 术语 | 定义 | 来源/决策 |
|---|---|---|
| **IvyReverie** | 中央 Logo 品牌名。用手写字体 `ivy-move-font.ttf` 渲染。 | 决策 R1-Q1（goal.md 中 `monotal`/`monotale`/`IvyReverie` 三处矛盾，已统一为 `IvyReverie`） |
| **night dream** | Logo 正下方副标题。 | 决策 R1-Q2（goal.md 第 934 行 `Where AI calls become tales` 作废） |
| **ivy-move-font** | 自定义手写字体，Tegaki 生成。文件 `D:\Blog\ivy-move-font\ivy-move-font.ttf`。 | 决策 R1-Q3 |
| **start dream** | 顶部右上角胶囊按钮文案。第一版空链接（`href="#"`），仅视觉。 | 决策 R1-Q4 + R2-Q4 |
| **Bird** | 当前页面「主题」名，默认选中（深紫 pill）。可点击但**暂无其他主题可切**，点击无可见变化，预留扩展。 | 决策 R2-Q3 + R3-Q3 |
| **占位1 / 占位2 / 占位3** | 顶部导航 Bird 右侧的 3 个待定内容链接。第一版**字面显示**这三段文本，hover 有链接样式，指向 `#`。 | 决策 R2-Q2 + R3-Q4 |
| **A/文 按钮** | 页面右侧中下部悬浮圆形语言按钮。**仅视觉**，点击不切换语言。 | 决策 R3-Q1 |
| **粒子四态** | 普通星点 / 小型三角碎片 / 大型碎片 / 中央高密度粒子云。 | goal.md 第四章 |
| **ST / Ivy2API** | 底部导航中的品牌占位词，无实义。 | 决策 R3-Q2 |

---

## 3. goal.md 矛盾修正记录

> 以下矛盾已在拷问中解决，实现时**禁止**回退到 goal.md 原文。

| # | goal.md 原文（冲突） | 决议 |
|---|---|---|
| C1 | Logo 文案出现 `monotal`(L59) / `IvyReverie`(L397) / `monotale`(L803,L933) | **统一为 `IvyReverie`** |
| C2 | 副标题 `night dream`(L363,L398) vs `Where AI calls become tales`(L934) | **统一为 `night dream`**；`Where AI calls become tales` 不出现在页面任何位置 |
| C3 | 字体：L319「用 ivy-move-font」vs L849「找 Brush Script Google Font」 | **用 `ivy-move-font.ttf`**，Brush Script 方案作废 |
| C4 | 顶部导航：L423 `start dream / Bird / 占位1/2/3` vs L626 DOM `SignIn/Bird/Light/Dark/中文` | **以 L423 为准**：`start dream`(按钮) + `Bird`(选中 pill) + `占位1/2/3`(内容链接)。DOM 结构图中的 `Light/Dark/中文` 作废 |
| C5 | 语言切换：L626 DOM 顶部 `中文` vs L519 右侧悬浮 `A/文` 按钮 | **只保留右侧悬浮 `A/文` 按钮**；顶部 `中文` 作废。第一版不实现真实语言切换 |
| C6 | `bundle.ts` 引用不存在的 `./unknown.ttf` | 用户澄清：文件已改名。实现时直接用 `@font-face` 加载 `ivy-move-font.ttf` 并自定义 family 名（如 `IvyMove`），**不依赖 `bundle.ts`**；或修复 `bundle.ts` 指向。两选一，实现时定 |

---

## 4. 技术栈（ADR-001 详见）

- **Vite + React + TypeScript**
- Canvas 2D + `requestAnimationFrame` 实现粒子系统
- 字体：`ivy-move-font.ttf` 经 Vite URL 导入 + `@font-face`
- 正文：`Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`

---

## 5. 架构（DOM / 组件树）

```
App
├── ParticleBackground          // Canvas，z-index:0，全屏 fixed
│   └── <canvas>
├── Header                      // 右上角，top:25px right:35px
│   ├── StartDreamButton        // 胶囊按钮 "start dream" → href="#"
│   ├── BirdPill                // 深紫 pill，选中态，可点无变化
│   └── PlaceholderLinks        // "占位1 / 占位2 / 占位3" → href="#"
├── Hero                        // 居中，left:50% top:48% translate(-50%,-50%)
│   ├── Logo                    // "IvyReverie"，ivy-move-font，~90-110px，#EA8BA7
│   └── Subtitle                // "night dream"，~22px，rgba(255,230,245,0.8)
├── LanguageFloatingButton      // 右侧 top:64% right:0，圆形 40×40，"A/文"，仅视觉
└── Footer                      // 底部中央，bottom:65-75px
    ├── NavLinks                // ST / Ivy2API / Guide / GitHub / Status → 全部 href="#"
    └── Description             // "I can see u and I can't see u"（见 open-questions Q1）
```

**层级**：Canvas(z:0) < 页面内容 < 导航。Canvas 必须 `position:fixed` 全屏底层。

---

## 6. 粒子系统规格

| 类型 | 数量占比 | 尺寸 | 颜色 | 行为 |
|---|---|---|---|---|
| 普通星点 | 最多 | 1-3px | 白 / 少量淡粉 | 不规则透明度，部分闪烁，缓慢移动 |
| 小型三角碎片 | 重要 | 随机 | 粉/白随机 | 3-5 顶点 polygon，随机旋转/透明度 |
| 大型碎片 | 少量 | 15-45px | `rgba(245,210,245,.8)` / `rgba(235,160,220,.8)` / `rgba(255,255,255,.8)` | 20-60s 缓慢自转 |
| 中央高密度云 | — | — | — | x≈50vw,y≈50vh 附近密度显著高于四周；Logo 本体区域留空不被遮挡 |

**运动**：粒子从中心缓慢向外扩散，到边缘重生。速度排序：小星点 > 小碎片 > 大碎片 > 中心扩散。整体如「梦境/银河尘埃/纸片漂浮」，**禁止**高速星际穿越感。
**鼠标**：轻微 parallax，粒子整体向鼠标反方向偏移；Logo 不动；无强吸附。
**数量**：Desktop 1000-2000，Mobile 300-600，按设备性能自适应。
**加载**：粒子随机 delay 0-2s 渐入，不齐刷刷出现。
**a11y**：`prefers-reduced-motion: reduce` 时关闭或大幅降低动画。

---

## 7. 色板

```
背景     #05070F / #060812
纯白     #FFFFFF
淡粉     #F4D6F4
主粉     #E984A3 / #EA8BA7   (Logo 用 #EA8BA7)
深紫     #2A182C             (Bird pill 背景)
```
背景叠加极轻微 radial-gradient（`rgba(35,18,42,.35)` → `rgba(5,7,15,.95)` → `#05070f`），整体仍接近纯黑，不显渐变。

---

## 8. 质量属性 / 约束

- **性能**：禁用 DOM 粒子；必须 Canvas；监听 `resize` / `devicePixelRatio` / `prefers-reduced-motion`；HiDPI 适配（见 open-questions Q2）。
- **响应式**：Desktop 1440×900/1920×1080；Tablet Logo 70-85px；Mobile Logo 55-70px、副标题 16px、顶部导航可换行或隐藏非核心、粒子数降低。
- **无滚动**：`body { overflow:hidden }`，100vw×100vh。
- **视觉集中**：重点高度集中在中央；粒子丰富但不抢 Logo。
- **交互克制**：所有 hover 微妙，禁止喧闹动画。

---

## 9. 已决议问题清单

| 决议 ID | 问题 | 结论 |
|---|---|---|
| R1-Q1 | Logo 品牌名 | `IvyReverie` |
| R1-Q2 | 副标题 | `night dream` |
| R1-Q3 | Logo 字体 | `ivy-move-font.ttf` |
| R1-Q4 | 顶部按钮文案 | `start dream` |
| R2-Q1 | 技术栈 | Vite + React + TS |
| R2-Q2 | 导航占位性质 | 内容链接（待定） |
| R2-Q3 | Bird 含义 | 页面主题名，默认选中 |
| R2-Q4 | start dream 行为 | 暂时空链接 |
| R3-Q1 | 语言切换 | 仅右侧按钮视觉，不切语言 |
| R3-Q2 | 底部链接 | 全部 `#` 占位 |
| R3-Q3 | Bird 可点性 | 可点，暂无其他主题 |
| R3-Q4 | 3 占位处理 | 字面显示「占位1/2/3」 |
