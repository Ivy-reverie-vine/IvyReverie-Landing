import { describe, it, expect } from 'vitest'
import {
  createParticleSystem,
  type ParticleType,
  type Particle,
} from './engine'

const DESKTOP = { width: 1920, height: 1080, device: 'desktop' as const }
const MOBILE = { width: 390, height: 844, device: 'mobile' as const }

function countByType(particles: Particle[]): Record<ParticleType, number> {
  const counts: Record<ParticleType, number> = {
    starpoint: 0,
    smallFragment: 0,
    largeFragment: 0,
    centralCloud: 0,
  }
  for (const p of particles) counts[p.type]++
  return counts
}

function distFromCenter(p: Particle, w: number, h: number): number {
  return Math.hypot(p.x - w / 2, p.y - h / 2)
}

describe('ParticleEngine — Issue 03 Seam B', () => {
  it('exposes the expected API shape', () => {
    const sys = createParticleSystem({ ...DESKTOP, seed: 1 })
    expect(typeof sys.step).toBe('function')
    expect(typeof sys.getState).toBe('function')
    expect(typeof sys.resize).toBe('function')
  })

  it('distributes 4 particle types with starpoint most numerous', () => {
    const sys = createParticleSystem({ ...DESKTOP, seed: 2 })
    const counts = countByType(sys.getState().particles)
    expect(counts.starpoint).toBeGreaterThan(0)
    expect(counts.smallFragment).toBeGreaterThan(0)
    expect(counts.largeFragment).toBeGreaterThan(0)
    expect(counts.centralCloud).toBeGreaterThan(0)
    // 星点数量最多
    expect(counts.starpoint).toBeGreaterThan(counts.smallFragment)
    expect(counts.starpoint).toBeGreaterThan(counts.centralCloud)
    expect(counts.starpoint).toBeGreaterThan(counts.largeFragment)
  })

  it('keeps the logo safe zone empty (desktop 200px radius)', () => {
    const safeZone = 200
    const sys = createParticleSystem({ ...DESKTOP, seed: 3, safeZoneRadius: safeZone })
    const { particles, width, height } = sys.getState()
    for (const p of particles) {
      expect(distFromCenter(p, width, height)).toBeGreaterThanOrEqual(
        safeZone - 0.5,
      )
    }
  })

  it('biases density toward the center', () => {
    const sys = createParticleSystem({ ...DESKTOP, seed: 4 })
    const { particles, width, height } = sys.getState()
    const centerR = Math.min(width, height) * 0.35
    const centerArea = Math.PI * centerR * centerR
    const totalArea = width * height
    const edgeArea = totalArea - centerArea

    let inCenter = 0
    let inEdge = 0
    for (const p of particles) {
      if (distFromCenter(p, width, height) <= centerR) inCenter++
      else inEdge++
    }
    const centerDensity = inCenter / centerArea
    const edgeDensity = inEdge / edgeArea
    // 中心密度显著高于边缘
    expect(centerDensity).toBeGreaterThan(edgeDensity)
  })

  it('central cloud particles drift outward over time', () => {
    const sys = createParticleSystem({ ...DESKTOP, seed: 5 })
    const { particles, width, height } = sys.getState()
    const cloud = particles.filter((p) => p.type === 'centralCloud')
    expect(cloud.length).toBeGreaterThan(0)

    const before = cloud.map((p) => distFromCenter(p, width, height))
    sys.step(0.5)
    const after = cloud.map((p) => distFromCenter(p, width, height))
    // 每个中央云粒子距中心距离应单调递增（外向扩散）
    for (let i = 0; i < cloud.length; i++) {
      expect(after[i]).toBeGreaterThan(before[i])
    }
  })

  it('respawns particles that leave the viewport back near center region', () => {
    const sys = createParticleSystem({ ...DESKTOP, seed: 6 })
    const { particles, width, height } = sys.getState()
    // 把一个粒子推到视口外
    const p = particles[0]
    p.x = width + 500
    p.y = height + 500
    sys.step(0.016)
    // respawn 后应回到视口内
    expect(p.x).toBeGreaterThanOrEqual(-50)
    expect(p.x).toBeLessThanOrEqual(width + 50)
    expect(p.y).toBeGreaterThanOrEqual(-50)
    expect(p.y).toBeLessThanOrEqual(height + 50)
  })

  it('respects count caps: desktop <= 2000', () => {
    const sys = createParticleSystem({ ...DESKTOP, seed: 7 })
    expect(sys.getState().particles.length).toBeLessThanOrEqual(2000)
  })

  it('respects count caps: mobile <= 600', () => {
    const sys = createParticleSystem({ ...MOBILE, seed: 8 })
    expect(sys.getState().particles.length).toBeLessThanOrEqual(600)
  })

  it('large fragment rotation period falls in 20~60s per cycle', () => {
    const sys = createParticleSystem({ ...DESKTOP, seed: 9 })
    const large = sys
      .getState()
      .particles.filter((p) => p.type === 'largeFragment')
    expect(large.length).toBeGreaterThan(0)
    for (const p of large) {
      const period = (Math.PI * 2) / Math.abs(p.rotationSpeed)
      expect(period).toBeGreaterThanOrEqual(20)
      expect(period).toBeLessThanOrEqual(60)
    }
  })

  it('stays static under prefers-reduced-motion', () => {
    const sys = createParticleSystem({
      ...DESKTOP,
      seed: 10,
      reducedMotion: true,
    })
    const before = sys
      .getState()
      .particles.map((p) => ({ x: p.x, y: p.y, rotation: p.rotation }))
    sys.step(1)
    const after = sys
      .getState()
      .particles.map((p) => ({ x: p.x, y: p.y, rotation: p.rotation }))
    expect(after).toEqual(before)
  })

  it('resize updates the viewport dimensions', () => {
    const sys = createParticleSystem({ ...DESKTOP, seed: 11 })
    sys.resize(800, 600)
    const s = sys.getState()
    expect(s.width).toBe(800)
    expect(s.height).toBe(600)
  })
})
