# Issue DM-09 — 第二轮视觉优化 + 用户中心

> **Triage**: `ready-for-agent`（已实现）
> **Source**: CONTEXTS-dreammusic §12

## What to build

- 一级导航：Logo + 搜索 pill + 用户名 chip + ⋯ 菜单（API Key / 退出）。
- 用户面板（左侧覆盖队列）：头像/签名（≤60 字）/ 每日签到 +10 梦点 / 播放时长 / 听过歌曲 / 梦点。
- 角色模型：首个注册用户 admin + `ADMIN_USERNAMES` 追加；封禁后会话与 API 一并失效。
- 播放统计：播放中每 30s 节流上报，切歌/暂停补报；服务端去重累计歌曲 id。
- 视觉：`img/backend.jpg` 固定氛围底图（blur+蒙层）、动态主题色、小封面、歌词层级、圆形播放按钮。
- 内置线性 SVG 图标组件。

## Acceptance criteria

- [x] 用户名 chip 点开用户中心，⋯ 菜单包含 API Key / 退出
- [x] 头像（绑定后自动拉取，缺失首字母兜底）与签名编辑
- [x] 东八区自然日签到幂等 +10 梦点
- [x] 播放时长 / 听过歌曲 / 梦点展示
- [x] admin 用户管理（封禁/解封/设置或取消管理员，不能操作自己）
- [x] 登录/会话接口校验封禁状态
- [x] 播放统计上报（30s 节流 + 服务端限幅）

## Blocked by

- Issue DM-08（账户/会话/数据库）
