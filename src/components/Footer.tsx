import './Footer.css'

/** 底部链接与描述（Issue 07）。 */
const LINKS = ['ST', 'Ivy2API', 'Guide', 'GitHub', 'Status'] as const

export default function Footer() {
  return (
    <footer className="footer layer-ui" data-testid="footer">
      <nav className="footer-links" aria-label="底部导航">
        {LINKS.map((label) => (
          <a key={label} className="footer-link" href="#">
            {label}
          </a>
        ))}
      </nav>
      <p className="footer-desc">NightDream.append(you)</p>
    </footer>
  )
}
