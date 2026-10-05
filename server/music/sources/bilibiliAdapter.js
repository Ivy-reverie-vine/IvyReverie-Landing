import { assessAudio, trialFlag } from '../audioIntegrity.js'

const USER_AGENT = 'Mozilla/5.0'
const RESOURCE = /^(BV[0-9A-Za-z]{10}):([1-9][0-9]*)$/

function failure(code, message, status = 502) {
  const error = new Error(message)
  error.code = code
  error.status = status
  return error
}

// Concrete BV/CID resources only. No song-name search or implicit first-part fallback.
export class BilibiliAdapter {
  constructor({ fetchImpl = globalThis.fetch } = {}) {
    this.id = 'bilibili'
    this.fetchImpl = fetchImpl
  }

  capabilities() { return ['detail', 'playback'] }

  async request({ path, query = {}, timeoutMs = 8000, signal }) {
    const match = RESOURCE.exec(String(query.id || ''))
    if (!match || !Number.isSafeInteger(Number(match[2]))) {
      return this.errorResult(failure('INVALID_BILIBILI_RESOURCE', '需要指定有效的 BV 和 CID', 400))
    }
    if (!['song/detail', 'song/url/v1'].includes(path)) {
      return this.errorResult(failure('CAPABILITY_UNSUPPORTED', 'B 站仅支持指定资源的详情与播放', 501))
    }
    const [, bvid, cid] = match
    const referer = `https://www.bilibili.com/video/${bvid}/`
    const deadline = AbortSignal.timeout(Math.max(1, Number(timeoutMs)))
    const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline
    const headers = { Referer: referer, 'User-Agent': USER_AGENT }
    try {
      const video = await this.json('/x/web-interface/view', { bvid }, headers, requestSignal)
      if (video.bvid !== bvid) throw failure('RESOURCE_IDENTITY_MISMATCH', '返回的视频身份不符')
      const part = Array.isArray(video.pages) && video.pages.find(part => String(part.cid) === cid)
      if (!part) throw failure('BILIBILI_CID_NOT_FOUND', 'CID 不属于指定视频', 404)
      const resource = { bvid, cid, page: part.page, title: String(video.title || ''),
        partTitle: String(part.part || ''), uploader: { id: String(video.owner?.mid || ''), name: String(video.owner?.name || '') } }
      const detail = { source: this.id, sourceId: `${bvid}:${cid}`, kind: 'song',
        title: resource.partTitle || resource.title, artists: [],
        album: { name: resource.title, pictureUrl: String(video.pic || '') },
        durationMs: Number(part.duration || 0) * 1000, resource }
      if (path === 'song/detail') return { status: 200, body: { code: 200, data: [detail] } }

      const playback = await this.json('/x/player/playurl', { bvid, cid, fnval: '16', fnver: '0', fourk: '1' }, headers, requestSignal)
      if ((playback.cid !== undefined && String(playback.cid) !== cid) ||
        (playback.bvid !== undefined && playback.bvid !== bvid)) {
        throw failure('RESOURCE_IDENTITY_MISMATCH', '返回的音频身份不符')
      }
      const audio = playback.dash?.audio
      if (!Array.isArray(audio) || !audio.length) throw failure('BILIBILI_NO_AUDIO', '指定分 P 没有可用的 DASH 音频')
      // The existing players support AAC in MP4; do not silently return video durl or Dolby.
      const track = audio.find(item => (item.mimeType || item.mime_type) === 'audio/mp4' &&
        /^mp4a\.40\.(2|5|29)$/.test(String(item.codecs || '')) && (item.baseUrl || item.base_url))
      if (!track) throw failure('BILIBILI_FORMAT_UNSUPPORTED', '指定分 P 没有支持的 AAC 音频')
      const url = String(track.baseUrl || track.base_url)
      if (!/^https?:$/.test(new URL(url).protocol)) throw failure('BILIBILI_NO_AUDIO', '音频 URL 无效')
      const resourceDurationMs = Number(playback.timelength || 0)
      const audioIntegrity = assessAudio({ url, catalogDurationMs: detail.durationMs,
        resourceDurationMs, trial: trialFlag(playback) })
      audioIntegrity.evidence.push('bilibili_cid_membership', 'dash_audio_representation')
      return { status: 200, body: { code: 200, audioIntegrity, data: [{ url, source: this.id,
        sourceId: detail.sourceId, resource, durationMs: resourceDurationMs,
        media: { container: 'mp4', mimeType: 'audio/mp4', codecs: track.codecs, delivery: 'dash_audio',
          representationId: track.id, dashDurationMs: Number(playback.dash.duration || 0) * 1000 },
        // Consumed by the gateway, never exposed as client protocol details.
        mediaTransport: { requiresProxy: true, headers } }] } }
    } catch (error) {
      if (requestSignal.aborted) return this.errorResult(failure('SOURCE_TIMEOUT', 'B 站请求超时', 504))
      return this.errorResult(error.code ? error : failure('BILIBILI_UPSTREAM_FAILURE', 'B 站请求失败'))
    }
  }

  errorResult(error) {
    return { status: error.status || 502, body: { code: error.status || 502,
      errorCode: error.code, message: error.message, data: [],
      audioIntegrity: assessAudio({ url: '' }) } }
  }

  async json(path, query, headers, signal) {
    const url = new URL(path, 'https://api.bilibili.com')
    url.search = new URLSearchParams(query).toString()
    const response = await this.fetchImpl(url, { headers, signal })
    if (!response.ok) { await response.body?.cancel(); throw failure('BILIBILI_HTTP_ERROR', `B 站返回 HTTP ${response.status}`) }
    let payload
    try { payload = await response.json() } catch { throw failure('BILIBILI_INVALID_RESPONSE', 'B 站响应格式无效') }
    if (payload.code !== 0 || !payload.data || typeof payload.data !== 'object') {
      throw failure('BILIBILI_REJECTED', `B 站拒绝资源请求（${Number(payload.code) || 'unknown'}）`)
    }
    return payload.data
  }
}
