import { sameRecording } from './recordingMatcher.js'

const text = value => typeof value === 'string' ? value.trim() : ''
const readable = value => text(value).replace(/\[[^\]]*\]/g, '').trim()

export function matchLyrics(song, row) {
  if (!Number.isSafeInteger(row?.id) || row.id <= 0) return false
  return sameRecording(song, { title: row.trackName, artists: [row.artistName],
    album: { name: row.albumName }, durationMs: Number(row.duration) * 1000 })
}

export function reliableLrc(lrc, durationMs) {
  const matches = [...lrc.matchAll(/\[(\d+):(\d{2})(?:[.:](\d{1,3}))?\]/g)]
  if (matches.some(match => Number(match[2]) >= 60)) return false
  const times = matches
    .map(match => (Number(match[1]) * 60 + Number(match[2]) + Number('0.' + (match[3] || '0'))) * 1000)
  return times.length >= 2 && times.every((time, i) => time <= durationMs + 2000 && (!i || time >= times[i - 1]))
}

// Direct public API, no service deployment. Cache provider content, never audio timing conclusions.
export class LrclibClient {
  constructor({ fetchImpl = globalThis.fetch, timeoutMs = 5000, now = Date.now } = {}) {
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
    this.now = now
    this.cache = new Map()
    this.inFlight = 0
  }

  async lookup(song, signal) {
    if (signal?.aborted) return { status: 'cancelled' }
    if (!sameRecording(song, song)) return { status: 'missing', reason: 'insufficient_catalog_metadata' }
    const key = JSON.stringify([song.title, song.artists, song.album.name, song.durationMs])
    const cached = this.cache.get(key)
    if (cached?.expiresAt > this.now()) return cached.result
    this.cache.delete(key)
    if (this.inFlight >= 8) return { status: 'unavailable', reason: 'concurrency_limit' }
    this.inFlight++
    const controller = new AbortController()
    let timer, cancel
    try {
      const stopped = new Promise((_, reject) => {
        const stop = code => { const error = new Error(code); error.code = code; controller.abort(); reject(error) }
        timer = setTimeout(() => stop('timeout'), this.timeoutMs)
        cancel = () => stop('cancelled')
        signal?.addEventListener('abort', cancel, { once: true })
        if (signal?.aborted) cancel()
      })
      const work = async () => {
        const query = new URLSearchParams({ track_name: song.title, artist_name: song.artists.join(', '),
          album_name: song.album.name, duration: String(song.durationMs / 1000) })
        const request = async path => {
          controller.signal.throwIfAborted()
          const response = await this.fetchImpl('https://lrclib.net/api/' + path + '?' + query, {
            signal: controller.signal, headers: { Accept: 'application/json',
              'User-Agent': 'DreamMusic/1.0 (https://github.com/Ivy-reverie-vine/DreamMusic)' },
          })
          if (response.status === 404 && path === 'get') return null
          if (!response.ok) { const error = new Error('lrclib request rejected'); error.code = 'failed'; throw error }
          return response.json()
        }
        const usable = row => matchLyrics(song, row) &&
          (row.instrumental === true || readable(row.syncedLyrics) || readable(row.plainLyrics))
        let row = await request('get')
        if (!usable(row)) {
          const rows = await request('search')
          if (!Array.isArray(rows)) throw new Error('invalid lrclib search response')
          const candidates = rows.slice(0, 100).filter(usable)
          const unique = [...new Map(candidates.map(item => [item.id, item])).values()]
          if (unique.length !== 1) return { status: 'missing', reason: unique.length ? 'ambiguous_candidates' : 'no_match' }
          row = unique[0]
        }
        const synced = text(row.syncedLyrics), plain = text(row.plainLyrics)
        return { status: row.instrumental === true ? 'instrumental' : 'available',
          id: row.id, lrc: readable(synced) ? synced : plain, timed: reliableLrc(synced, song.durationMs),
          textType: row.instrumental === true ? 'instrumental' : readable(synced) ? 'synced' : 'plain' }
      }
      const result = await Promise.race([stopped, work()])
      if (signal?.aborted) return { status: 'cancelled' }
      if (['available', 'instrumental'].includes(result.status)) {
        if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value)
        this.cache.set(key, { result, expiresAt: this.now() + 15 * 60 * 1000 })
      }
      return result
    } catch (error) {
      return { status: signal?.aborted ? 'cancelled' : error.code === 'timeout' ? 'timeout' : 'failed' }
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      this.inFlight--
    }
  }
}
