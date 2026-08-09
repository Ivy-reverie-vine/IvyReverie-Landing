/**
 * 共享环境判断（a11y / 设备）。
 * 从 ParticleBackground 抽出，供 App / Hero / HandwrittenLogo 复用。
 */
export function isMobile(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 768px)').matches
    : false
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false
}
