import { useEffect, useState } from 'react'
import { likedList, likeSong, loginStatus, __invalidateCache } from './api'
import { useOptionalCurrentUser } from './CurrentUserContext'
import Icon from '../components/Icon'
import './HeartButton.css'

/**
 * 红心按钮（T-03）：拉取一次我喜欢列表判断初始状态，点击乐观切换。
 * 无 CurrentUserProvider（测试/未登录）时渲染为空。
 */
export default function HeartButton({ songId }: { songId: number }) {
  const user = useOptionalCurrentUser()
  const [liked, setLiked] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    ;(async () => {
      try {
        let uid = user.neteaseUid
        if (!uid) {
          const status = await loginStatus()
          uid = String(status.data?.profile?.userId || '')
        }
        if (!uid) return
        const r = await likedList(uid)
        if (!cancelled) setLiked(Boolean(r.ids?.includes(songId)))
      } catch {
        /* 初始红心状态拿不到就保持 false，点击时会重试 */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id, user?.neteaseUid, songId])

  if (!user) return null

  async function toggle() {
    if (busy) return
    setBusy(true)
    const next = !liked
    setLiked(next) // 乐观更新
    try {
      await likeSong(songId, next)
      // 红心变化后：清 likelist 缓存并通知「我喜欢」列表刷新，避免 2 分钟缓存导致延迟/旧数据
      __invalidateCache('/likelist')
      window.dispatchEvent(new Event('dm-liked-changed'))
    } catch {
      setLiked(!next) // 失败回滚
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      className={`dm-heart ${liked ? 'is-liked' : ''}`}
      onClick={toggle}
      disabled={busy}
      aria-label={liked ? '取消红心' : '红心'}
      aria-pressed={liked}
      title={liked ? '取消我喜欢' : '我喜欢'}
    >
      <Icon name="heart" size={16} />
    </button>
  )
}
