/**
 * 服务端音乐来源注册表。
 *
 * 注册表只管理来源身份、能力、优先级和开关，不包含跨来源调度逻辑。
 */
export class MusicSourceRegistry {
  constructor() {
    this.sources = new Map()
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
      .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
  }
}
