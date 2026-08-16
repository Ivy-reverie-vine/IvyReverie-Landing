import { useEffect, useState } from 'react'
import { songDetail } from './api'
import Icon from '../components/Icon'

/**
 * 封面缩略图（D5-Q1）：缺 picUrl 时用 songDetail 懒加载补（2 分钟缓存），
 * 适配搜索歌曲（/search 不返回 picUrl）与持久化恢复的队列。
 */
export default function Cover({
  picUrl,
  songId,
  alt = '',
  className,
  phClassName,
}: {
  picUrl?: string
  songId: number
  alt?: string
  className: string
  phClassName: string
}) {
  const [pic, setPic] = useState<string | undefined>(picUrl)

  useEffect(() => {
    let cancelled = false
    if (picUrl) {
      setPic(picUrl)
      return
    }
    setPic(undefined)
    songDetail(songId)
      .then((r) => {
        if (cancelled) return
        const s = r.songs?.[0] as
          | { al?: { picUrl?: string }; album?: { picUrl?: string } }
          | undefined
        const p = s?.al?.picUrl || s?.album?.picUrl
        if (p) setPic(p)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [picUrl, songId])

  if (!pic) {
    return (
      <span className={phClassName}>
        <Icon name="music" size={16} />
      </span>
    )
  }
  return (
    <img
      className={className}
      src={`${pic}?param=100y100`}
      alt={alt}
      loading="lazy"
    />
  )
}
