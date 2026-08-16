import { useEffect, useState } from 'react'
import {
  redeemCode,
  generateRedeemCodes,
  getRedeemCodes,
  NcmError,
  type RedeemCode,
} from './api'
import { useOptionalCurrentUser } from './CurrentUserContext'
import Icon from '../components/Icon'
import './RedeemModal.css'

/** 兑换码（D7）：顶部礼物入口；普通用户兑换，admin 可生成/查看 */
export default function RedeemModal({ onClose }: { onClose: () => void }) {
  const user = useOptionalCurrentUser()
  const isAdmin = user?.role === 'admin'

  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const [points, setPoints] = useState('10')
  const [count, setCount] = useState('1')
  const [note, setNote] = useState('')
  const [codes, setCodes] = useState<RedeemCode[]>([])
  const [generated, setGenerated] = useState<string[]>([])

  const loadCodes = () => {
    getRedeemCodes()
      .then(setCodes)
      .catch(() => setCodes([]))
  }

  useEffect(() => {
    if (isAdmin) loadCodes()
  }, [isAdmin])

  async function submitRedeem(e: React.FormEvent) {
    e.preventDefault()
    if (!code.trim()) return
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const r = await redeemCode(code.trim())
      setMsg(`兑换成功：+${r.redeemedPoints} 梦点，当前余额 ${r.points}`)
      setCode('')
      if (isAdmin) loadCodes()
    } catch (err) {
      setError(err instanceof NcmError ? err.message : '兑换失败')
    } finally {
      setBusy(false)
    }
  }

  async function submitGenerate(e: React.FormEvent) {
    e.preventDefault()
    const p = Number(points)
    const c = Number(count)
    if (!Number.isInteger(p) || p <= 0) {
      setError('梦点必须是正整数')
      return
    }
    if (!Number.isInteger(c) || c < 1 || c > 100) {
      setError('数量需在 1-100 之间')
      return
    }
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const r = await generateRedeemCodes({ points: p, count: c, note: note.trim() || undefined })
      setGenerated(r.codes)
      setMsg(`已生成 ${r.codes.length} 个兑换码`)
      loadCodes()
    } catch (err) {
      setError(err instanceof NcmError ? err.message : '生成失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="dm-overlay" role="dialog" aria-label="兑换码">
      <div className="dm-overlay-backdrop" onClick={onClose} />
      <div className="dm-redeem-panel">
        <div className="dm-redeem-head">
          <h2 className="dm-redeem-title">
            <Icon name="gift" size={18} /> 兑换码
          </h2>
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="关闭兑换">
            <Icon name="close" size={16} />
          </button>
        </div>

        <form className="dm-redeem-form" onSubmit={submitRedeem}>
          <input
            className="dm-field-input"
            placeholder="输入兑换码"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            aria-label="兑换码输入"
          />
          <button type="submit" className="dm-btn-primary" disabled={busy || !code.trim()}>
            兑换
          </button>
        </form>

        {msg && <p className="dm-redeem-msg" role="status">{msg}</p>}
        {error && <p className="dm-redeem-error" role="alert">{error}</p>}

        {isAdmin && (
          <div className="dm-redeem-admin">
            <form className="dm-redeem-gen" onSubmit={submitGenerate}>
              <h3 className="dm-redeem-subtitle">生成兑换码</h3>
              <div className="dm-redeem-gen-row">
                <label className="dm-redeem-field">
                  梦点
                  <input
                    className="dm-field-input"
                    type="number"
                    min={1}
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                  />
                </label>
                <label className="dm-redeem-field">
                  数量
                  <input
                    className="dm-field-input"
                    type="number"
                    min={1}
                    max={100}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                  />
                </label>
              </div>
              <input
                className="dm-field-input"
                placeholder="备注（可选）"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
              <button type="submit" className="dm-btn-primary" disabled={busy}>
                生成
              </button>
            </form>

            {generated.length > 0 && (
              <div className="dm-redeem-generated">
                {generated.map((c) => (
                  <code key={c} className="dm-redeem-code">
                    {c}
                  </code>
                ))}
              </div>
            )}

            <div className="dm-redeem-list">
              <h3 className="dm-redeem-subtitle">最近兑换码</h3>
              {codes.length === 0 ? (
                <p className="dm-redeem-hint">暂无记录</p>
              ) : (
                codes.slice(0, 20).map((c) => (
                  <div key={c.id} className={`dm-redeem-item ${c.usedBy ? 'is-used' : ''}`}>
                    <code className="dm-redeem-code">{c.code}</code>
                    <span>{c.points} 梦点</span>
                    <span className="dm-redeem-state">{c.usedBy ? `已用 by #${c.usedBy}` : '未使用'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
