/**
 * 轻量内存滑动窗口限流（T-14）。
 * 中间层单实例足够；Docker 多副本时需换成共享存储。
 */
export function createRateLimiter({ windowMs = 60_000, max = 300, keyFn } = {}) {
  const buckets = new Map()
  return function rateLimit(req, res, next) {
    const key = keyFn ? keyFn(req) : String(req.ip || req.socket?.remoteAddress || 'unknown')
    const now = Date.now()
    const cutoff = now - windowMs
    const arr = (buckets.get(key) || []).filter((t) => t > cutoff)
    if (arr.length >= max) {
      const retryAfter = Math.max(1, Math.ceil(windowMs / 1000))
      res.setHeader('Retry-After', String(retryAfter))
      return res.status(429).json({ code: 429, message: '请求过于频繁，请稍后再试' })
    }
    arr.push(now)
    buckets.set(key, arr)
    if (buckets.size > 10000) {
      for (const [k, list] of buckets) {
        if (list.every((t) => t <= cutoff)) buckets.delete(k)
      }
    }
    next()
  }
}
