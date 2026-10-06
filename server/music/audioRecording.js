// Chromaprint algorithm 1: 4096-sample frames with 2/3 overlap at 11025 Hz.
// Chromaprint's 4096-sample frame advances by floor(4096 / 3) samples.
const STEP_SECONDS = 1365 / 11025
const bitCount = value => { let n = value >>> 0, count = 0; while (n) { n &= n - 1; count++ } return count }

export function compareRecordingFingerprints(reference, candidate, startSeconds) {
  const rejected = reason => ({ matched: false, reason, policy: 'catalog-preview-chromaprint-v1' })
  if (!Number.isFinite(startSeconds) || startSeconds < 0 || reference.length < 150 ||
    new Set(reference).size < reference.length * 0.6) return rejected('reference_evidence_insufficient')
  const expected = Math.round(startSeconds / STEP_SECONDS), padding = Math.floor(1 / STEP_SECONDS)
  let best
  for (let offset = Math.max(0, expected - padding); offset <= Math.min(candidate.length - reference.length, expected + padding); offset++) {
    const errors = reference.map((hash, index) => bitCount(hash ^ candidate[index + offset]))
    const mean = errors.reduce((sum, value) => sum + value, 0) / errors.length
    if (!best || mean < best.meanBitErrors) best = { offset, meanBitErrors: mean,
      p95BitErrors: errors.sort((a, b) => a - b)[Math.floor(errors.length * 0.95)] }
  }
  if (!best) return rejected('reference_alignment_unavailable')
  return { matched: best.meanBitErrors <= 4 && best.p95BitErrors <= 8,
    reason: best.meanBitErrors <= 4 && best.p95BitErrors <= 8 ? 'catalog_preview_audio_match' : 'audio_content_unverified',
    policy: 'catalog-preview-chromaprint-v1', sampleHashes: reference.length,
    comparedSeconds: reference.length * STEP_SECONDS, alignmentSeconds: best.offset * STEP_SECONDS,
    referenceStartSeconds: startSeconds, meanBitErrors: best.meanBitErrors, p95BitErrors: best.p95BitErrors }
}
