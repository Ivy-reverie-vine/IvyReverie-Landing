import { useState } from 'react'
import { me } from './api'
import { useQrLogin } from './useQrLogin'
import './LoginView.css'

/**
 * 网易云 QR 绑定页（D4）：登录 DreamMusic 但尚未绑定网易云时展示。
 * 扫码成功后中间层已把网易 cookie 落库，回调 onBound 刷新 /auth/me。
 */
export default function BindView({
  onBound,
  onLogout,
  onSkip,
}: {
  onBound: () => void
  onLogout: () => void
  onSkip?: () => void
}) {
  const { state, qrimg, message } = useQrLogin(onBound)
  const [checking, setChecking] = useState(false)
  const [manualMsg, setManualMsg] = useState('')

  /** 手动兜底：轮询没自动前进时，点按钮主动查一次绑定状态 */
  async function handleManualCheck() {
    setChecking(true)
    setManualMsg('')
    try {
      const u = await me()
      if (u.bound) {
        onBound()
        return
      }
      setManualMsg('还没检测到绑定，请确认手机上已点击「确认」')
    } catch {
      setManualMsg('检查失败，请稍后再试')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="dm-login" data-testid="dm-bind">
      <div className="dm-login-card">
        <h1 className="dm-login-title">绑定网易云</h1>
        <p className="dm-login-sub">用网易云 App 扫码，绑定你自己的账号</p>
        <div className="dm-qr-wrap" data-testid="dm-qr-wrap">
          {qrimg && state !== 'bound' ? (
            <img
              className="dm-qr"
              src={qrimg}
              alt="绑定二维码"
              data-testid="dm-qr-img"
            />
          ) : (
            <div className="dm-qr-placeholder" data-testid="dm-qr-placeholder">
              {state === 'loading' ? '加载中…' : '—'}
            </div>
          )}
          {state === 'scanned' && (
            <div className="dm-qr-overlay">已扫码，请在手机上确认</div>
          )}
        </div>
        <p className="dm-login-status" role="status">
          {message}
        </p>
        {(state === 'qrcode' || state === 'scanned') && (
          <button
            type="button"
            className="dm-btn-primary"
            onClick={handleManualCheck}
            disabled={checking}
          >
            {checking ? '检查中…' : '我已扫码，进入播放器'}
          </button>
        )}
        {manualMsg && (
          <p className="dm-login-status" role="status">
            {manualMsg}
          </p>
        )}
        {onSkip && <button type="button" className="dm-btn-ghost" onClick={onSkip}>先使用其他音源</button>}
        <button type="button" className="dm-btn-ghost" onClick={onLogout}>
          退出登录
        </button>
      </div>
    </div>
  )
}
