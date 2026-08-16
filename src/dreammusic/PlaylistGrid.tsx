import { useEffect, useState } from 'react'
import { personalized, NcmError } from './api'
import './PlaylistView.css'

/** 左栏歌单 tab：推荐歌单卡片（DM-06） */
export default function PlaylistGrid({
  onOpen,
}: {
  onOpen: (id: number) => void
}) {
  const [items, setItems] = useState<{ id: number; name: string; picUrl: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    personalized(30)
      .then((r) => {
        if (cancelled) return
        setItems(r.result || [])
      })
      .catch((e) => {
        if (cancelled) return
        setError(e instanceof NcmError ? e.message : '加载歌单失败')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) return <p className="dm-pl-hint">加载歌单…</p>
  if (error) return <p className="dm-pl-hint" role="alert">{error}</p>

  return (
    <div className="dm-pl-grid" data-testid="dm-playlist-grid">
      {items.map((p) => (
        <button
          key={p.id}
          type="button"
          className="dm-pl-card"
          onClick={() => onOpen(p.id)}
        >
          <img
            className="dm-pl-cover"
            src={`${p.picUrl}?param=120y120`}
            alt={p.name}
            loading="lazy"
          />
          <span className="dm-pl-name">{p.name}</span>
        </button>
      ))}
    </div>
  )
}
