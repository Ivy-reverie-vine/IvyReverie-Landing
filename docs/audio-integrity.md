# 在线音频完整性契约（DreamMusic #24 / T05）

日期：2026-10-05。`/dreammusic/api/v1/song/url/v1` 与 v2 同一路由兼容添加 `audioIntegrity`，保留原来的 `data[].url`；v2 保留原目录、播放和歌词引用。正常在线播放只接受 `full`，没有合格资源时结束本次尝试。

```json
{
  "status": "full",
  "reason": "provider_duration_and_non_trial",
  "catalogDurationMs": 90000,
  "resourceDurationMs": 90000,
  "evidence": ["catalog_duration", "provider_resource_duration", "provider_non_trial"]
}
```

| status | 依据 |
| --- | --- |
| full | 对应目录与实际资源的正数时长均存在、差值 ≤ min(2000ms, 目录时长×1%)，且提供方显式说明非试听 |
| preview | 显式试听标记，或实际资源时长明显短于目录时长 |
| unknown | 缺目录/资源时长、缺非试听标记、资源明显长于目录，或标记格式不足以解释 |
| unavailable | 空/非法 URL、返回的资源身份不符；客户端媒体读取失败也归为此类 |

网易适配器以 `/song/detail` 同 ID 的 `dt` 为目录时长，以实际 `/song/url/v1` 条目的 `time` 为资源时长，以 `freeTrialInfo` 的真实 null 或试听对象区分标记。字符串 `"null"` 不作为非试听证明。目录详情失败保留未知，不从搜索时长补猜测。返回的音频 ID 必须符合所请求 ID。

Meting 以同资源详情的时长为目录依据，URL 响应的 `durationMs` 为资源时长，显式 `isPreview` / `trial` / `freeTrialInfo` 为标记。有声明的返回 ID 也必须一致。sidecar 保留格式器已经提供的这些字段，但不发明字段。当前 @meting/core 通常仅返回 URL/码率/大小，缺乏上述完整性证据时实际 QQ/酷狗/酷我资源保持 unknown。Audius 的目录时长与成功 stream 响应也不能单独证明完整，因此同样保留未知。

HTTP 200、非空 URL、文件大小、码率、歌词完整、HEAD 或前段 Range 成功均不作为整曲证明。此判定是提供方证据政策，不是声纹或整曲音频扫描。真实样本校准和设备解码另行记录，不能用受控样本宣称曲库完整率。

预览/未知有单独诊断分类，不计为完整版成功，也不因有效回答打开服务熔断；真实请求/空链接失败继续受原熔断约束。旧数字 ID 普通播放只属于网易资源，不跨平台复用 ID。Web 搜索、恢复队列、音质刷新和过期链接重试均检查完整性，停止普通播放里的 QQ 解灰兜底；显式下载接口未改变。

## 可重复检查

`npm test` 包含 `server/proxy.audioIntegrity.test.js`：两种真实适配器经过真实鉴权、SQLite、HTTP 网关，覆盖完整、试听、短/长资源、缺字段、伪 null、空/非法 URL、身份不符，以及试听不触发服务熔断。Web 搜索测试覆盖非完整版不进入 audio 元素、保留结果并重试同一资源。

同级 DreamMusic 的 `node scripts/check-audio-integrity.mjs` 执行真实 ArkTS API/队列/播放器/下载门禁，第三方 HTTP 与 Kit 是受控边界。测试完整读取并独立测量受控 90 秒 WAV；额外证明 HTTP 206 前段读取和歌词成功不能把未知改为完整，并覆盖媒体 HTTP 503、同资源恢复、v1 网易入口和本地离线播放。

本轮未执行真实网易/QQ/酷狗/Audius 音频取样，也未执行浏览器真实解码或 HarmonyOS 真机播放。详情见同级 `DreamMusic/docs/research/issue-24-validation.md`；这些验证边界不代表 #19 总规格完成。
