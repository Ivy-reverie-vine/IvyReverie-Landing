# Issue 03 — 粒子引擎纯逻辑 + Seam B 测试

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-ivyreverie-landing.md`（Testing Decisions Seam B）

## What to build

一个框架无关、无 DOM/Canvas 依赖的纯粒子仿真模块 `ParticleEngine`，导出 `createParticleSystem(config) → { step(dt, mouse), getState(), resize(w,h) }`。config 含桌面/移动两套参数（数量、速度、尺寸、旋转周期、中心密度半径）。引擎管理 4 类粒子：普通星点（1~3px，白/少量淡粉，部分闪烁，数量最多）、小型三角碎片（3~5 顶点不规则多边形，随机大小/旋转/透明度/粉白）、大型碎片（15~45px，粉/白，旋转周期 20~60s/圈）、中央高密度云（中心附近密度显著高于四周，但 Logo 安全区约 180~220px 桌面半径内不生成）。运动：中心粒子缓慢向外扩散、到达边缘 respawn 回中心附近；不同类型不同速度（小星点最慢→大碎片更慢）。数量封顶：桌面 ≤2000、移动 ≤600。`prefers-reduced-motion` 时 `step` 返回静止（位置不变）。本 issue 不做任何渲染，只交付纯逻辑 + 全套 Seam B 单元测试（在 Node 下跑，无 Canvas）。

## Acceptance criteria

- [ ] `createParticleSystem(config)` 返回 `{ step, getState, resize }`，模块不 import canvas/DOM，可在 Node 下运行
- [ ] 4 类粒子配比数量符合 config（普通星点数量最多）
- [ ] 中心 N×N 区域粒子数显著高于边缘（密度偏置生效，可断言比例阈值）
- [ ] Logo 安全区（约 180~220px 桌面半径）内无粒子生成
- [ ] `step(dt)` 后中心粒子距中心距离单调递增（向外扩散，慢速）
- [ ] 粒子超出 viewport 后 respawn 到中心附近
- [ ] desktop config 总数 ≤2000、mobile ≤600
- [ ] 大碎片角速度换算周期落在 20~60s/圈
- [ ] `prefers-reduced-motion` 模式下 `step` 返回静止（位置不变）
- [ ] 全部 Seam B 测试在 Vitest（Node 环境）下通过

## Blocked by

- Issue 01（脚手架 + config/theme 结构）
