/**
 * 服务端音乐来源注册表。
 *
 * 注册表只管理来源身份、能力、优先级和开关，不包含跨来源调度逻辑。
 */
export class MusicSourceRegistry {
  constructor({ now = Date.now } = {}) {
    this.sources = new Map()
    this.now = now
  }

  register(adapter, sourceConfig = {}) {
    if (!adapter || typeof adapter.id !== 'string' || adapter.id.trim() === '') {
      throw new TypeError('music source adapter must declare a non-empty id')
    }
    if (this.sources.has(adapter.id)) {
      throw new Error(`music source already registered: ${adapter.id}`)
    }

    const declaredCapabilities = typeof adapter.capabilities === 'function'
      ? adapter.capabilities()
      : adapter.capabilities
    const capabilities = new Set(
      Array.isArray(sourceConfig.capabilities) ? sourceConfig.capabilities : declaredCapabilities || [],
    )
    this.sources.set(adapter.id, {
      id: adapter.id,
      adapter,
      enabled: sourceConfig.enabled !== false,
      priority: Number.isFinite(Number(sourceConfig.priority)) ? Number(sourceConfig.priority) : 0,
      timeoutMs: Math.max(1, Number(sourceConfig.timeoutMs || 15000)),
      capabilities,
      maxConcurrent: Math.max(1, Math.floor(Number(sourceConfig.maxConcurrent || 4))),
      circuitFailureThreshold: Math.max(1, Math.floor(Number(sourceConfig.circuitFailureThreshold || 3))),
      circuitOpenMs: Math.max(1000, Number(sourceConfig.circuitOpenMs || 30000)),
      inFlight: 0,
      failureStreak: 0,
      openUntilMs: 0,
      halfOpenInFlight: false,
      metrics: {
        requests: 0,
        successes: 0,
        searchRequests: 0,
        searchSuccesses: 0,
        playbackRequests: 0,
        playbackSuccesses: 0,
        urlFailures: 0,
        latencyTotalMs: 0,
        latencySamples: 0,
        errorCategories: {},
        lastErrorCategory: '',
        lastRequestAt: 0,
        lastSuccessAt: 0,
        lastFailureAt: 0,
      },
    })
    return this
  }

  get(id) {
    return this.sources.get(id) || null
  }

  list({ capability, enabledOnly = true } = {}) {
    return [...this.sources.values()]
      .filter((source) => !enabledOnly || source.enabled)
      .filter((source) => !capability || source.capabilities.has(capability))
      .filter((source) => !enabledOnly || this.canDispatch(source))
      .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
  }

  canDispatch(sourceOrId) {
    const source = typeof sourceOrId === 'string' ? this.get(sourceOrId) : sourceOrId
    if (!source || !source.enabled || source.inFlight >= source.maxConcurrent) return false
    const now = Number(this.now())
    if (source.openUntilMs > now) return false
    if (source.openUntilMs > 0 && source.halfOpenInFlight) return false
    return true
  }

  beginRequest(sourceOrId) {
    const source = typeof sourceOrId === 'string' ? this.get(sourceOrId) : sourceOrId
    if (!this.canDispatch(source)) return false
    if (source.openUntilMs > 0) source.halfOpenInFlight = true
    source.inFlight += 1
    return true
  }

  endRequest(sourceOrId) {
    const source = typeof sourceOrId === 'string' ? this.get(sourceOrId) : sourceOrId
    if (source) source.inFlight = Math.max(0, source.inFlight - 1)
  }

  recordResult(sourceOrId, {
    capability,
    durationMs = 0,
    ok = false,
    playbackOk = false,
    errorCategory = '',
  } = {}) {
    const source = typeof sourceOrId === 'string' ? this.get(sourceOrId) : sourceOrId
    if (!source) return
    const metrics = source.metrics
    const now = Number(this.now())
    const duration = Math.max(0, Number(durationMs) || 0)
    metrics.requests += 1
    metrics.latencyTotalMs += duration
    metrics.latencySamples += 1
    metrics.lastRequestAt = now
    if (capability === 'search') {
      metrics.searchRequests += 1
      if (ok) metrics.searchSuccesses += 1
    }
    if (capability === 'playback') {
      metrics.playbackRequests += 1
      if (playbackOk) metrics.playbackSuccesses += 1
      if (!playbackOk) metrics.urlFailures += 1
    }
    if (ok) {
      metrics.successes += 1
      metrics.lastSuccessAt = now
    } else {
      metrics.lastFailureAt = now
      if (errorCategory) {
        metrics.lastErrorCategory = String(errorCategory)
        metrics.errorCategories[metrics.lastErrorCategory] =
          (metrics.errorCategories[metrics.lastErrorCategory] || 0) + 1
      }
    }

    const healthy = capability === 'playback' ? playbackOk : ok
    if (healthy) {
      source.failureStreak = 0
      source.openUntilMs = 0
      source.halfOpenInFlight = false
      return
    }
    source.failureStreak += 1
    if (source.failureStreak >= source.circuitFailureThreshold) {
      source.openUntilMs = now + source.circuitOpenMs
      source.halfOpenInFlight = false
    }
  }

  setEnabled(id, enabled) {
    const source = this.get(id)
    if (!source) return null
    source.enabled = enabled === true
    if (source.enabled) {
      source.failureStreak = 0
      source.openUntilMs = 0
      source.halfOpenInFlight = false
    }
    return this.publicStatus(source)
  }

  setPriority(id, priority) {
    const source = this.get(id)
    if (!source) return null
    const value = Number(priority)
    if (!Number.isFinite(value)) throw new TypeError('priority must be a finite number')
    source.priority = value
    return this.publicStatus(source)
  }

  resetCircuit(id) {
    const source = this.get(id)
    if (!source) return null
    source.failureStreak = 0
    source.openUntilMs = 0
    source.halfOpenInFlight = false
    return this.publicStatus(source)
  }

  publicStatus(source) {
    const metrics = source.metrics
    const now = Number(this.now())
    return {
      id: source.id,
      enabled: source.enabled,
      priority: source.priority,
      capabilities: [...source.capabilities],
      maxConcurrent: source.maxConcurrent,
      inFlight: source.inFlight,
      circuit: {
        state: source.openUntilMs > now ? 'open' : source.openUntilMs > 0 ? 'half_open' : 'closed',
        failureStreak: source.failureStreak,
        openUntilMs: source.openUntilMs,
      },
      metrics: {
        ...metrics,
        searchSuccessRate: metrics.searchRequests === 0 ? null : metrics.searchSuccesses / metrics.searchRequests,
        playbackSuccessRate: metrics.playbackRequests === 0 ? null : metrics.playbackSuccesses / metrics.playbackRequests,
        averageLatencyMs: metrics.latencySamples === 0 ? null : metrics.latencyTotalMs / metrics.latencySamples,
        errorCategories: { ...metrics.errorCategories },
      },
    }
  }

  statuses() {
    return [...this.sources.values()].map((source) => this.publicStatus(source))
  }
}
