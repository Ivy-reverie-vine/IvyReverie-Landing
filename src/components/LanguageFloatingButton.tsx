import { useState } from 'react'
import './LanguageFloatingButton.css'

/**
 * 右侧悬浮语言按钮 A/文（Issue 06）。
 * 点击给予轻微反馈，保持可访问性。
 */
export default function LanguageFloatingButton() {
  const [clicked, setClicked] = useState(false)

  return (
    <button
      type="button"
      className={`lang-btn layer-ui ${clicked ? 'is-clicked' : ''}`}
      data-testid="language-button"
      aria-label="切换语言"
      title="当前已为中文 / English"
      onClick={() => {
        setClicked(true)
        setTimeout(() => setClicked(false), 2000)
      }}
    >
      <span className="lang-icon">{clicked ? '✓' : 'A / 文'}</span>
    </button>
  )
}
