import { useEffect, useRef, useState } from 'react'
import {
  changePassword,
  uploadAvatar,
  getSessions,
  revokeSession,
  getPointLogs,
  NcmError,
  type UserInfo,
  type SessionInfo,
  type PointLog,
} from './api'
import { useOptionalCurrentUser } from './CurrentUserContext'
import UserAvatar from './UserAvatar'
import Icon from '../components/Icon'
import './AccountSettings.css'

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString('zh-CN', { hour12: false })
}

function fmtDelta(n: number): string {
  return n > 0 ? `+${n}` : `${n}`
}

/** 账号设置（T-06/T-07 + 在线会话 + 梦点流水） */
export default function AccountSettings({
  onProfileChanged,
  onPasswordChanged,
}: {
  onProfileChanged: (u: UserInfo) => void
  onPasswordChanged: () => void
}) {
  const user = useOptionalCurrentUser()
  const fileRef = useRef<HTMLInputElement>(null)

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [accountMsg, setAccountMsg] = useState('')
  const [accountErr, setAccountErr] = useState('')
  const [busy, setBusy] = useState(false)

  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [pointLogs, setPointLogs] = useState<PointLog[]>([])

  useEffect(() => {
    let cancelled = false
    getSessions()
      .then((list) => !cancelled && setSessions(list))
      .catch(() => {})
    getPointLogs()
      .then((list) => !cancelled && setPointLogs(list))
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setAccountErr('')
    setAccountMsg('')
    if (newPassword !== confirmPassword) {
      setAccountErr('两次输入的新密码不一致')
      return
    }
    setBusy(true)
    try {
      await changePassword(oldPassword, newPassword)
      setAccountMsg('密码已修改，请重新登录')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onPasswordChanged()
    } catch (err) {
      setAccountErr(err instanceof NcmError ? err.message : '修改失败')
    } finally {
      setBusy(false)
    }
  }

  function pickAvatar() {
    fileRef.current?.click()
  }

  async function onAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAccountErr('')
    setAccountMsg('')
    if (file.size > 2 * 1024 * 1024) {
      setAccountErr('头像需在 2MB 以内')
      return
    }
    const reader = new FileReader()
    reader.onload = async () => {
      setBusy(true)
      try {
        const updated = await uploadAvatar(String(reader.result || ''))
        onProfileChanged(updated)
        // 通知 DreamMusic 刷新顶部头像
        window.dispatchEvent(new Event('dm-profile-changed'))
        setAccountMsg('头像已更新')
      } catch (err) {
        setAccountErr(err instanceof NcmError ? err.message : '头像上传失败')
      } finally {
        setBusy(false)
      }
    }
    reader.readAsDataURL(file)
  }

  async function revoke(token: string) {
    setAccountErr('')
    try {
      await revokeSession(token)
      setSessions((list) => list.filter((s) => s.token !== token))
    } catch (err) {
      setAccountErr(err instanceof NcmError ? err.message : '下线失败')
    }
  }

  return (
    <div className="dm-account-settings">
      <section className="dm-account-section">
        <h3 className="dm-account-heading">
          <Icon name="upload" size={14} /> 修改头像
        </h3>
        <div className="dm-account-avatar-row">
          {user && <UserAvatar user={user} size={56} className="dm-account-avatar" />}
          <button type="button" className="dm-icon-btn" onClick={pickAvatar} disabled={busy}>
            选择图片
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="dm-account-file"
            onChange={onAvatarFile}
          />
        </div>
      </section>

      <details className="dm-account-section dm-account-details">
        <summary className="dm-account-heading">
          <Icon name="key" size={14} /> 修改密码
        </summary>
        <form className="dm-account-form" onSubmit={submitPassword}>
          <input
            className="dm-field-input"
            type="password"
            placeholder="旧密码"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <input
            className="dm-field-input"
            type="password"
            placeholder="新密码（至少 6 位）"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
          <input
            className="dm-field-input"
            type="password"
            placeholder="确认新密码"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
          />
          <button type="submit" className="dm-btn-primary" disabled={busy}>
            {busy ? '提交中…' : '修改密码'}
          </button>
        </form>
        {accountMsg && <p className="dm-account-msg">{accountMsg}</p>}
      </details>

      <section className="dm-account-section">
        <h3 className="dm-account-heading">在线会话</h3>
        {sessions.length === 0 ? (
          <p className="dm-account-hint">没有活跃会话</p>
        ) : (
          <ul className="dm-session-list">
            {sessions.map((s) => (
              <li key={s.token} className="dm-session-item">
                <span className="dm-session-main">
                  <span className="dm-session-time">{fmtTime(s.createdAt)}</span>
                  <span className="dm-session-expire">{s.current ? '当前设备' : `过期 ${fmtTime(s.expiresAt)}`}</span>
                </span>
                <button
                  type="button"
                  className="dm-btn-ghost"
                  onClick={() => revoke(s.token)}
                  disabled={s.current}
                >
                  {s.current ? '当前' : '下线'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="dm-account-section">
        <h3 className="dm-account-heading">梦点流水</h3>
        {pointLogs.length === 0 ? (
          <p className="dm-account-hint">暂无梦点记录</p>
        ) : (
          <ul className="dm-pointlog-list">
            {pointLogs.map((log) => (
              <li key={log.id} className="dm-pointlog-item">
                <span className={`dm-pointlog-delta ${log.delta > 0 ? 'is-plus' : 'is-minus'}`}>
                  {fmtDelta(log.delta)}
                </span>
                <span className="dm-pointlog-note">{log.note || log.type}</span>
                <span className="dm-pointlog-time">{fmtTime(log.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {accountErr && <p className="dm-account-err" role="alert">{accountErr}</p>}
    </div>
  )
}
