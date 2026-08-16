/**
 * 下载直链解析（原下载接口 → unblock → 解灰换源）。
 * 只返回直链，不落盘、不扣点；供旧 /points/download 与下载管理器复用。
 */
export async function resolveDownloadUrl({ config, user, songId, level }) {
  const attempts = [
    { path: '/song/download/url/v1', extra: { id: String(songId), level }, label: 'original' },
    { path: '/song/url/v1', extra: { id: String(songId), level, unblock: 'true' }, label: 'unblock' },
    { path: '/song/url/match', extra: { id: String(songId), source: 'qq' }, label: 'match:qq' },
    { path: '/song/url/match', extra: { id: String(songId), source: 'kugou' }, label: 'match:kugou' },
    { path: '/song/url/match', extra: { id: String(songId), source: 'kuwo' }, label: 'match:kuwo' },
    { path: '/song/url/match', extra: { id: String(songId), source: 'migu' }, label: 'match:migu' },
  ]

  let upstreamOk = false
  for (const attempt of attempts) {
    const upstream = new URL(`${config.upstream}${attempt.path}`)
    for (const [k, v] of Object.entries(attempt.extra)) upstream.searchParams.set(k, v)
    upstream.searchParams.set('cookie', user.netease_cookie)
    upstream.searchParams.set('randomCNIP', 'true')
    upstream.searchParams.set('timestamp', String(Date.now()))
    try {
      const upstreamRes = await fetch(upstream)
      upstreamOk = true
      if (!upstreamRes.ok) continue
      const body = await upstreamRes.json().catch(() => ({}))
      const url = String(body?.data?.[0]?.url || '')
      if (url) return { url, source: attempt.label }
    } catch {
      continue
    }
  }

  if (!upstreamOk) {
    const err = new Error('上游 API 不可达，请稍后再试')
    err.code = 'UPSTREAM_DOWN'
    throw err
  }
  const err = new Error('下载链接获取失败（已尝试原曲、unblock 与 qq/kugou/kuwo/migu 解灰换源）')
  err.code = 'NO_SOURCE'
  throw err
}
