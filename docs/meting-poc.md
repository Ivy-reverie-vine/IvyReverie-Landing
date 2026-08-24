# Meting 多平台播放 POC

该 POC 将 Meting 放在 NightDream 外部 HTTP sidecar 边界内。NightDream 只依赖 `server/type/id` 请求和经过归一化的领域结果，不直接暴露 Meting 的原始响应，也不接收客户端 Cookie。

## 默认状态

Meting 默认关闭，不能因为搜索成功就宣称来源可以稳定播放。只有完成受控 fixture、真实上游稳定性、授权边界和 HarmonyOS 设备验收后，才允许测试环境显式开启。

```powershell
$env:METING_SOURCE_ENABLED='true'
$env:METING_API_URL='http://127.0.0.1:8000/api'
$env:METING_PLATFORMS='tencent,kugou'
$env:METING_TOKEN='<server-only-meting-token>'
```

`METING_TOKEN` 只用于服务端生成 Meting 敏感操作的签名；不得从客户端传入或写入日志。Meting sidecar 自己的 QQ/酷狗/酷我 Cookie 也只能配置在受控服务端，不能复用或转发 DreamMusic 用户 Cookie。

## 归一化引用

适配器输出来源无关的内部歌曲引用：

```json
{
  "source": "meting-tencent",
  "sourceId": "platform-song-id",
  "kind": "song"
}
```

平台字符串 ID 不会写入现有数字 `id` 字段。`search`、`song/detail` 和 `song/url/v1` 使用同一个来源 ID；播放 URL 只在内存中按来源和歌曲引用短时缓存，并受独立超时和请求间隔限制。

## 当前边界

- 已覆盖 `tencent`、`kugou`、`kuwo` 三种 adapter 配置，默认启用候选为 QQ 和酷狗但总开关关闭。
- 普通客户端仍然只看到兼容的 api-enhanced 公共路径；#4 不升级 HarmonyOS `mediaRef`。
- `song/url/match` 和 `/auth/downloads` 继续是下载域，不会被 Meting 普通播放 POC 调用。
- 真实平台的授权、地区、内容可播放性和条款需要单独验收；Meting 的 API 可用不等于内容可合法播放或下载。
