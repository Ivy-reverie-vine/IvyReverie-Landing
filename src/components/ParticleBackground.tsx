import { useEffect, useRef } from 'react'
import {
  createParticleSystem,
  type Particle,
  type ColorKey,
  type ParticleSystem,
} from '../particles/engine'
import { isMobile, prefersReducedMotion } from '../utils/a11y'

const COLOR_RGB: Record<ColorKey, [number, number, number]> = {
  white: [255, 255, 255],
  palePink: [244, 214, 244],
  pink: [234, 139, 167],
}

/** 渐入因子：age 超过 fadeDelay 后 0.6s 内 0→1 */
function fadeFactor(p: Particle): number {
  const f = (p.age - p.fadeDelay) / 0.6
  if (f <= 0) return 0
  if (f >= 1) return 1
  return f
}

/**
 * 粒子背景 Canvas 渲染（Issue 04）。
 * 把 Issue 03 的 ParticleEngine 接到全屏 canvas，requestAnimationFrame 驱动。
 * `active` 为 false 时画布空白（Logo 逐笔书写期间不显示粒子）；
 * 变 true 后开始步进，粒子按各自 fadeDelay 渐入。
 */
export default function ParticleBackground({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reduced = prefersReducedMotion()

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let ctx: CanvasRenderingContext2D | null = null
    try {
      ctx = canvas.getContext('2d')
    } catch {
      ctx = null
    }
    if (!ctx) return

    let width = window.innerWidth
    let height = window.innerHeight
    let dpr = Math.min(window.devicePixelRatio || 1, 2)

    const sys: ParticleSystem = createParticleSystem({
      width,
      height,
      device: isMobile() ? 'mobile' : 'desktop',
      reducedMotion: prefersReducedMotion(),
    })

    function setupCanvas() {
      width = window.innerWidth
      height = window.innerHeight
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas!.width = Math.floor(width * dpr)
      canvas!.height = Math.floor(height * dpr)
      canvas!.style.width = width + 'px'
      canvas!.style.height = height + 'px'
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      sys.resize(width, height)
    }
    setupCanvas()

    // 先清空画布（active=false 时保持空白）
    ctx!.clearRect(0, 0, width, height)

    if (!active) return

    let mouse = { x: width / 2, y: height / 2 }
    let targetMouse = { x: width / 2, y: height / 2 }
    function onPointerMove(e: PointerEvent) {
      targetMouse = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('resize', setupCanvas)

    function drawPolygon(p: Particle, ox: number, oy: number) {
      const n = p.vertices
      ctx!.beginPath()
      for (let i = 0; i < n; i++) {
        const a = p.rotation + (i * Math.PI * 2) / n
        const rx = p.x + ox + Math.cos(a) * p.size
        const ry = p.y + oy + Math.sin(a) * p.size
        if (i === 0) ctx!.moveTo(rx, ry)
        else ctx!.lineTo(rx, ry)
      }
      ctx!.closePath()
      ctx!.fill()
    }

    let last = performance.now()
    let rafId = 0
    let running = true

    function frame(now: number) {
      if (!running) return
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now

      mouse.x += (targetMouse.x - mouse.x) * 0.05
      mouse.y += (targetMouse.y - mouse.y) * 0.05

      sys.step(dt, mouse)
      const particles = sys.getState().particles

      ctx!.clearRect(0, 0, width, height)

      const cx = width / 2
      const cy = height / 2
      const parallax = 0.015
      const ox = -(mouse.x - cx) * parallax
      const oy = -(mouse.y - cy) * parallax

      for (const p of particles) {
        if (p.type !== 'starpoint' && p.type !== 'centralCloud') continue
        const fade = fadeFactor(p)
        if (fade <= 0) continue
        const twinkle =
          p.twinkleSpeed > 0 ? 0.6 + 0.4 * Math.sin(p.twinklePhase) : 1
        const [r, g, b] = COLOR_RGB[p.colorKey]
        ctx!.fillStyle = `rgba(${r},${g},${b},${p.baseOpacity * fade * twinkle})`
        const s = p.size
        ctx!.fillRect(p.x + ox - s / 2, p.y + oy - s / 2, s, s)
      }
      for (const p of particles) {
        if (p.type !== 'smallFragment' && p.type !== 'largeFragment') continue
        const fade = fadeFactor(p)
        if (fade <= 0) continue
        const [r, g, b] = COLOR_RGB[p.colorKey]
        ctx!.fillStyle = `rgba(${r},${g},${b},${p.baseOpacity * fade})`
        drawPolygon(p, ox, oy)
      }

      rafId = requestAnimationFrame(frame)
    }

    rafId = requestAnimationFrame(frame)

    return () => {
      running = false
      cancelAnimationFrame(rafId)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('resize', setupCanvas)
    }
  }, [active])

  return (
    <canvas
      ref={canvasRef}
      data-testid="particle-background"
      data-reduced-motion={reduced ? 'true' : 'false'}
      className="layer-bg"
      aria-hidden="true"
    />
  )
}
