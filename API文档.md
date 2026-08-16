# 网易云音乐 API (Enhanced) 使用文档

> 基于 [NeteaseCloudMusicApiEnhanced](https://github.com/NeteaseCloudMusicApiEnhanced/api-enhanced) 项目源码整理
> 适用场景:**查询音乐、获取播放/下载链接、登录认证**等常用功能
> 在线完整文档:https://neteasecloudmusicapienhanced.js.org/

---

## 目录

1. [快速开始](#快速开始)
2. [调用前须知(重要)](#调用前须知重要)
3. [通用参数](#通用参数)
4. [登录与账号(必看)](#登录与账号必看)
5. [搜索](#搜索)
6. [歌曲详情与播放链接(核心)](#歌曲详情与播放链接核心)
7. [歌词](#歌词)
8. [歌曲下载与解灰](#歌曲下载与解灰)
9. [歌单](#歌单)
10. [专辑](#专辑)
11. [歌手](#歌手)
12. [排行榜](#排行榜)
13. [推荐与私人FM](#推荐与私人fm)
14. [MV 与视频](#mv-与视频)
15. [评论](#评论)
16. [用户信息](#用户信息)
17. [云盘](#云盘)
18. [电台 DJ](#电台-dj)
19. [其他实用接口](#其他实用接口)
20. [完整调用示例:搜索→拿链接](#完整调用示例搜索拿链接)

---

## 快速开始

```bash
# 安装依赖并启动(默认端口 3000)
git clone https://github.com/neteasecloudmusicapienhanced/api-enhanced.git
cd api-enhanced
pnpm i
node app.js          # 或 pnpm start
```

- 指定端口:`PORT=4000 node app.js`
- Docker:`docker run -d -p 3000:3000 moefurina/ncm-api:latest`
- 也可通过 npm 包直接调用:`@neteasecloudmusicapienhanced/api`

所有接口支持 `GET` / `POST`,下方示例统一使用 GET(curl 直接访问)。

---

## 调用前须知(重要)

| 事项 | 说明 |
|------|------|
| **POST 需加时间戳** | POST 请求 URL 必须带时间戳参数(如 `?timestamp=1699999999999`)使 URL 唯一,否则会被缓存 |
| **URL 缓存** | 相同 URL 2 分钟内只会向网易服务器请求一次 |
| **登录频率限制** | 不要频繁调用登录接口,否则可能触发风控(503/验证码) |
| **301 错误** | 多为未登录就调用需登录接口,或缓存问题(加时间戳 / 等 2 分钟) |
| **460 错误** | 海外服务器访问受限,加 `realIP`(国内 IP)或 `randomCNIP=true` |
| **图片尺寸** | 图片链接后可加 `?param=300y300` 控制尺寸 |
| **分页** | 返回字段含 `more`,为 true 表示还有下一页 |
| **版权限制** | 无版权歌曲拿不到真实播放链接,需用解灰接口或换源 |
| **cookie 传递** | 需登录的接口,把登录接口返回的 `cookie` 通过 `?cookie=` 或请求头传入 |

---

## 通用参数

以下参数几乎适用于所有接口(通过 query 传入):

| 参数 | 说明 |
|------|------|
| `cookie` | 登录后获得的 cookie 字符串,需登录接口必须 |
| `realIP` | 传入国内 IP 解决 460 风控,如 `realIP=116.25.146.177` |
| `randomCNIP` | `randomCNIP=true` 自动使用随机国内 IP(新版推荐) |
| `proxy` | 代理地址,支持 PAC 与 http 隧道 |
| `ua` | 自定义 user-agent |
| `noCookie` | `noCookie=true` 时不携带 cookie |
| `limit` / `offset` | 大多数列表接口的分页参数 |

---

## 登录与账号(必看)

> 只查歌(免费区歌曲)不登录也能用;但**高音质、VIP、私人FM、每日推荐、云盘等需要登录**。
> 强烈建议:优先用**游客登录**或**二维码登录**,避免账号风险。

### 1. 手机号登录

```
GET /login/cellphone?phone=13800138000&password=你的密码
```

| 参数 | 必选 | 说明 |
|------|------|------|
| `phone` | ✅ | 手机号 |
| `password` | 条件 | 密码(与 captcha 二选一) |
| `captcha` | 条件 | 验证码(与 password 二选一) |
| `md5_password` | 否 | 预计算好的 MD5 密码(可选) |
| `countrycode` | 否 | 国家码,默认 `86` |

**返回**:`body.cookie` 即登录凭证,后续请求带上它。

### 2. 邮箱登录

```
GET /login?email=xxx@163.com&password=你的密码
```

| 参数 | 必选 | 说明 |
|------|------|------|
| `email` | ✅ | 网易邮箱 |
| `password` / `md5_password` | ✅ | 密码 |

### 3. 二维码登录(最安全,推荐)

三步走:

```bash
# ① 获取二维码 key
GET /login/qr/key
# 返回 data.unikey

# ② 用 key 生成二维码(返回 qrurl / qrimg)
GET /login/qr/create?key=UNIKEY&qrimg=true

# ③ 轮询扫码状态(每秒一次),code=803 表示扫码确认成功,返回 cookie
GET /login/qr/check?key=UNIKEY
```

| 参数 | 必选 | 说明 |
|------|------|------|
| `key` | ✅ | 步骤①拿到的 unikey |
| `qrimg` | 否 | `qrimg=true` 时返回 base64 图片 |
| `platform` | 否 | `pc`(默认)/ `web` |

### 4. 游客登录(匿名 token)

```
GET /register/anonimous
```

无需任何参数,直接返回游客 `cookie`。**免费区歌曲可用**,适合轻量使用。

### 5. 验证码

```bash
# 发送验证码到手机
GET /captcha/sent?phone=13800138000

# 校验验证码
GET /captcha/verify?phone=13800138000&captcha=123456
```

### 6. 注册

```
GET /register/cellphone?phone=13800138000&password=xxx&captcha=123456&nickname=昵称
```

### 7. 登录状态与刷新

```bash
# 检查登录状态(cookie 是否有效)
GET /login/status?cookie=你的cookie

# 刷新登录(cookie 快过期时)
GET /login/refresh?cookie=你的cookie
```

### 8. 退出登录

```
GET /logout?cookie=你的cookie
```

---

## 搜索

### 1. 综合搜索(核心)

```
GET /search?keywords=周杰伦&type=1&limit=30&offset=0
```

| 参数 | 必选 | 说明 |
|------|------|------|
| `keywords` | ✅ | 关键词 |
| `type` | 否 | 搜索类型,默认 `1` |
| `limit` | 否 | 每页数量,默认 30 |
| `offset` | 否 | 偏移量,默认 0 |

**type 取值**:

| type | 含义 |
|------|------|
| 1 | 单曲 |
| 10 | 专辑 |
| 100 | 歌手 |
| 1000 | 歌单 |
| 1002 | 用户 |
| 1004 | MV |
| 1006 | 歌词 |
| 1009 | 电台 |
| 1014 | 视频 |
| 2000 | 语音搜索 |

**返回**:`result.songs[].id` 是歌曲 id,后续拿播放链接要用。

### 2. 其他搜索接口

```bash
# 热门搜索
GET /search/hot

# 默认搜索关键词
GET /search/default

# 搜索建议(联想)
GET /search/suggest?keywords=周杰&type=mobile

# 多类型混合搜索(一个结果含歌曲/歌手/歌单等)
GET /search/multimatch?keywords=周杰伦&type=1
```

---

## 歌曲详情与播放链接(核心)

### 1. 歌曲详情

```
GET /song/detail?ids=347230,33894312
```

| 参数 | 必选 | 说明 |
|------|------|------|
| `ids` | ✅ | 歌曲 id,多个用英文逗号分隔(不超过 1000) |

**返回**:`songs[]` 包含歌曲名、歌手、专辑、时长、`fee`(付费状态)等。

### 2. 获取播放链接(旧版,按码率)

```
GET /song/url?id=347230&br=320000
```

| 参数 | 必选 | 说明 |
|------|------|------|
| `id` | ✅ | 歌曲 id,多个用逗号分隔 |
| `br` | 否 | 码率,默认 `999000`。常用:128000 / 192000 / 320000 / 999000 |

**返回**:`data[].url` 即音频直链(可能为空 = 无版权/需会员)。

### 3. 获取播放链接 v1(新版,按音质等级,推荐)

```
GET /song/url/v1?id=347230&level=lossless
```

| 参数 | 必选 | 说明 |
|------|------|------|
| `id` | ✅ | 歌曲 id(单个) |
| `level` | ✅ | 音质等级,见下表 |
| `unblock` | 否 | `unblock=true` 时尝试自动解灰 |
| `immerseType` | 否 | 仅 `level=sky` 时: `c51`(默认)/ `ste` / `aac` |

**level 音质等级**:

| level | 含义 |
|-------|------|
| `standard` | 标准 |
| `exhigh` | 极高 |
| `lossless` | 无损 |
| `hires` | Hi-Res |
| `jyeffect` | 高清环绕声 |
| `sky` | 沉浸环绕声 |
| `jymaster` | 超清母带 |

> 需要对应会员权限,否则会降级或返回空。

### 4. 检查歌曲是否可播放

```
GET /check/music?id=347230&br=320000
```

**返回**:`success: true` 可播放;`success: false` 提示"暂无版权"。

### 5. 批量歌曲 URL 技巧

`/song/url` 支持逗号分隔多个 id,一次拿多首:
```
GET /song/url?id=347230,33894312&br=320000
```

---

## 歌词

```bash
# 普通歌词(含翻译 lrc)
GET /lyric?id=347230

# 新版歌词(含逐字歌词 yrc,适合做卡拉OK)
GET /lyric/new?id=347230
```

| 参数 | 必选 | 说明 |
|------|------|------|
| `id` | ✅ | 歌曲 id |

**返回**:`lrc.lyric` 普通歌词;`tlyric` 翻译;`yrc`(新版)逐字歌词。

---

## 歌曲下载与解灰

### 1. 客户端下载链接(旧版)

```
GET /song/download/url?id=347230&br=320000
```

### 2. 下载链接 v1(按音质等级)

```
GET /song/download/url/v1?id=347230&level=lossless
```

### 3. 302 直接重定向(拿到直链自动跳转)

```
GET /song/url/v1/302?id=347230&level=lossless
```

**返回**:HTTP 302,`redirectUrl` / `Location` 指向音频直链,适合直接下载。

### 4. 歌曲解灰(无版权换源,来自其他平台)

```
GET /song/url/match?id=347230&source=qq
```

| 参数 | 必选 | 说明 |
|------|------|------|
| `id` | ✅ | 歌曲 id |
| `source` | 否 | 音源:支持 `qq` / `kugou` / `kuwo` / `migu` 等 |

> 依赖 `unblockmusic-utils`,需服务端环境变量 `ENABLE_GENERAL_UNBLOCK`(默认 true)。

### 5. 云盘歌曲下载

```
GET /song/cloud/download?id=云盘歌曲id
```

---

## 歌单

### 1. 歌单详情

```
GET /playlist/detail?id=3778678
```

| 参数 | 必选 | 说明 |
|------|------|------|
| `id` | ✅ | 歌单 id |
| `s` | 否 | 返回的歌曲数量,默认 8 |

**返回**:`playlist.tracks[]`(前 s 首)、`playlist.trackIds`(全部 id)、`playlist.trackCount`。

### 2. 歌单全部歌曲(核心,取完整歌曲列表)

```
GET /playlist/track/all?id=3778678&limit=1000&offset=0
```

| 参数 | 必选 | 说明 |
|------|------|------|
| `id` | ✅ | 歌单 id |
| `limit` | 否 | 数量,默认 1000 |
| `offset` | 否 | 偏移,默认 0 |

**返回**:`songs[]` 完整歌曲信息(含 id),这是**拉取整个歌单下载**的关键接口。

### 3. 歌单动态(收藏数、播放数等)

```
GET /playlist/detail/dynamic?id=3778678
```

### 4. 歌单分类与热门歌单

```bash
# 全部歌单分类
GET /playlist/catlist

# 热门歌单分类标签
GET /playlist/hot

# 分类歌单(推荐/热门)
GET /top/playlist?cat=华语&order=hot&limit=50

# 精品歌单
GET /top/playlist/highquality?cat=华语&limit=50
```

**top/playlist 参数**:`cat`(分类,默认"全部")、`order`(`hot` 热 / `new` 新)、`limit`、`offset`。

### 5. 歌单管理(需登录)

```bash
# 创建歌单(privacy: 0 普通, 10 隐私;type: NORMAL / VIDEO / SHARED)
GET /playlist/create?name=我的歌单&privacy=0

# 删除歌单
GET /playlist/delete?id=歌单id

# 收藏 / 取消收藏歌单(t=1 收藏,其他取消)
GET /playlist/subscribe?id=3778678&t=1

# 歌单收藏者列表
GET /playlist/subscribers?id=3778678&limit=20

# 编辑歌单(名称/描述/标签)
GET /playlist/update?id=歌单id&name=新名字&desc=描述&tags=标签

# 添加/删除歌曲(op: add / del;tracks 逗号分隔)
GET /playlist/tracks?op=add&pid=歌单id&tracks=347230,33894312
```

### 6. 相似歌单

```
GET /simi/playlist?id=3778678
```

---

## 专辑

```bash
# 专辑内容(含全部歌曲)
GET /album?id=32311

# 全部新碟
GET /album/new?limit=30&offset=0&area=ALL
# area: ALL全部 ZH华语 EA欧美 KR韩国 JP日本

# 新碟上架(可按年月)
GET /top/album?area=ALL&limit=50&type=new&year=2024&month=6

# 收藏/取消收藏专辑
GET /album/sub?id=32311&t=1

# 已收藏专辑列表
GET /album/sublist?limit=25&offset=0
```

---

## 歌手

```bash
# 歌手热门 50 首
GET /artist/top/song?id=6452

# 歌手全部歌曲(可排序、分页)
GET /artist/songs?id=6452&order=hot&limit=100&offset=0
# order: hot(热度)/ time(时间)

# 歌手专辑列表
GET /artist/album?id=6452&limit=30&offset=0

# 歌手详情(基本信息、粉丝数等)
GET /artist/detail?id=6452

# 歌手介绍(简介文本)
GET /artist/desc?id=6452

# 歌手分类列表
GET /artist/list?type=1&area=7&initial=a&limit=30
# type: 1男 2女 3乐队;area: -1全部 7华语 96欧美 8日本 16韩国 0其他;initial: a-z

# 热门歌手
GET /artist/top?limit=50&offset=0

# 收藏 / 取消收藏歌手
GET /artist/sub?id=6452&t=1

# 相似歌手
GET /simi/artist?id=6452
```

---

## 排行榜

```bash
# 所有榜单介绍(名称、id)
GET /toplist

# 所有榜单内容摘要
GET /toplist/detail

# 排行榜详情(榜单 id 取自 toplist 返回的 id)
GET /top/list?id=3779629

# 新歌速递(type: 0全部 7华语 96欧美 8日本 16韩国)
GET /top/song?type=0

# 热门歌手
GET /top/artists?limit=50&offset=0
```

常用榜单 id 速查:云音乐飙升榜 `19723756`、新歌榜 `3779629`、热歌榜 `3778678`、原创榜 `2884035`。

---

## 推荐与私人FM

```bash
# 首页轮播图(type: 0 pc 1 android 2 iphone 3 ipad)
GET /banner?type=0

# 推荐歌单
GET /personalized?limit=30

# 推荐新歌
GET /personalized/newsong?limit=10

# 推荐 MV
GET /personalized/mv

# 推荐电台
GET /personalized/djprogram

# ---- 以下需登录 ----

# 每日推荐歌单(需登录)
GET /recommend/resource?cookie=你的cookie

# 每日推荐歌曲(需登录)
GET /recommend/songs?cookie=你的cookie

# 私人 FM(需登录,随机推荐歌曲)
GET /personal_fm?cookie=你的cookie

# 私人 FM 垃圾桶(不喜欢的歌,需登录)
GET /fm_trash?id=歌曲id&cookie=你的cookie
```

---

## MV 与视频

```bash
# MV 播放链接(r: 分辨率,默认 1080)
GET /mv/url?id=109535&r=1080

# MV 详情
GET /mv/detail?id=109535

# 全部 MV(可按地区/类型/排序筛选)
GET /mv/all?area=全部&type=全部&order=上升最快&limit=30

# 最新 MV
GET /mv/first?limit=30

# 视频播放链接(res: 分辨率,默认 1080)
GET /video/url?id=视频id&res=1080

# 视频详情
GET /video/detail?id=视频id

# 视频分类
GET /video/group/list
```

---

## 评论

```bash
# 歌曲评论(type: 0歌曲 1MV 2歌单 3专辑 4电台 5视频)
GET /comment/music?id=347230&limit=20&offset=0

# 热门评论
GET /comment/hot?id=347230&type=0&limit=20

# 楼层评论
GET /comment/floor?id=347230&type=0&parentCommentId=评论id

# 点赞/取消点赞评论(t=1 赞,其他取消)
GET /comment/like?id=347230&type=0&cid=评论id&t=1

# 发送/删除/回复评论(需登录)
GET /comment?t=1&type=0&id=347230&content=好听!
GET /comment?t=0&type=0&id=347230&commentId=评论id
GET /comment?t=2&type=0&id=347230&commentId=评论id&content=回复内容
```

**comment 参数**:`t`(1 发送 / 0 删除 / 2 回复)、`type`(同上资源类型)、`id`(资源 id)、`content`(内容)、`commentId`(评论 id)。

---

## 用户信息

```bash
# 用户详情
GET /user/detail?uid=用户id

# 账号信息(需登录)
GET /user/account?cookie=你的cookie

# 用户歌单(需登录查自己的收藏列表时也要 uid)
GET /user/playlist?uid=用户id&limit=30&offset=0

# 听歌排行(type: 1 最近一周, 0 所有时间)
GET /user/record?uid=用户id&type=1

# 收藏计数(歌单/专辑/歌手/电台数)
GET /user/subcount?cookie=你的cookie

# 用户等级
GET /user/level?cookie=你的cookie

# 用户动态
GET /user/event?uid=用户id&limit=30

# 用户评论历史
GET /user/comment/history?uid=用户id&limit=30
```

---

## 云盘

```bash
# 云盘歌曲列表(需登录)
GET /user/cloud?limit=30&offset=0&cookie=你的cookie

# 云盘歌曲详情
GET /user/cloud/detail?id=云盘歌曲id&cookie=你的cookie

# 删除云盘歌曲
GET /user/cloud/del?id=云盘歌曲id&cookie=你的cookie

# 云盘歌曲匹配(匹配到网易云曲库)
GET /cloud/match?uid=用户id&sid=歌曲id

# 云盘歌曲下载
GET /song/cloud/download?id=云盘歌曲id&cookie=你的cookie
```

---

## 电台 DJ

```bash
# 推荐电台
GET /dj/recommend

# 电台详情
GET /dj/detail?rid=电台id

# 电台节目列表(rid 电台id, asc 是否升序)
GET /dj/program?rid=电台id&limit=30&offset=0&asc=false

# 电台节目详情
GET /dj/program/detail?id=节目id

# 热门电台
GET /dj/hot?limit=30

# 订阅 / 取消订阅电台
GET /dj/sub?rid=电台id&t=1
```

---

## 其他实用接口

```bash
# 批量请求(一次请求多个 /api 接口)
GET /batch?/api/search/get={"s":"周杰伦","type":1}&/api/song/detail={"ids":"[347230]"}

# 相似歌曲
GET /simi/song?id=347230&limit=50

# 智能播放(猜你喜欢下一首)
GET /playmode/intelligence/list?id=347230&pid=歌单id

# 红心/取消红心歌曲(需登录)
GET /like?id=347230&like=true&cookie=你的cookie

# 喜欢的歌曲列表(无序,需登录)
GET /likelist?uid=用户id&cookie=你的cookie

# 签到(需登录;type: 0 安卓端3经验, 1 网页2经验)
GET /daily_signin?type=0&cookie=你的cookie

# 已购单曲(需登录)
GET /song/purchased?limit=20&offset=0&cookie=你的cookie
```

---

## 完整调用示例:搜索→拿链接

以"获取周杰伦《晴天》的无损播放链接"为例:

```bash
# 1. 搜索歌曲,拿到 id
curl "http://localhost:3000/search?keywords=周杰伦 晴天&type=1&limit=1"
# 假设返回 result.songs[0].id = 186016

# 2. 拿无损播放链接(无需登录通常只能拿到 128k,想拿高音质需登录)
curl "http://localhost:3000/song/url/v1?id=186016&level=lossless"
# 返回 data[0].url 即音频直链

# 3. 拿歌词
curl "http://localhost:3000/lyric?id=186016"

# 4. 检查是否可播放
curl "http://localhost:3000/check/music?id=186016"

# 5. 直接下载(302 重定向到文件)
curl -L "http://localhost:3000/song/url/v1/302?id=186016&level=lossless" -o qingtian.mp3
```

**完整下载一个歌单的流程**:

```bash
# 1. 取歌单全部歌曲 id
curl "http://localhost:3000/playlist/track/all?id=3778678&limit=1000"
# 2. 逐个 / 批量取 url
curl "http://localhost:3000/song/url?id=id1,id2,id3&br=320000"
# 3. 用返回的 url 逐个下载(或 wget -i urls.txt)
```

---

## 附:常见错误码

| 错误 | 含义 | 解决 |
|------|------|------|
| `301` | 未登录 | 带上登录 cookie |
| `404` | 资源不存在 / 已下架 | 检查 id |
| `460` | 海外风控 | 加 `realIP` 或 `randomCNIP=true` |
| `503` | 请求过频繁 | 降低频率 / 换 IP |
| 返回 `url` 为空 | 无版权或需会员 | 解灰接口 / 换音源 / 登录会员账号 |
