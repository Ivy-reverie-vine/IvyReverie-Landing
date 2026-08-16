# DreamMusic 待办清单（Backlog）

> 状态说明：`[ ]` 未开始；`[~]` 进行中；`[x]` 已完成。
> 用户指定项优先：私人FM、每日推荐、红心、队列拖拽、梦点扣减规则、用户基础操作、平台公告、管理员加梦点。

---

## P0 — 用户指定，下一步优先做

### T-01 私人 FM
- [x] 白名单增加 `personal_fm`（以及可能的 `fm_trash`）
- [x] 播放器入口：左栏或 TopBar 增加「私人 FM」
- [x] 每次取 1~3 首加入队列/直接播放；不重复请求（2 分钟缓存）
- [x] 支持「下一首」；可选「不喜欢/垃圾桶」接入 `fm_trash`
- [x] 测试：Seam A（mock api）+ 白名单测试

### T-02 每日推荐
- [x] 白名单增加 `recommend/songs`、`recommend/resource`
- [x] 左栏增加「每日推荐」入口（需要已绑定）
- [x] 歌曲列表 → 播放全部 / 加入队列 / 点单首（复用歌单详情交互）
- [x] 空态与错误提示；测试覆盖

### T-03 红心 / 我喜欢的音乐
- [x] 白名单增加 `like`、`likelist`
- [x] 播放页或队列项增加「红心」按钮，`like=true/false` 切换
- [x] 左栏或用户中心增加「我喜欢的音乐」列表
- [x] 红心状态乐观更新 + 失败回滚；测试覆盖

### T-04 队列拖拽排序
- [x] `playerReducer` 增加 `REORDER_QUEUE(from,to)` action
- [x] 删除/清空/切歌后 currentIndex 语义保持正确
- [x] QueueView 支持 HTML5 drag/drop（移动端可提供上移/下移按钮）
- [x] 新顺序持久化到 localStorage（D4-Q8 已持久化队列）
- [x] 测试：reducer 边界 + 组件交互

### T-05 梦点规则推进
- [x] 先定规则：签到 +10；**下载歌曲 -1**（见 `docs/dream-points-rules.md`）
- [x] 数据库增加 `dream_point_logs` 流水表：`id,user_id,delta,balance_after,type,ref_id,note,created_at`
- [x] 所有增减统一走服务端记账函数；禁止直接 `UPDATE dream_points`
- [x] 用户中心展示梦点流水
- [x] 测试：幂等、并发、负余额边界

### T-06 修改密码
- [x] 后端：`POST /auth/password`，参数 `{oldPassword,newPassword}`；校验旧密码
- [x] 成功后销毁该用户**全部会话**（重新登录），可选轮换 API Key
- [x] 前端用户中心：修改密码表单（旧密码/新密码/确认密码）
- [x] 密码强度与错误提示；测试覆盖

### T-07 修改头像
- [x] 决策存储方案：本地 `data/avatars/`（Docker 卷）或外部对象存储；建议先本地文件 + 大小/类型限制
- [x] 后端：`POST /auth/avatar`（multipart 或 base64，≤2MB，jpg/png/webp）
- [x] 返回并更新 `avatarUrl`；旧头像处理策略（覆盖/清理）
- [x] 前端用户中心：点击头像上传/裁剪（可选裁剪）；首字母兜底保留
- [x] 测试：文件校验、鉴权、静态访问

### T-08 平台公告
- [x] 数据库 `announcements` 表：`id,title,content,level,status,created_by,created_at,published_at,expires_at`
- [x] admin 接口：发布/编辑/下架/删除公告
- [x] 用户接口：公告列表；登录页/播放器顶部展示（可关闭、已读状态）
- [x] 公告等级（普通/维护/重要）对应样式
- [x] 测试：admin CRUD + 用户可见性

### T-09 管理员给用户增加/调整梦点
- [x] 后端：`POST /auth/users/:id/points`，参数 `{delta,note}`，仅 admin
- [x] 走 T-05 的流水表；支持正负数但服务端校验边界
- [x] 管理员可给自己调整；操作写入审计日志（见 T-10）
- [x] 前端 admin 面板：给用户/自己加/减梦点并填原因
- [x] 下载歌曲扣 1 梦点（`POST /auth/points/download`）
- [x] admin 面板注册邀请码查看/编辑
- [x] 测试：权限、流水、余额正确

---

## P1 — 与用户体系相关的补充（遗漏项）

### T-09b 兑换码
- [x] `redeem_codes` 表 + 一次性兑换（事务占用）
- [x] admin 生成兑换码（点数/数量/备注）
- [x] 顶部礼物入口 + 兑换弹层（用户兑换，admin 可生成/查看）
- [x] 兑换写梦点流水与审计；重复兑换 404
- [x] 测试覆盖

### T-09d 下载管理
- [x] `download_tasks` 表 + 后台抓取任务（中间层代理下载，不跳转上游链接）
- [x] 创建任务立即返回“下载已经开始”，完成后从下载管理获取
- [x] 顶部导航新增下载管理入口；任务进度/状态/获取文件/删除
- [x] 失败自动退还 1 梦点
- [x] 注意事项文档：`docs/music-download-proxy-notes.md`

### T-09c UI 细节优化
- [x] 公告 Markdown 渲染（marked + DOMPurify）
- [x] 左侧列表可折叠（桌面收成 44px 竖条）
- [x] 用户头像点击 → 左栏收起 + 右侧弹出用户中心抽屉
- [x] 顶部头像替代 user icon；头像加载失败回退首字母
- [x] 全局滚动条统一细窄风格
- [x] 播放控制栏三段式加宽排版

### T-10 用户操作记录 / 审计日志
- [x] `audit_logs` 表：操作者、目标用户、动作、参数摘要、时间、IP
- [x] admin 封禁/改角色/改梦点、用户改密/改头像等写日志
- [x] admin 面板可查看

### T-11 账号管理补全
- [x] 用户查看并管理自己的会话（在线设备列表、踢下线）
- [ ] 账号注销/停用流程（admin 停用 vs 用户注销）
- [x] 管理员重置用户密码
- [x] 用户名/头像外显字段统一

### T-12 登录安全加固
- [x] 连续登录失败锁定 / 冷却时间（防爆破）
- [~] 密码强度校验升级
- [ ] 可选：登录验证码
- [ ] 注册邀请码使用次数限制（可选）

### T-13 X-API-Key 体验补全
- [x] `/auth/me`、`/auth/profile` 等自有接口支持 X-API-Key（或提供独立 `/whoami`）
- [ ] API Key 支持备注/多个 Key（可选）
- [ ] Key 调用记录与最后使用时间

### T-14 中间层限流
- [x] 按用户/IP 对登录、注册、QR 轮询、搜索做轻量限流
- [x] 503 友好错误与 Retry-After
- [x] 可配置限额

### T-15 播放体验补全
- [ ] 播放历史 / 最近播放（本地或服务端）
- [ ] 搜索结果分页/加载更多
- [ ] 歌单详情分页（>1000 首）
- [ ] 队列去重策略与「加入队列」单曲入口
- [ ] 私人 FM 不喜欢的歌曲记录

### T-16 工程与交付
- [ ] 生成 OpenAPI JSON（供外部 agent 机器可读）
- [x] server 集成测试覆盖 auth/proxy 全链路
- [x] Docker compose 实机验证 + 健康检查（用户要求暂不处理 Docker）
- [ ] 生产 HTTPS/反代示例配置
- [ ] CI（lint + typecheck + test + build）

---

## P2 — 低优先级 / stretch

- [ ] 私人 FM / 每日推荐之外的更多上游能力 UI（评论、用户主页等）
- [ ] 队列云端同步（跨设备）
- [ ] 歌曲下载（需谨慎版权）
- [ ] 主题切换（Light/Dark）
- [ ] 多语言 i18n
- [ ] 音质偏好持久化到用户资料
- [ ] 数据库备份/恢复脚本
