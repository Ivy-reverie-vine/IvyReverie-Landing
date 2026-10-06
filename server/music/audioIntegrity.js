// Provider duration describes the resolved resource, never lyrics, bitrate or a Range probe.
export function assessAudio({ url, catalogDurationMs = 0, resourceDurationMs = 0, trial, identityMatches = true, inspection }) {
  const catalog = Number.isFinite(catalogDurationMs) && catalogDurationMs > 0 ? catalogDurationMs : 0
  const resource = Number.isFinite(resourceDurationMs) && resourceDurationMs > 0 ? resourceDurationMs : 0
  const evidence = []
  if (catalog) evidence.push('catalog_duration')
  if (resource) evidence.push('provider_resource_duration')
  if (trial === true) evidence.push('provider_trial')
  if (trial === false) evidence.push('provider_non_trial')
  const result = (status, reason) => ({ status, reason, catalogDurationMs: catalog, resourceDurationMs: resource, evidence })
  if (!url) return result('unavailable', 'empty_url')
  try {
    if (!['http:', 'https:'].includes(new URL(url).protocol)) return result('unavailable', 'invalid_url')
  } catch { return result('unavailable', 'invalid_url') }
  if (!identityMatches) return result('unavailable', 'resource_identity_mismatch')
  if (trial === true) return result('preview', 'explicit_trial')
  // Encoding padding: at most two seconds and 1% of catalog duration.
  const tolerance = Math.min(2000, catalog * 0.01)
  if (catalog && resource && Math.abs(catalog - resource) > tolerance) {
    return result(resource < catalog ? 'preview' : 'unknown', resource < catalog ? 'resource_shorter' : 'duration_mismatch')
  }
  if (inspection?.decoded === true && inspection.policy === 'complete-aac-decode-v1' && catalog &&
    Number.isFinite(inspection.durationMs) && inspection.durationMs > 0 &&
    Math.abs(catalog - inspection.durationMs) <= tolerance) {
    evidence.push('complete_media_decode', 'decoded_resource_duration')
    return { ...result('full', 'decoded_complete_media'), inspection }
  }
  if (!catalog || !resource || trial !== false) return { ...result('unknown', 'missing_evidence'), ...(inspection ? { inspection } : {}) }
  return result('full', 'provider_duration_and_non_trial')
}

export function trialFlag(raw) {
  if (raw?.isPreview === true || raw?.trial === true ||
    (raw?.freeTrialInfo !== null && typeof raw?.freeTrialInfo === 'object')) return true
  // A formatter's string "null" is not a provider's explicit non-trial marker.
  if (raw?.freeTrialInfo !== undefined && raw.freeTrialInfo !== null) return undefined
  if (raw?.isPreview === false || raw?.trial === false || raw?.freeTrialInfo === null) return false
  return undefined
}
