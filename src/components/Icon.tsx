import type { ReactNode } from 'react'

export type IconName =
  | 'search'
  | 'menu'
  | 'close'
  | 'play'
  | 'pause'
  | 'prev'
  | 'next'
  | 'more'
  | 'user'
  | 'check'
  | 'back'
  | 'plus'
  | 'trash'
  | 'music'
  | 'heart'
  | 'bell'
  | 'upload'
  | 'key'
  | 'download'
  | 'gift'
  | 'send'

const PATHS: Record<IconName, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <line x1="16.5" y1="16.5" x2="21" y2="21" />
    </>
  ),
  menu: (
    <>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </>
  ),
  close: (
    <>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </>
  ),
  play: <polygon points="7 4.5 19 12 7 19.5" />,
  pause: (
    <>
      <line x1="9.5" y1="5" x2="9.5" y2="19" />
      <line x1="14.5" y1="5" x2="14.5" y2="19" />
    </>
  ),
  prev: (
    <>
      <polygon points="19 5.5 9.5 12 19 18.5" />
      <line x1="5.5" y1="5.5" x2="5.5" y2="18.5" />
    </>
  ),
  next: (
    <>
      <polygon points="5 5.5 14.5 12 5 18.5" />
      <line x1="18.5" y1="5.5" x2="18.5" y2="18.5" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5" />
    </>
  ),
  check: <polyline points="5 13 10 18 19 7" />,
  back: <polyline points="15 5 8 12 15 19" />,
  plus: (
    <>
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </>
  ),
  music: (
    <>
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </>
  ),
  heart: (
    <path d="M12 20.5 4.8 13.4a4.6 4.6 0 0 1 0-6.5 4.7 4.7 0 0 1 6.6 0l.6.6.6-.6a4.7 4.7 0 0 1 6.6 0 4.6 4.6 0 0 1 0 6.5L12 20.5Z" />
  ),
  bell: (
    <>
      <path d="M6 16v-5a6 6 0 0 1 12 0v5l1.5 2H4.5L6 16Z" />
      <path d="M10 20h4" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V5" />
      <path d="M7.5 9.5 12 5l4.5 4.5" />
      <path d="M5 20h14" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12 20 3" />
      <path d="M15 7l3 3" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="M7.5 10.5 12 15l4.5-4.5" />
      <path d="M5 19h14" />
    </>
  ),
  gift: (
    <>
      <rect x="3.5" y="8" width="17" height="12" rx="2" />
      <path d="M12 8v12" />
      <path d="M12 8s-4.5.2-4.5-2.5A2.5 2.5 0 0 1 12 8Z" />
      <path d="M12 8s4.5.2 4.5-2.5A2.5 2.5 0 0 0 12 8Z" />
    </>
  ),
  send: (
    <>
      <path d="m4 4 16 8-16 8 3.5-8L4 4Z" />
      <path d="M7.5 12H20" />
    </>
  ),
}

/**
 * 线性 SVG 图标（D5-Q8）：统一 1.5 线宽，stroke 继承 currentColor，
 * 主题色联动直接给父级 color 即可。
 */
export default function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
