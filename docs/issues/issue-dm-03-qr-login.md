# Issue DM-03 — QR 登录（强制先登录 + cookie 持久化 + 失效回登录页）

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-dreammusic.md`（登录章节）

## What to build

DreamMusic 的登录门禁与 QR 扫码流程。`PlayerLayout` 检查 `localStorage` 的 `dreammusic_cookie`：未登录 → 渲染 `LoginView`（强制先登录，登录前看不到播放器内容）。`LoginView` 用 `useQrLogin` 状态机驱动：`qrKey()` 拿 unikey → `qrCreate(key,qrimg=true)` 拿二维码 base64 展示 → 每 1.5s 调 `qrCheck(key)` 轮询；状态机 `idle/qrcode/scanning/expired/error/logged`，二维码过期（code 800）自动重新生成，`code=803` 扫码确认成功 → 存 cookie 到 `localStorage` → 回调进入播放器。展示「请用网易云 App 扫码」提示。已登录后，任意接口返回 301（cookie 失效）→ 清 cookie → 自动回 `LoginView`。登录态在刷新页面后保持。

## Acceptance criteria

- [x] 进 `/dreammusic` 未登录 → 渲染 `LoginView`（看不到播放器内容）
- [x] `LoginView` 展示二维码图片 + 「请用网易云 App 扫码」提示
- [x] 二维码过期（code 800）自动重新生成
- [x] 扫码确认（code 803）→ cookie 存 `localStorage`（key `dreammusic_cookie`）→ 进入播放器
- [x] QR 轮询间隔 1.5s，不频繁
- [x] 刷新页面后登录态保持（cookie 仍在）
- [x] cookie 失效（接口 301）→ 清 cookie → 自动回 `LoginView`
- [x] Seam A 测试（mock api）：未登录显 LoginView、QR 状态机转换、登录后进入播放器

## Blocked by

- Issue DM-02（api 客户端，QR 接口）
