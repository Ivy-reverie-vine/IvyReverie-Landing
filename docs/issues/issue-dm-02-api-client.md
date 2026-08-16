# Issue DM-02 — api 客户端 + 限频/缓存/错误码（Seam C 纯逻辑）

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-dreammusic.md`（Testing Decisions Seam C）· `API文档.md`

## What to build

一个可被 `vi.mock` 替换的 API 客户端模块，封装所有 NeteaseCloudMusicApiEnhanced 调用。统一 `fetch` 封装：自动拼 `/api` 前缀（走 Vite proxy）、自动带 `?cookie=`（从 `localStorage` 读 `dreammusic_cookie`）、默认带 `randomCNIP=true` 防 460。内置 2 分钟内存缓存（key=完整 URL，相同 URL 不重复请求，对应用户「别过于频繁请求」硬约束）。错误码处理：`301`→清 cookie 并抛「未登录」、`460`→已带 randomCNIP 仍失败则抛「海外风控」、`503`→抛「请求过频繁」、网络异常→抛友好错误。导出函数：`search(keywords,type,limit)`、`songDetail(ids)`、`songUrlV1(id,level)`、`songUrlMatch(id,source)`、`lyricNew(id)`、`personalized(limit)`、`playlistTrackAll(id,limit)`、`qrKey()`、`qrCreate(key)`、`qrCheck(key)`、`loginStatus(cookie)`。本 issue 不接 UI，只交付数据层 + 全套 Seam C 纯函数测试（URL 构建、缓存 key、错误码分流）。

## Acceptance criteria

- [x] API 客户端模块导出上述函数，统一走 `/api` 前缀 + cookie + randomCNIP
- [x] 2 分钟内存缓存生效：同 URL 第二次请求走缓存不发起 fetch（可断言 fetch 调用次数）
- [x] 错误码分流：301→清 cookie 抛未登录、460→抛海外风控、503→抛频繁、网络异常→抛友好错误
- [x] 模块可被 `vi.mock` 整体替换（导出形态支持 mock）
- [x] Seam C 测试覆盖：URL 构建（拼 cookie/randomCNIP）、缓存命中、错误码分流（用假 fetch）
- [x] 测试在 Vitest Node 环境通过，不打真实网络

## Blocked by

- Issue DM-01（脚手架 + proxy）
