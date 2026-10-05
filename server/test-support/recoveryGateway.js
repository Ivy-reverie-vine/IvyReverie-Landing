import { startIdentityGateway } from './identityGateway.js'

// Controlled provider expiry, actual HTTP media bytes. 90-second PCM WAV tone,
// not a provider track or evidence of natural expiry on a public platform.
function wav() {
  const rate = 16000, size = rate * 90 * 2, buffer = Buffer.alloc(44 + size)
  buffer.write('RIFF'); buffer.writeUInt32LE(36 + size, 4); buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16); buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(rate, 24); buffer.writeUInt32LE(rate * 2, 28)
  buffer.writeUInt16LE(2, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(size, 40)
  for (let sample = 0; sample < size / 2; sample++) buffer.writeInt16LE(Math.round(700 * Math.sin(sample * 2 * Math.PI * 220 / rate)), 44 + sample * 2)
  return buffer
}
export async function startRecoveryGateway() {
  const gateway = await startIdentityGateway()
  const bytes = wav(), evidence = []
  const controls = { failFresh: false, resolveDelayMs: 0, version: 1, round: 0 }
  gateway.app.get('/test/media/:version', (req, res) => {
    res.set('Cache-Control', 'no-store')
    const expired = req.params.version === '1' || controls.failFresh
    evidence.push({ stage: 'media_http', version: req.params.version, status: expired ? 410 : 200 })
    if (expired) return res.status(410).end('controlled expired URL')
    res.type('audio/wav').set('Accept-Ranges', 'bytes')
    const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '')
    if (range) {
      const start = Number(range[1]), end = range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1
      if (start > end) return res.status(416).end()
      res.status(206).set('Content-Range', `bytes ${start}-${end}/${bytes.length}`).end(bytes.subarray(start, end + 1))
    } else res.end(bytes)
  })
  const json = body => new Response(JSON.stringify(body), { status: 200 })
  gateway.controls.beforeResponse = async (url, signal) => {
    if (url.searchParams.get('type') === 'url' && url.searchParams.has('timestamp') && controls.resolveDelayMs) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, controls.resolveDelayMs)
        signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('cancelled')) }, { once: true })
      })
    }
  }
  gateway.controls.thirdPartyResponse = url => {
    const type = url.searchParams.get('type')
    if (type === 'search') return json([{ id: 'selected', name: gateway.song.name, artist: ['原歌手'], album: '目录专辑', duration: 90 }])
    if (type === 'song') return json([{ id: 'selected', duration: 90 }])
    if (type === 'url') {
      if (url.searchParams.has('timestamp')) controls.version++
      evidence.push({ stage: 'provider_resolution', refresh: url.searchParams.has('timestamp'), version: controls.version })
      return json({ url: `${gateway.base}/test/media/${controls.version}?round=${controls.round}`, durationMs: 90000, isPreview: false })
    }
    return null
  }
  async function select() {
    controls.version = 1
    controls.round++
    gateway.orchestrator.registry.get('meting-tencent').adapter.clearCache()
    gateway.orchestrator.resetSourceCircuit('meting-tencent')
    const headers = { 'X-API-Key': gateway.apiKey }
    const { body: search } = await gateway.request('/dreammusic/api/v2/search?aggregate=true&merge=true&keywords=目录', { headers })
    const catalog = search.data.find(row => row.source === 'api-enhanced')
    const selected = search.data.find(row => row.source === 'meting-tencent')
    const params = new URLSearchParams({ manual: 'true', mediaRef: selected.mediaRef, catalogRef: catalog.mediaRef, searchSession: search.searchSession })
    const { body } = await gateway.request('/dreammusic/api/v2/song/url/v1?' + params, { headers })
    return { catalog, selected, searchSession: search.searchSession, body }
  }
  return { ...gateway, recoveryControls: controls, evidence, select }
}
