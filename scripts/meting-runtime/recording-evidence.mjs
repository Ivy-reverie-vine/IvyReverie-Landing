/** Keep evidence that @meting/core's formatted song otherwise discards. No extra HTTP. */
export function preserveRecordingEvidence(meting) {
  const provider = meting.provider
  const format = provider.format.bind(provider)
  provider.format = raw => {
    const song = format(raw)
    const entry = raw.musicData || raw
    const seconds = Number(entry.interval ?? entry.duration ?? 0)
    const millis = Number(entry.timelen ?? 0)
    return { ...song,
      durationMs: Number.isFinite(millis) && millis > 0 ? millis
        : Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : 0,
      originalTitle: String(entry.filename || entry.fileName || entry.title || entry.name || song.name),
      versionTags: [entry.subtitle, entry.version_label, entry.album?.subtitle,
        ...(Array.isArray(entry.alia) ? entry.alia : []), ...(Array.isArray(entry.tns) ? entry.tns : [])]
        .filter(value => typeof value === 'string' && value.trim()),
    }
  }
  return meting
}
