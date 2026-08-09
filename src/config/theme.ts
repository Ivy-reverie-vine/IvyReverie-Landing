/**
 * Theme palette — single source of truth for colors.
 * See docs/CONTEXTS.md (glossary) and docs/ADR-001-vite-react-ts.md.
 */
export const theme = {
  /** 深黑偏蓝宇宙背景 */
  background: '#05070F',
  /** 纯白 */
  white: '#FFFFFF',
  /** 淡粉 */
  palePink: '#F4D6F4',
  /** 主粉（Logo / 强调） */
  primaryPink: '#EA8BA7',
  /** 深紫（Bird pill 等选中态） */
  deepPurple: '#2A182C',
} as const

export type Theme = typeof theme
