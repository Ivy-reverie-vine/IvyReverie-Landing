import './LanguageFloatingButton.css'

/**
 * 右侧悬浮语言按钮 A/文（Issue 06）。
 * 仅视觉，点击不切换语言（grill 决议）。
 */
export default function LanguageFloatingButton() {
  return (
    <button
      type="button"
      className="lang-btn layer-ui"
      data-testid="language-button"
      aria-label="切换语言"
    >
      <span className="lang-icon">A / 文</span>
    </button>
  )
}
