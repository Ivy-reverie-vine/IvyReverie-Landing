/**
 * ParticleEngine — 框架无关、无 DOM/Canvas 依赖的纯粒子仿真模块（Issue 03）。
 *
 * 4 类粒子：
 *   - starpoint     普通星点（1~3px，白/少量淡粉，部分闪烁，数量最多，非常慢）
 *   - smallFragment 小型三角碎片（3~5 顶点，随机大小/旋转/透明度/粉白，慢）
 *   - largeFragment 大型碎片（15~45px，粉/白，旋转周期 20~60s/圈，更慢）
 *   - centralCloud  中央高密度云（中心附近密度高，Logo 安全区留空，向外缓慢扩散）
 *
 * 见 docs/issues/issue-03-particle-engine-logic.md 与 docs/PRD-ivyreverie-landing.md。
 */

export type ParticleType =
  | 'starpoint'
  | 'smallFragment'
  | 'largeFragment'
  | 'centralCloud'

export type ColorKey = 'white' | 'palePink' | 'pink'

export interface Particle {
  type: ParticleType
  x: number
  y: number
  vx: number
  vy: number
  size: number
  rotation: number
  /** 弧度/秒 */
  rotationSpeed: number
  /** 碎片顶点数 3~5（星点为 0） */
  vertices: number
  colorKey: ColorKey
  baseOpacity: number
  twinklePhase: number
  twinkleSpeed: number
  /** 已存活时间（秒），用于渐入 */
  age: number
  /** 渐入延迟（秒），0~2 随机 */
  fadeDelay: number
}

export interface MousePos {
  x: number
  y: number
}

export interface ParticleSystemState {
  particles: Particle[]
  width: number
  height: number
  reducedMotion: boolean
  mouse: MousePos | null
}

export interface ParticleSystemConfig {
  width: number
  height: number
  device?: 'desktop' | 'mobile'
  reducedMotion?: boolean
  /** 种子，用于可复现测试 */
  seed?: number
  /** 中心密度偏置半径因子（相对短边） */
  centerRadiusFactor?: number
  /** Logo 安全区半径（px），默认桌面 200 / 移动 120 */
  safeZoneRadius?: number
  /** 覆盖总粒子数 */
  total?: number
}

export interface ParticleSystem {
  step(dt: number, mouse?: MousePos | null): ParticleSystemState
  getState(): ParticleSystemState
  resize(width: number, height: number): void
}

/** 各类型粒子占比 */
const DISTRIBUTION: Record<ParticleType, number> = {
  starpoint: 0.6,
  smallFragment: 0.25,
  largeFragment: 0.03,
  centralCloud: 0.12,
}

const DEFAULT_TOTAL: Record<'desktop' | 'mobile', number> = {
  desktop: 1500,
  mobile: 450,
}

const COUNT_CAP: Record<'desktop' | 'mobile', number> = {
  desktop: 2000,
  mobile: 600,
}

/** 旋转周期范围（秒/圈） */
const LARGE_FRAGMENT_PERIOD = { min: 20, max: 60 }

/** mulberry32 — 确定性 PRNG */
function createRng(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function rand(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

function pickColor(rng: () => number, allowPink: boolean): ColorKey {
  if (!allowPink) {
    // 星点：白为主，少量淡粉
    return rng() < 0.15 ? 'palePink' : 'white'
  }
  // 碎片：粉/白随机
  const r = rng()
  if (r < 0.4) return 'pink'
  if (r < 0.7) return 'palePink'
  return 'white'
}

export function createParticleSystem(config: ParticleSystemConfig): ParticleSystem {
  const device = config.device ?? 'desktop'
  const reducedMotion = config.reducedMotion ?? false
  const seed = config.seed ?? 1
  const centerRadiusFactor = config.centerRadiusFactor ?? 0.35
  const safeZoneRadius =
    config.safeZoneRadius ?? (device === 'desktop' ? 200 : 120)

  let width = config.width
  let height = config.height
  const rng = createRng(seed)

  const total = Math.min(
    config.total ?? DEFAULT_TOTAL[device],
    COUNT_CAP[device],
  )

  const centerBiasRadius = () => Math.min(width, height) * centerRadiusFactor

  /** 生成一个不在安全区内的位置；返回 {x,y,angleFromCenter,dist} */
  function spawnPosition(type: ParticleType): {
    x: number
    y: number
    angle: number
    dist: number
  } {
    const cx = width / 2
    const cy = height / 2
    const angle = rand(rng, 0, Math.PI * 2)

    if (type === 'centralCloud') {
      // 中心环：安全区外 ~ centerBiasRadius
      const min = safeZoneRadius
      const max = Math.max(min + 10, centerBiasRadius())
      const dist = rand(rng, min, max)
      return {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        angle,
        dist,
      }
    }

    // 其它类型：全屏均匀，但若落入安全区则推出
    const dist = Math.sqrt(rng()) * Math.hypot(width, height) / 2
    const safe = dist < safeZoneRadius ? safeZoneRadius + rand(rng, 0, 20) : dist
    return {
      x: cx + Math.cos(angle) * safe,
      y: cy + Math.sin(angle) * safe,
      angle,
      dist: safe,
    }
  }

  function createParticle(type: ParticleType): Particle {
    const pos = spawnPosition(type)
    const radial = { x: Math.cos(pos.angle), y: Math.sin(pos.angle) }

    let size: number
    let rotationSpeed: number
    let vertices: number
    let speed: number
    let outward: number
    let colorAllowPink: boolean

    switch (type) {
      case 'starpoint':
        size = rand(rng, 1, 3)
        rotationSpeed = 0
        vertices = 0
        // 非常慢，随机方向漂移
        speed = rand(rng, 2, 5)
        outward = rand(rng, 0, 0.4) // 极弱外向
        colorAllowPink = false
        break
      case 'smallFragment':
        size = rand(rng, 4, 12)
        rotationSpeed = rand(rng, 0.05, 0.3) * (rng() < 0.5 ? -1 : 1)
        vertices = Math.round(rand(rng, 3, 5))
        speed = rand(rng, 4, 9)
        outward = rand(rng, 0.2, 0.8)
        colorAllowPink = true
        break
      case 'largeFragment':
        size = rand(rng, 15, 45)
        // 旋转周期 20~60s/圈 → 角速度 = 2π/period
        rotationSpeed =
          (Math.PI * 2) /
          rand(rng, LARGE_FRAGMENT_PERIOD.min, LARGE_FRAGMENT_PERIOD.max) *
          (rng() < 0.5 ? -1 : 1)
        vertices = 3
        // 更慢
        speed = rand(rng, 1, 3)
        outward = rand(rng, 0.1, 0.5)
        colorAllowPink = true
        break
      case 'centralCloud':
      default:
        size = rand(rng, 1, 4)
        rotationSpeed = 0
        vertices = 0
        // 向外缓慢扩散
        speed = rand(rng, 3, 7)
        outward = 1 // 强外向
        colorAllowPink = false
        break
    }

    // 切向分量（随机），外向分量沿径向
    const tangential = rand(rng, -1, 1) * speed * 0.6
    const radialSpeed = speed * outward
    const vx = radial.x * radialSpeed + -radial.y * tangential
    const vy = radial.y * radialSpeed + radial.x * tangential

    return {
      type,
      x: pos.x,
      y: pos.y,
      vx,
      vy,
      size,
      rotation: rand(rng, 0, Math.PI * 2),
      rotationSpeed,
      vertices,
      colorKey: pickColor(rng, colorAllowPink),
      baseOpacity: rand(rng, 0.3, 0.9),
      twinklePhase: rand(rng, 0, Math.PI * 2),
      twinkleSpeed: rng() < 0.4 ? rand(rng, 0.5, 2) : 0, // 部分闪烁
      age: 0,
      fadeDelay: rand(rng, 0, 2),
    }
  }

  function buildParticles(): Particle[] {
    const list: Particle[] = []
    for (const type of Object.keys(DISTRIBUTION) as ParticleType[]) {
      const count = Math.round(total * DISTRIBUTION[type])
      for (let i = 0; i < count; i++) list.push(createParticle(type))
    }
    return list
  }

  let state: ParticleSystemState = {
    particles: buildParticles(),
    width,
    height,
    reducedMotion,
    mouse: null,
  }

  /** 边缘 respawn */
  function respawn(p: Particle): void {
    const np = createParticle(p.type)
    p.x = np.x
    p.y = np.y
    p.vx = np.vx
    p.vy = np.vy
    p.rotation = np.rotation
    p.baseOpacity = np.baseOpacity
    p.age = 0
    p.fadeDelay = np.fadeDelay
  }

  function step(dt: number, mouse: MousePos | null = null): ParticleSystemState {
    state.mouse = mouse
    if (state.reducedMotion) {
      // 静止：位置不变
      return state
    }
    const margin = 40
    for (const p of state.particles) {
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.rotation += p.rotationSpeed * dt
      p.age += dt
      p.twinklePhase += p.twinkleSpeed * dt

      // 边缘 respawn
      if (
        p.x < -margin ||
        p.x > state.width + margin ||
        p.y < -margin ||
        p.y > state.height + margin
      ) {
        respawn(p)
        continue
      }
    }
    return state
  }

  function resize(w: number, h: number): void {
    state.width = w
    state.height = h
  }

  function getState(): ParticleSystemState {
    return state
  }

  return { step, getState, resize }
}
