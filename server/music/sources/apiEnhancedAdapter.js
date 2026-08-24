/**
 * api-enhanced 的来源适配器。
 *
 * 这里只负责上游协议和 cookie 注入；跨来源选择由 MusicOrchestrator 负责。
 */
export class ApiEnhancedAdapter {
  constructor({ upstream, fetchUpstream }) {
    this.id = 'api-enhanced'
    this.upstream = upstream
    this.fetchUpstream = fetchUpstream
  }

  capabilities() {
    return ['search', 'detail', 'lyrics', 'playback']
  }

  async request({ path, query = {}, method = 'GET', body, user, timeoutMs }) {
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

    const init = { method, headers: {} }
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
    return { status: upstreamRes.status, body: responseBody }
  }
}
