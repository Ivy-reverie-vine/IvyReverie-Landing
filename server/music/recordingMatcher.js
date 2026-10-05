// Metadata-only policy: retain uncertainty rather than guess a replacement recording.
export const RECORDING_MATCH_POLICY = 'metadata-strict-v1'
const versionPattern = /\b(live|cover|remix|remaster(?:ed)?|re[- ]?record(?:ed|ing)?|instrumental|karaoke|acoustic|demo|edit|sped[- ]?up|slowed|version|ver|mix)\b|现场|翻唱|重录|重制|伴奏|纯音乐|变速|加速|减速|演唱会|不插电|版本|版|串烧|剪辑|混音/i
const unknownPattern = /^(unknown|unknown artist|various artists|未知|未知歌手|群星|佚名)$/i
const normalize = value => typeof value === 'string' ? value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ') : ''

export function recordingEvidence(song) {
  const title = normalize(song.title)
  const artists = [...new Set((song.artists || []).map(normalize))].sort()
  const album = normalize(song.album?.name)
  const annotations = (song.versionTags || []).map(normalize).filter(Boolean).sort()
  const durationMs = song.durationMs
  const originalTitle = normalize(song.originalTitle)
  const text = [title, originalTitle, album, ...artists, ...annotations].join(' ')
  const filenameTitle = (song.artists || []).map(normalize).join('、') + ' - ' + title
  const unexplainedTitle = originalTitle && originalTitle !== title && originalTitle !== filenameTitle
  // Unexplained title qualifiers stay independent too; never strip them to boost matching.
  const versionUncertain = !!unexplainedTitle || versionPattern.test(text) || /[()[\]{}（）【】]/.test(title + originalTitle) || annotations.length > 0
  const complete = !!title && artists.length > 0 && artists.every(name => name && !unknownPattern.test(name)) &&
    !!album && !unknownPattern.test(album) && Number.isFinite(durationMs) && durationMs > 0
  return { title, artists, album, annotations, durationMs, eligible: complete && !versionUncertain,
    reason: versionUncertain ? 'version_uncertain' : complete ? 'complete_metadata' : 'insufficient_evidence' }
}

export function sameRecording(left, right) {
  const a = recordingEvidence(left), b = recordingEvidence(right)
  return a.eligible && b.eligible && a.title === b.title && a.album === b.album &&
    JSON.stringify(a.artists) === JSON.stringify(b.artists) &&
    Math.abs(a.durationMs - b.durationMs) <= Math.min(2000, Math.min(a.durationMs, b.durationMs) * 0.01)
}

/** Stable representative; all members must match each other, not only a bridge entry. */
export class RecordingSearchGroups {
  constructor() {
    this.groups = []
    this.seen = new Set()
    this.buckets = new Map()
  }

  append(songs) {
    for (const song of songs) {
      if (this.seen.has(song.mediaRef)) continue
      this.seen.add(song.mediaRef)
      const evidence = recordingEvidence(song)
      const key = JSON.stringify([evidence.title, evidence.artists, evidence.album])
      const bucket = evidence.eligible ? (this.buckets.get(key) || []) : []
      const candidates = bucket.filter(group => group.entries.every(entry => sameRecording(entry, song)))
      // Multiple compatible groups are ambiguous; never take the first result as a fallback.
      if (candidates.length === 1) candidates[0].entries.push(song)
      else {
        const group = { id: song.mediaRef, entries: [song] }
        this.groups.push(group)
        if (evidence.eligible) { bucket.push(group); this.buckets.set(key, bucket) }
      }
    }
    return this.groups.map(group => ({ id: group.id, entries: group.entries,
      matchPolicy: RECORDING_MATCH_POLICY,
      reason: group.entries.length > 1 ? 'same_recording_metadata' : recordingEvidence(group.entries[0]).reason }))
  }
}
