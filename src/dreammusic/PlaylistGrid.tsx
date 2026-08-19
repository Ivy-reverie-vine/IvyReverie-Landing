import { useCallback, useEffect, useState } from 'react'
import { loginStatus, personalized, userPlaylist, NcmError, type PlaylistSummary } from './api'
import { useOptionalCurrentUser } from './CurrentUserContext'
import './PlaylistView.css'

type PlaylistCard = Pick<PlaylistSummary, 'id' | 'name'> & { picUrl: string }

function toCard(item: PlaylistSummary): PlaylistCard {
  return {
    id: item.id,
    name: item.name,
    picUrl: item.picUrl || item.coverImgUrl || '',
  }
}

const PLAYLIST_PAGE_SIZE = 30

/** 左栏歌单 tab：我的歌单 + 推荐歌单卡片（DM-06/DM-10） */
export default function PlaylistGrid({
  onOpen,
}: {
  onOpen: (id: number) => void
}) {
  const user = useOptionalCurrentUser()
  const [items, setItems] = useState<PlaylistCard[]>([])
  const [mine, setMine] = useState<PlaylistCard[]>([])
  const [recommendLoading, setRecommendLoading] = useState(true)
  const [recommendError, setRecommendError] = useState('')
  const [mineError, setMineError] = useState('')
  const [mineLoading, setMineLoading] = useState(true)
  const [mineOffset, setMineOffset] = useState(0)
  const [mineHasMore, setMineHasMore] = useState(false)

  const resolveUid = useCallback(async () => {
    if (user?.neteaseUid) return user.neteaseUid
    const status = await loginStatus()
    return String(status.data?.profile?.userId || '')
  }, [user?.neteaseUid])

  const loadRecommendations = useCallback(async () => {
    setRecommendLoading(true)
    setRecommendError('')
    try {
      const result = await personalized(PLAYLIST_PAGE_SIZE)
      setItems((result.result || []).map(toCard))
    } catch (e) {
      setRecommendError(e instanceof NcmError ? e.message : '推荐歌单加载失败')
    } finally {
      setRecommendLoading(false)
    }
  }, [])

  const loadMinePage = useCallback(async (offset = 0, append = false) => {
    setMineLoading(true)
    setMineError('')
    try {
      const uid = await resolveUid()
      if (!uid) {
        if (!append) setMine([])
        setMineHasMore(false)
        setMineError('无法获取网易云用户 ID，请重新扫码绑定')
        return
      }
      const result = await userPlaylist(uid, PLAYLIST_PAGE_SIZE, offset)
      const page = (result.playlist || []).map(toCard)
      setMine((previous) => (append ? [...previous, ...page] : page))
      setMineOffset(offset + (page.length || PLAYLIST_PAGE_SIZE))
      setMineHasMore(result.more ?? page.length >= PLAYLIST_PAGE_SIZE)
    } catch (e) {
      setMineError(e instanceof NcmError ? e.message : '我的歌单加载失败')
    } finally {
      setMineLoading(false)
    }
  }, [resolveUid])

  useEffect(() => {
    setMine([])
    setMineOffset(0)
    setMineHasMore(false)
    void Promise.allSettled([loadRecommendations(), loadMinePage(0, false)])
  }, [loadMinePage, loadRecommendations])

  const renderCards = (list: PlaylistCard[]) =>
    list.map((p) => (
      <button
        key={p.id}
        type="button"
        className="dm-pl-card"
        onClick={() => onOpen(p.id)}
      >
        <img
          className="dm-pl-cover"
          src={p.picUrl || '/img/logo.png'}
          alt={p.name}
          loading="lazy"
        />
        <span className="dm-pl-name">{p.name}</span>
      </button>
    ))

  return (
    <div className="dm-pl-sections" data-testid="dm-playlist-grid">
      <section className="dm-pl-section" aria-labelledby="dm-my-playlists-title">
        <div className="dm-pl-section-head">
          <h3 id="dm-my-playlists-title">我的歌单</h3>
          {mine.length > 0 && <span>{mine.length}</span>}
        </div>
        {mineLoading && mine.length === 0 && <p className="dm-pl-hint">加载我的歌单…</p>}
        {mineError && (
          <div className="dm-pl-error-row">
            <p className="dm-pl-hint" role="alert">{mineError}</p>
            <button
              type="button"
              className="dm-pl-retry"
              onClick={() => void loadMinePage(mine.length ? mineOffset : 0, mine.length > 0)}
              disabled={mineLoading}
            >
              {mineLoading ? '重试中…' : '重试我的歌单'}
            </button>
          </div>
        )}
        {!mineLoading && !mineError && mine.length === 0 && (
          <p className="dm-pl-hint">还没有可显示的歌单</p>
        )}
        <div className="dm-pl-grid dm-pl-grid-mine" data-testid="dm-user-playlists">
          {renderCards(mine)}
        </div>
        {mineHasMore && !mineError && (
          <button
            type="button"
            className="dm-pl-load-more"
            onClick={() => void loadMinePage(mineOffset, true)}
            disabled={mineLoading}
          >
            {mineLoading ? '加载中…' : '加载更多我的歌单'}
          </button>
        )}
      </section>
      <section className="dm-pl-section" aria-labelledby="dm-recommended-playlists-title">
        <div className="dm-pl-section-head">
          <h3 id="dm-recommended-playlists-title">推荐歌单</h3>
        </div>
        {recommendLoading && items.length === 0 && <p className="dm-pl-hint">加载推荐歌单…</p>}
        {recommendError && (
          <div className="dm-pl-error-row">
            <p className="dm-pl-hint" role="alert">{recommendError}</p>
            <button
              type="button"
              className="dm-pl-retry"
              onClick={() => void loadRecommendations()}
              disabled={recommendLoading}
            >
              {recommendLoading ? '重试中…' : '重试推荐歌单'}
            </button>
          </div>
        )}
        <div className="dm-pl-grid">{renderCards(items)}</div>
      </section>
    </div>
  )
}
