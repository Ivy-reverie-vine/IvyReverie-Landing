import { useState } from 'react'
import { register, login, NcmError } from './api'
import './LoginView.css'

/**
 * 邀请码注册（D4）：注册成功后自动登录并回到主流程。
 */
export default function RegisterView({
  onRegistered,
  onBackLogin,
}: {
  onRegistered: () => void
  onBackLogin: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await register(username.trim(), password, inviteCode.trim())
      await login(username.trim(), password)
      onRegistered()
    } catch (err) {
      setError(err instanceof NcmError ? err.message : '注册失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dm-login" data-testid="dm-register">
      <form className="dm-login-card" onSubmit={submit}>
        <h1 className="dm-login-title">注册 DreamMusic</h1>
        <p className="dm-login-sub">需要邀请码，找站长要一个</p>

        <label className="dm-field">
          <span className="dm-field-label">用户名</span>
          <input
            className="dm-field-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            minLength={3}
            maxLength={32}
            placeholder="3-32 位字母 / 数字"
          />
        </label>

        <label className="dm-field">
          <span className="dm-field-label">密码</span>
          <input
            className="dm-field-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            minLength={6}
            placeholder="至少 6 位"
          />
        </label>

        <label className="dm-field">
          <span className="dm-field-label">邀请码</span>
          <input
            className="dm-field-input"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            required
            placeholder="注册邀请码"
          />
        </label>

        {error && (
          <p className="dm-login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="dm-btn-primary" disabled={busy}>
          {busy ? '注册中…' : '注册并登录'}
        </button>
        <button
          type="button"
          className="dm-btn-ghost"
          onClick={onBackLogin}
          disabled={busy}
        >
          返回登录
        </button>
      </form>
    </div>
  )
}
