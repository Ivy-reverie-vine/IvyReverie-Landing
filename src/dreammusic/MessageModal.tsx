import { useState } from 'react'
import { NcmError, sendMessage } from './api'
import { useOptionalCurrentUser } from './CurrentUserContext'
import Icon from '../components/Icon'
import './MessageModal.css'

const MAX_TITLE_LENGTH = 40
const MAX_CONTENT_LENGTH = 200
const DAILY_LIMIT = 3

/** 发消息浮层：Bark webhook，每次消耗 1 梦点，每日最多 3 次。 */
export default function MessageModal({
  onClose,
  onSent,
}: {
  onClose: () => void
  onSent?: () => void
}) {
  const user = useOptionalCurrentUser()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [points, setPoints] = useState(user?.dreamPoints ?? 0)
  const [remaining, setRemaining] = useState(
    Math.max(0, DAILY_LIMIT - (user?.messageToday ?? 0)),
  )

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const cleanTitle = title.trim()
    const cleanContent = content.trim()
    if (!cleanTitle) {
      setError('请输入消息标题')
      return
    }
    if (cleanTitle.length > MAX_TITLE_LENGTH) {
      setError(`标题最多 ${MAX_TITLE_LENGTH} 字`)
      return
    }
    if (cleanContent.length > MAX_CONTENT_LENGTH) {
      setError(`内容最多 ${MAX_CONTENT_LENGTH} 字`)
      return
    }
    if (points < 1) {
      setError('梦点不足，发送需要 1 梦点')
      return
    }
    if (remaining <= 0) {
      setError('今日发送次数已用完，明天再来')
      return
    }

    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await sendMessage(cleanTitle, cleanContent)
      setPoints(result.points)
      setRemaining(result.remaining)
      onSent?.()
      if (result.result === 'sent') {
        setMessage(`已发送，消耗 1 梦点，当前余额 ${result.points}`)
        setTitle('')
        setContent('')
      } else {
        setError(`消息未确认送达，但已扣除 1 梦点：${result.detail || result.result}`)
      }
    } catch (err) {
      setError(err instanceof NcmError ? err.message : '发送失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dm-overlay" role="dialog" aria-modal="true" aria-label="发送消息">
      <div className="dm-overlay-backdrop" onClick={onClose} />
      <div className="dm-message-panel">
        <div className="dm-message-head">
          <h2 className="dm-message-title">
            <Icon name="send" size={18} /> 发送消息
          </h2>
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="关闭发送消息">
            <Icon name="close" size={16} />
          </button>
        </div>

        <div className="dm-message-meta" aria-live="polite">
          <span>今日还可发送 {remaining} 次</span>
          <span>余额 {points} 梦点</span>
        </div>

        <form className="dm-message-form" onSubmit={submit}>
          <label className="dm-message-field">
            <span>标题</span>
            <input
              className="dm-field-input"
              value={title}
              maxLength={MAX_TITLE_LENGTH}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="给这条消息起个标题"
              aria-label="消息标题"
            />
            <small>{title.length}/{MAX_TITLE_LENGTH}</small>
          </label>
          <label className="dm-message-field">
            <span>内容</span>
            <textarea
              className="dm-field-input dm-message-textarea"
              value={content}
              maxLength={MAX_CONTENT_LENGTH}
              onChange={(e) => setContent(e.target.value)}
              placeholder="写下想发送的内容（可选）"
              rows={5}
              aria-label="消息内容"
            />
            <small>{content.length}/{MAX_CONTENT_LENGTH}</small>
          </label>

          {message && <p className="dm-message-success" role="status">{message}</p>}
          {error && <p className="dm-message-error" role="alert">{error}</p>}

          <button
            type="submit"
            className="dm-btn-primary dm-message-submit"
            disabled={busy || remaining <= 0 || points < 1}
          >
            <Icon name="send" size={16} />
            {busy ? '发送中…' : '发送（1 梦点）'}
          </button>
        </form>
      </div>
    </div>
  )
}
