# Issue DM-05 — 搜索浮层 + 取播放链接 + 解灰兜底 → 加入队列/播放

> **Triage**: `ready-for-agent`
> **Source**: PRD `docs/PRD-dreammusic.md`（搜索 + 音质与解灰）

## What to build

把数据层与播放引擎接起来，实现「搜歌→播放」端到端路径。顶部搜索按钮点开 `SearchOverlay` 浮层（遮罩 + 搜索框 + 结果列表），输入关键词防抖 400ms 后调 `search()`（走 DM-02 缓存），结果列表显示歌名/歌手/专辑。点结果：调 `songUrlV1(id, level)` 取播放链接 → 若 `data[0].url` 为空（无版权）自动调 `songUrlMatch(id, 'qq')` 解灰换源 → 拿到 url 后 `ADD_TO_QUEUE` + `PLAY` 该曲；解灰仍失败给友好提示（「无版权，已跳过」）并跳下一首。结果也可「加入队列」不立即播放。默认音质 `exhigh`。浮层可关闭返回主界面。这是用户第一次能真正搜歌听歌的切片。

## Acceptance criteria

- [x] 顶部搜索按钮点开 `SearchOverlay` 浮层（遮罩 + 搜索框 + 结果区）
- [x] 输入防抖 400ms 后搜索，结果列表显示歌名/歌手/专辑
- [x] 重复关键词走 DM-02 缓存不重复请求
- [x] 点结果：取 `songUrlV1(id, exhigh)` → 拿到 url → 加入队列并播放
- [x] `url` 为空 → 自动 `songUrlMatch(id, 'qq')` 解灰换源 → 拿到则播放
- [x] 解灰仍失败 → 友好提示 + 跳下一首，不卡住
- [x] 结果支持「加入队列」不立即播放
- [x] 浮层可关闭返回主界面
- [x] Seam A 测试（mock api）：搜索结果渲染、点歌触发 ADD_TO_QUEUE+PLAY、无版权 fixture 触发解灰调用

## Blocked by

- Issue DM-02（api 客户端）
- Issue DM-04（player reducer + audio）
