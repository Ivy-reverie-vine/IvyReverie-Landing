import { useEffect, useState } from 'react'
import {
  getAdminAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  NcmError,
  type Announcement,
} from './api'
import './AnnouncementAdmin.css'

const LEVELS: Announcement['level'][] = ['info', 'maintenance', 'important']

/** admin 公告管理（T-08）：发布/下线/删除/编辑 */
export default function AnnouncementAdmin() {
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [level, setLevel] = useState<Announcement['level']>('info')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const load = () => {
    setLoading(true)
    getAdminAnnouncements()
      .then(setItems)
      .catch((e) => setError(e instanceof NcmError ? e.message : '公告加载失败'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  function resetForm() {
    setEditingId(null)
    setTitle('')
    setContent('')
    setLevel('info')
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setError('')
    try {
      if (editingId) {
        await updateAnnouncement(editingId, { title: title.trim(), content, level })
      } else {
        await createAnnouncement({ title: title.trim(), content, level, status: 'draft' })
      }
      resetForm()
      load()
    } catch (err) {
      setError(err instanceof NcmError ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  async function publish(a: Announcement) {
    setBusy(true)
    setError('')
    try {
      await updateAnnouncement(a.id, { status: 'published' })
      load()
    } catch (err) {
      setError(err instanceof NcmError ? err.message : '发布失败')
    } finally {
      setBusy(false)
    }
  }

  async function archive(a: Announcement) {
    setBusy(true)
    setError('')
    try {
      await updateAnnouncement(a.id, { status: 'archived' })
      load()
    } catch (err) {
      setError(err instanceof NcmError ? err.message : '下线失败')
    } finally {
      setBusy(false)
    }
  }

  async function remove(a: Announcement) {
    if (!window.confirm(`删除公告「${a.title}」？`)) return
    setBusy(true)
    setError('')
    try {
      await deleteAnnouncement(a.id)
      load()
    } catch (err) {
      setError(err instanceof NcmError ? err.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <p className="dm-admin-hint">公告管理加载中…</p>

  return (
    <div className="dm-announce-admin">
      <form className="dm-announce-form" onSubmit={submit}>
        <h4 className="dm-announce-form-title">{editingId ? `编辑公告 #${editingId}` : '新建公告'}</h4>
        <input
          className="dm-field-input"
          placeholder="公告标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          required
        />
        <textarea
          className="dm-announce-textarea"
          placeholder="公告内容（支持 Markdown）"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
        />
        <div className="dm-announce-form-row">
          <select
            className="dm-field-input"
            value={level}
            onChange={(e) => setLevel(e.target.value as Announcement['level'])}
            aria-label="公告级别"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <button type="submit" className="dm-btn-primary" disabled={busy}>
            {editingId ? '保存修改' : '保存草稿'}
          </button>
          {editingId && (
            <button type="button" className="dm-btn-ghost" onClick={resetForm}>
              取消编辑
            </button>
          )}
        </div>
      </form>

      {error && <p className="dm-admin-error" role="alert">{error}</p>}

      <ul className="dm-announce-admin-list">
        {items.map((a) => (
          <li key={a.id} className={`dm-announce-admin-item status-${a.status}`}>
            <div className="dm-announce-admin-info">
              <span className="dm-announce-admin-title">
                [{a.level}] {a.title}
                {a.status !== 'published' && <em className="dm-announce-status">{a.status}</em>}
              </span>
              <span className="dm-announce-admin-meta">by {a.createdBy}</span>
            </div>
            <div className="dm-announce-admin-actions">
              <button
                type="button"
                className="dm-admin-btn"
                onClick={() => {
                  setEditingId(a.id)
                  setTitle(a.title)
                  setContent(a.content)
                  setLevel(a.level)
                }}
              >
                编辑
              </button>
              {a.status === 'published' ? (
                <button type="button" className="dm-admin-btn" onClick={() => archive(a)} disabled={busy}>
                  下线
                </button>
              ) : (
                <button type="button" className="dm-admin-btn is-unban" onClick={() => publish(a)} disabled={busy}>
                  发布
                </button>
              )}
              <button type="button" className="dm-admin-btn is-ban" onClick={() => remove(a)} disabled={busy}>
                删除
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
