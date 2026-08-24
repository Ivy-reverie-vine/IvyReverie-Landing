const DEFAULT_MAX_EVENTS = 200

export const DIAGNOSTIC_STAGE_SOURCE_RESOLUTION = 'source_resolution'
export const DIAGNOSTIC_STAGE_URL_RESPONSE = 'url_response'

export const DIAGNOSTIC_CATEGORY_SOURCE_TIMEOUT = 'source_timeout'
export const DIAGNOSTIC_CATEGORY_EMPTY_PLAYBACK_URL = 'empty_playback_url'
export const DIAGNOSTIC_CATEGORY_URL_EXPIRED_OR_UNREACHABLE = 'url_expired_or_unreachable'
export const DIAGNOSTIC_CATEGORY_SOURCE_FAILURE = 'source_failure'

const SAFE_FIELD = /^[a-zA-Z0-9_.-]{1,64}$/

function safeField(value, fallback) {
  const candidate = String(value ?? '')
  return SAFE_FIELD.test(candidate) ? candidate : fallback
}

function safeDuration(value) {
  const duration = Number(value)
  if (!Number.isFinite(duration)) return 0
  return Math.max(0, Math.round(duration))
}

function safeLimit(value) {
  const limit = Number(value)
  if (!Number.isFinite(limit)) return DEFAULT_MAX_EVENTS
  return Math.max(1, Math.min(2000, Math.floor(limit)))
}

/**
 * Bounded in-memory diagnostics. Events intentionally contain no URL, cookie,
 * token, username, or upstream response body so the buffer is safe to inspect.
 */
export function createPlaybackDiagnostics({ maxEvents = DEFAULT_MAX_EVENTS, now = Date.now } = {}) {
  const events = []
  const limit = safeLimit(maxEvents)

  return {
    record(input = {}) {
      const event = {
        timestampMs: Number(now()),
        source: safeField(input.source, 'unknown'),
        capability: safeField(input.capability, 'unknown'),
        stage: safeField(input.stage, 'unknown'),
        durationMs: safeDuration(input.durationMs),
        ok: input.ok === true,
      }
      if (!event.ok && input.errorCategory) {
        event.errorCategory = safeField(input.errorCategory, 'unknown_failure')
      }
      events.push(event)
      while (events.length > limit) events.shift()
      return event
    },

    recent(requestedLimit = limit) {
      const count = Math.max(1, Math.min(limit, Math.floor(Number(requestedLimit) || limit)))
      return events.slice(-count).map((event) => ({ ...event }))
    },

    clear() {
      events.length = 0
    },
  }
}
