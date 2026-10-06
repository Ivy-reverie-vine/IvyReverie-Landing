import { recordingEvidence, sameRecording } from './recordingMatcher.js'

const normalize = text => String(text || '').normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
const unsafe = /\b(live|cover|remix|mv|music video|edit(?:ed)?|karaoke|instrumental|acoustic|demo|remaster(?:ed)?|sped|slowed)\b|翻唱|现场|演唱会|伴奏|剪辑|串烧|混音|变速|加速|减速|慢速|降调|升调|环绕|鼓谱|琴谱|示范|对白|前奏|后奏|片段|节选/i
const credit = (description, names) => {
  const matches = [...description.matchAll(new RegExp(`^(?:${names})\\s*[:：]\\s*(.+)$`, 'gmi'))]
  return matches.length === 1 ? matches[0][1].trim() : ''
}

export function canCompareBilibiliAudio(catalog, entry) {
  const text = [entry.resource.title, entry.resource.partTitle, entry.description].join(' ').replace(/\b(mv|music video)\b/gi, '')
  const part = normalize(entry.resource.partTitle), title = normalize(catalog.title)
  const artist = normalize((catalog.artists || []).join(' '))
  return recordingEvidence(catalog).eligible && !unsafe.test(text) &&
    [title, `${artist} - ${title}`, `${title} - ${artist}`].includes(part) &&
    Math.abs(catalog.durationMs - entry.durationMs) <= Math.min(2000, catalog.durationMs * 0.01)
}

// Search ranking and uploader identity are never recording evidence. Require a
// catalog-bound audio match, or explicit credits/provenance, plus part/duration checks.
export function assessBilibiliRecording(catalog, entry) {
  if (canCompareBilibiliAudio(catalog, entry) && entry.audioMatch?.matched === false) {
    return { status: 'manual', reason: entry.audioMatch.reason || 'audio_content_unverified', evidence: {
      policy: 'catalog-preview-chromaprint-v1', title: catalog.title, artists: catalog.artists, album: catalog.album.name,
      catalogDurationMs: catalog.durationMs, partDurationMs: entry.durationMs,
      catalogLink: false, originalAlbumAudio: false, audioMatch: entry.audioMatch } }
  }
  if (canCompareBilibiliAudio(catalog, entry) && entry.audioMatch?.matched === true &&
    entry.audioMatch.policy === 'catalog-preview-chromaprint-v1' && entry.audioMatch.catalogRef === catalog.mediaRef) {
    return { status: 'same_recording', reason: 'catalog_preview_audio_and_duration', evidence: {
      policy: entry.audioMatch.policy, title: catalog.title, artists: catalog.artists, album: catalog.album.name,
      catalogDurationMs: catalog.durationMs, partDurationMs: entry.durationMs,
      catalogLink: false, originalAlbumAudio: false, audioMatch: entry.audioMatch } }
  }
  const description = String(entry.description || '')
  const title = credit(description, '歌名|歌曲|曲名|track|song')
  const artist = credit(description, '歌手|演唱者|artist')
  const album = credit(description, '专辑|album')
  const evidence = { policy: 'bilibili-credits-v1', title, artists: artist ? [artist] : [], album,
    catalogDurationMs: catalog.durationMs, partDurationMs: entry.durationMs, catalogLink: false,
    originalAlbumAudio: /^(?:音频|audio)\s*[:：]\s*(?:原专辑音轨|original album audio)\s*$/mi.test(description) }
  const reject = reason => ({ status: 'manual', reason, evidence })
  if (unsafe.test([entry.resource.title, entry.resource.partTitle, description].join(' '))) return reject('different_recording_or_extra_segments')
  if (!recordingEvidence(catalog).eligible) return reject('catalog_recording_uncertain')
  // Provenance must identify this catalog recording, not merely a platform or artist.
  const patterns = catalog.source === 'api-enhanced' ? /https?:\/\/music\.163\.com\/(?:#\/)?song\?[^\s<>]+/gi
    : catalog.source === 'meting-tencent' ? /https?:\/\/y\.qq\.com\/n\/ryqq\/songDetail\/[^\s<>]+/gi : null
  const links = patterns ? [...description.matchAll(patterns)].map(match => match[0]) : []
  evidence.catalogLink = links.some(link => {
    try {
      const url = new URL(link.replace('/#/', '/'))
      return catalog.source === 'api-enhanced' ? url.searchParams.get('id') === catalog.sourceId
        : url.pathname.split('/').pop() === catalog.sourceId
    } catch { return false }
  })
  if (!evidence.catalogLink) return reject('recording_provenance_missing')
  if (!evidence.originalAlbumAudio) return reject('audio_content_uncertain')
  if (!sameRecording(catalog, { title, artists: evidence.artists, album: { name: album }, durationMs: entry.durationMs })) {
    return reject('recording_credits_or_duration_mismatch')
  }
  const part = normalize(entry.resource.partTitle)
  const exactTitles = [normalize(title), normalize(`${artist} - ${title}`), normalize(`${title} - ${artist}`)]
  if (!exactTitles.includes(part)) return reject('part_recording_uncertain')
  return { status: 'same_recording', reason: 'catalog_link_credits_and_part_duration', evidence }
}
