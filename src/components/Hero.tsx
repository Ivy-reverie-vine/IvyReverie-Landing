import HandwrittenLogo from './HandwrittenLogo'
import './Hero.css'

/**
 * 中央品牌 Hero（Issue 02）。
 * IvyReverie 逐笔书写 Logo（3s）+ night dream 副标题（Logo 写完后淡入）。
 */
export default function Hero({ onLogoDone }: { onLogoDone?: () => void }) {
  return (
    <section data-testid="hero" className="layer-ui hero">
      <h1 className="hero-logo" aria-label="IvyReverie">
        <HandwrittenLogo onDone={onLogoDone} />
      </h1>
      <p className="hero-subtitle">night dream</p>
    </section>
  )
}
