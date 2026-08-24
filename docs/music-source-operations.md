# 多音源灰度、熔断与生产验收

## 运行时控制

音乐来源注册在 NightDream 服务端完成。每个来源独立维护：

- `enabled`：是否接收新请求；
- `priority`：同一能力下的调度顺序，可实时降权；
- `maxConcurrent`：单来源并发上限；
- 熔断阈值与窗口：连续失败达到 `*_SOURCE_FAILURE_THRESHOLD` 后打开，窗口结束允许一次半开探测；
- 适配器自己的短缓存和最小请求间隔。

管理员可通过以下接口在不发布客户端的情况下回滚来源：

```text
GET  /dreammusic/api/v1/auth/music-sources
POST /dreammusic/api/v1/auth/music-sources/:sourceId
     {"action":"enable"|"disable"|"reset-circuit"}
     {"action":"priority","priority":20}
```

接口仅接受 DreamMusic 管理员会话或 API Key，响应只包含状态和指标，不包含来源凭据、Cookie、上游响应或播放 URL。

## 指标

状态接口中的每个来源包含：搜索请求/成功率、播放请求/解析成功率、平均延迟、空 URL/URL 失效率、错误类别计数、当前并发数、熔断状态和最近时间戳。指标为有界进程内数据；重启会清空计数，长期监控应由部署层抓取或后续接入持久化指标系统。

播放解析失败、空 URL、超时和上游错误都会进入来源熔断计数；成功的半开探测会恢复来源。只有 5xx/429 和网络类故障继续尝试低优先级来源，301 等账户业务状态仍原样返回。

## 配置示例

```powershell
$env:AUDIUS_SOURCE_ENABLED='false'             # 生产默认关闭，验收完成后再开
$env:AUDIUS_SOURCE_PRIORITY='30'
$env:AUDIUS_SOURCE_MAX_CONCURRENT='4'
$env:AUDIUS_SOURCE_FAILURE_THRESHOLD='3'
$env:AUDIUS_SOURCE_CIRCUIT_OPEN_MS='30000'
```

Meting 使用同名 `METING_*` 配置，api-enhanced 使用 `API_ENHANCED_SOURCE_*` 配置。关闭或降权来源只影响 NightDream 调度，不要求 HarmonyOS 发布新版本。

## 生产闸门

Meting 和 Audius 在真实设备完成在线播放、后台播控、URL 过期重解析、本地库边界检查，并完成来源条款、授权、部署地区和凭据安全检查前，必须保持关闭。通过搜索或 POC 只能证明接口可用，不能宣称全部内容可稳定播放、下载或离线保存。
