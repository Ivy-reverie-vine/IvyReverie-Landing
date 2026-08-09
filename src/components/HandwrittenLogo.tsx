import { useMemo, useEffect } from 'react'
import { layoutHandwritten } from './handwritten'
import { prefersReducedMotion } from '../utils/a11y'
import './HandwrittenLogo.css'

const TEXT = 'IvyReverie'
const DURATION = 3

/**
 * IvyReverie 逐笔书写 Logo（Issue 02 增强版）。
 * 用 ivy-move-font 的 glyphData 笔迹数据，SVG stroke-dashoffset 动画，
 * 在 DURATION 秒内逐笔写出，写完触发 onDone。
 */
export default function HandwrittenLogo({
  onDone,
}: {
  onDone?: () => void
}) {
  const layout = useMemo(() => layoutHandwritten(TEXT, DURATION), [])
  const reduced = prefersReducedMotion()

  // reduced-motion：无动画，立即完成
  useEffect(() => {
    if (reduced) onDone?.()
  }, [reduced, onDone])

  // 最后一笔的结束时间（用于 onAnimationEnd 触发 onDone）
  const lastEnd = layout.strokes.reduce(
    (m, s) => Math.max(m, s.delay + s.dur),
    0,
  )

  return (
    <svg
      className="handwritten-logo"
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      preserveAspectRatio="xMidYMid meet"
      overflow="visible"
      aria-hidden="true"
    >
      {layout.strokes.map((s, i) => {
        const isLast = s.delay + s.dur >= lastEnd - 0.01
        return (
          <path
            key={i}
            d={s.path}
            pathLength={1}
            fill="none"
            stroke="#EA8BA7"
            strokeWidth={s.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={1}
            strokeDashoffset={reduced ? 0 : 1}
            style={{
              animation: reduced
                ? 'none'
                : `hwDraw ${s.dur}s linear ${s.delay}s forwards`,
            }}
            onAnimationEnd={isLast && !reduced ? onDone : undefined}
          />
        )
      })}
    </svg>
  )
}
