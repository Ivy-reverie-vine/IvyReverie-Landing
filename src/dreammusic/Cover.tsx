import { useEffect, useState } from 'react'
import { songDetail, mediaDetail } from './api'
import Icon from '../components/Icon'

/**
 * 封面缩略图（D5-Q1）：缺 picUrl 时用 songDetail 懒加载补（2 分钟缓存），
 * 适配搜索歌曲（/search 不返回 picUrl）与持久化恢复的队列。
 */
export default function Cover({
  picUrl,
  songId,
  mediaRef,
  alt = '',
  className,
  phClassName,
}: {
  picUrl?: string
  songId: number | string
  mediaRef?: string
  alt?: string
  className: string
  phClassName: string
}) {
  const [pic, setPic] = useState<string | undefined>(picUrl)
  const [failedPic, setFailedPic] = useState<string | undefined>()

  useEffect(() => {
    let cancelled = false
    if (picUrl && picUrl !== failedPic) {
      setPic(picUrl)
      return
    }
    setPic(undefined)
    const detail = mediaRef
      ? mediaDetail(mediaRef).then(r => r.data?.[0]?.album?.pictureUrl)
      : songDetail(songId).then(r => {
          const s = r.songs?.[0] as { al?: { picUrl?: string }; album?: { picUrl?: string } } | undefined
          return s?.al?.picUrl || s?.album?.picUrl
        })
    detail
      .then((p) => {
        if (cancelled) return
        if (p) setPic(p)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [picUrl, songId, mediaRef, failedPic])

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
      src={mediaRef ? pic : `${pic}?param=100y100`}
      alt={alt}
      loading="lazy"
      onError={() => {
        if (mediaRef && pic === picUrl && picUrl !== failedPic) setFailedPic(picUrl)
        else setPic(undefined)
      }}
    />
  )
}
