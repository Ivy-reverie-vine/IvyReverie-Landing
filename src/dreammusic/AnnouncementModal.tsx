import { useEffect, useState } from 'react'
import { getAnnouncements, NcmError, type Announcement } from './api'
import { renderMarkdown } from './markdown'
import Icon from '../components/Icon'
import './AnnouncementModal.css'

const LEVEL_LABEL: Record<Announcement['level'], string> = {
  info: '公告',
  maintenance: '维护',
  important: '重要',
}

/** 平台公告弹层（T-08）：普通/维护/重要三级，关闭时记录已读最大 id */
export default function AnnouncementModal({ onClose }: { onClose: () => void }) {
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getAnnouncements()
      .then((list) => {
        if (!cancelled) setItems(list)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof NcmError ? e.message : '公告加载失败')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  const close = () => {
    const maxId = items.reduce((m, a) => Math.max(m, a.id), 0)
    if (maxId) localStorage.setItem('dreammusic_last_announcement_id', String(maxId))
    onClose()
  }

  return (
    <div className="dm-overlay" role="dialog" aria-label="平台公告">
      <div className="dm-overlay-backdrop" onClick={close} />
      <div className="dm-announce-panel">
        <div className="dm-announce-head">
          <h2 className="dm-announce-title">
            <Icon name="bell" size={18} /> 平台公告
          </h2>
          <button type="button" className="dm-icon-btn" onClick={close} aria-label="关闭公告">
            <Icon name="close" size={16} />
          </button>
        </div>
        {loading && <p className="dm-announce-hint">加载中…</p>}
        {error && <p className="dm-announce-hint" role="alert">{error}</p>}
        {!loading && !error && items.length === 0 && <p className="dm-announce-hint">暂无公告</p>}
        <div className="dm-announce-list">
          {items.map((a) => (
            <article key={a.id} className={`dm-announce-item level-${a.level}`}>
              <div className="dm-announce-item-head">
                <span className={`dm-announce-level level-${a.level}`}>{LEVEL_LABEL[a.level] || a.level}</span>
                <span className="dm-announce-meta">
                  {new Date(a.publishedAt || a.createdAt).toLocaleDateString('zh-CN')}
                </span>
              </div>
              <h3 className="dm-announce-item-title">{a.title}</h3>
              {a.content && (
                <div
                  className="dm-announce-item-content"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(a.content) }}
                />
              )}
            </article>
          ))}
        </div>
      </div>
    </div>
  )
}
