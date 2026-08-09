import './Header.css'

/**
 * 顶部导航（Issue 05）。
 * start dream 胶囊按钮 + Bird 选中 pill + 占位1/2/3 文本链接。
 * 注意：goal.md 第12章 DOM 图里的 Light/Dark/中文 已作废，不实现。
 */
export default function Header() {
  return (
    <nav className="header layer-ui" data-testid="header" aria-label="主导航">
      <a className="btn-start-dream" href="#">
        start dream
      </a>
      <span className="sep" aria-hidden="true">/</span>
      <button type="button" className="bird-pill" aria-pressed="true">
        Bird
      </button>
      <span className="sep" aria-hidden="true">/</span>
      <a className="nav-link" href="#">
        占位1
      </a>
      <span className="sep" aria-hidden="true">/</span>
      <a className="nav-link" href="#">
        占位2
      </a>
      <span className="sep" aria-hidden="true">/</span>
      <a className="nav-link" href="#">
        占位3
      </a>
    </nav>
  )
}
