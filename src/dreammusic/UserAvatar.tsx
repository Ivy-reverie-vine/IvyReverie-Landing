import { useState } from 'react'
import type { UserInfo } from './api'

function avatarSrc(url?: string | null, size = 120): string | null {
  if (!url) return null
  if (url.startsWith('data:') || url.includes('/auth/avatar-file/')) return url
  return `${url}?param=${size}y${size}`
}

/**
 * 用户头像：本地文件路径 / 网易云 URL / dataURL 三种来源统一处理；
 * 加载失败或缺失时自动回退首字母头像。
 */
export default function UserAvatar({
  user,
  size = 120,
  className = '',
  imgClassName = '',
}: {
  user: Pick<UserInfo, 'username' | 'avatarUrl'>
  size?: number
  className?: string
  imgClassName?: string
}) {
  const [broken, setBroken] = useState(false)
  const src = broken ? null : avatarSrc(user.avatarUrl, size)

  if (!src) {
    return (
      <span
        className={`${className} is-ph`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
        aria-label={`${user.username} 头像`}
      >
        {user.username.slice(0, 1).toUpperCase()}
      </span>
    )
  }
  return (
    <img
      className={`${className} ${imgClassName}`.trim()}
      style={{ width: size, height: size }}
      src={src}
      alt={`${user.username} 头像`}
      onError={() => setBroken(true)}
    />
  )
}
