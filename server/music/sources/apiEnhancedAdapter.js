/**
 * api-enhanced 的来源适配器。
 *
 * 这里只负责上游协议和 cookie 注入；跨来源选择由 MusicOrchestrator 负责。
 */
import { assessAudio, trialFlag } from '../audioIntegrity.js'

export class ApiEnhancedAdapter {
  constructor({ upstream, fetchUpstream }) {
    this.id = 'api-enhanced'
    this.upstream = upstream
    this.fetchUpstream = fetchUpstream
  }

  capabilities() {
    return ['search', 'detail', 'lyrics', 'playback']
  }

  async request({ path, query = {}, method = 'GET', body, user, timeoutMs, signal }) {
    signal?.throwIfAborted()
    if (path === 'song/detail' && query.id !== undefined && query.ids === undefined) {
      query = { ...query, ids: query.id }
      delete query.id
    }
    const upstream = new URL(`${this.upstream}/${path}`)
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) upstream.searchParams.set(key, String(value))
    }
    if (user?.netease_cookie && !upstream.searchParams.has('cookie')) {
      upstream.searchParams.set('cookie', user.netease_cookie)
    }
    if (method === 'POST' && !upstream.searchParams.has('timestamp')) {
      upstream.searchParams.set('timestamp', String(Date.now()))
    }

    const init = { method, headers: {}, signal }
    if (method === 'POST' || method === 'PUT') {
      init.headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body ?? {})
    }
    const upstreamRes = await this.fetchUpstream(upstream, init, timeoutMs)
    const text = await upstreamRes.text()
    let responseBody
    try {
      responseBody = JSON.parse(text)
    } catch {
      responseBody = { code: upstreamRes.status, raw: text }
    }
    if (path === 'song/url/v1' && upstreamRes.ok && responseBody?.code === 200) {
      const resource = responseBody.data?.[0]
      let catalogDurationMs = 0
      try {
        const detail = await this.request({ path: 'song/detail', query: { ids: query.id }, user, timeoutMs, signal })
        const song = detail.status === 200 && detail.body?.code === 200
          ? detail.body.songs?.find(song => String(song.id) === String(query.id)) : null
        catalogDurationMs = Number(song?.dt || 0)
      } catch { /* Missing catalog evidence remains unknown. */ }
      signal?.throwIfAborted()
      responseBody.audioIntegrity = assessAudio({ url: resource?.url,
        catalogDurationMs, resourceDurationMs: Number(resource?.time || 0), trial: trialFlag(resource),
        identityMatches: String(resource?.id) === String(query.id) })
    }
    return { status: upstreamRes.status, body: responseBody }
  }
}
