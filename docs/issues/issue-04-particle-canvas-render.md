# Issue 04 — 粒子背景 Canvas 渲染 + 鼠标 parallax

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-ivyreverie-landing.md`（粒子系统 + 鼠标交互）

## What to build

把 Issue 03 的 `ParticleEngine` 接到全屏 `<canvas>` 上渲染出可见星场。`ParticleBackground` 是 React 组件，持 canvas ref，在 `useEffect` 里实例化引擎、用 `requestAnimationFrame` 循环调用 `step(dt, mouse)` 并把 `getState()` 绘制到 canvas（普通星点用 `fillRect`/小圆，三角碎片用 `beginPath`+多边形 `fill`，大型碎片同理带旋转）。canvas `position:fixed; top:0; left:0; width:100%; height:100%; z-index:0`，标记 `aria-hidden="true"`。按 `devicePixelRatio` 缩放（`canvas.width = cssW*dpr`、`ctx.scale(dpr,dpr)`），监听 `resize` 重算。监听 `pointermove` 产生轻微 parallax（粒子整体向鼠标反方向偏移，中央 Logo 不动，无强吸附），不移动鼠标时仍正常动画。粒子加载时 0~2s 随机 delay 渐入。`prefers-reduced-motion: reduce` 时关闭或显著降低动画。最终目视效果：深黑背景上大量白/淡粉星点 + 三角碎片 + 大型碎片，中央 `IvyReverie` 周围密度明显高于四周并缓慢向外漂浮，整体梦境/银河尘埃感（绝非高速星际穿越）。

## Acceptance criteria

- [ ] 全屏 `<canvas>` 渲染 4 类粒子，目视可辨普通星点 / 小三角碎片 / 大型碎片
- [ ] 中央 Logo 周围粒子密度明显高于四周（中心高密度云可见）
- [ ] Logo 安全区内无粒子遮挡 `IvyReverie`
- [ ] 粒子缓慢向外漂浮、边缘 respawn、大碎片超慢旋转（20~60s/圈）
- [ ] 鼠标移动产生轻微 parallax（粒子向鼠标反方向偏移），Logo 不明显移动，无强吸附
- [ ] 不移动鼠标时动画持续
- [ ] 粒子加载时 0~2s 随机 delay 渐入，非同时闪现
- [ ] Canvas 按 `devicePixelRatio` 缩放，HiDPI 下不模糊，`resize` 时重算
- [ ] `prefers-reduced-motion: reduce` 时动画关闭或显著降低
- [ ] canvas `position:fixed; z-index:0; aria-hidden="true"`，UI 层在其上
- [ ] Seam A 测试通过：canvas 存在、带 `aria-hidden`、reduced-motion 降级标记生效
- [ ] 桌面/移动粒子数量自适应（≤2000 / ≤600），页面保持流畅

## Blocked by

- Issue 03（粒子引擎纯逻辑）
