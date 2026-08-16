import { useState } from 'react'
import { login, NcmError } from './api'
import './LoginView.css'

/**
 * DreamMusic 账户登录（D4）：用户名/密码 → 中间层会话 cookie。
 * 登录后若未绑定网易云，DreamMusic 会切到 BindView。
 */
export default function LoginView({
  onLogin,
  onGoRegister,
}: {
  onLogin: () => void
  onGoRegister: () => void
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(username.trim(), password)
      onLogin()
    } catch (err) {
      setError(err instanceof NcmError ? err.message : '登录失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dm-login" data-testid="dm-login">
      <form className="dm-login-card" onSubmit={submit}>
        <h1 className="dm-login-title">DreamMusic</h1>
        <p className="dm-login-sub">登录后绑定你的网易云账号</p>

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
            autoComplete="current-password"
            required
            minLength={6}
            placeholder="至少 6 位"
          />
        </label>

        {error && (
          <p className="dm-login-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" className="dm-btn-primary" disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </button>
        <button
          type="button"
          className="dm-btn-ghost"
          onClick={onGoRegister}
          disabled={busy}
        >
          没有账号？注册
        </button>
      </form>
    </div>
  )
}
