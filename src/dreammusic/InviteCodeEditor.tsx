import { useEffect, useState } from 'react'
import { getInviteCode, updateInviteCode, NcmError } from './api'
import './InviteCodeEditor.css'

/** admin：查看/修改注册邀请码（D6-Q8，立即生效） */
export default function InviteCodeEditor() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getInviteCode()
      .then((r) => {
        if (!cancelled) setCode(r.code)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof NcmError ? e.message : '加载邀请码失败')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const next = code.trim()
    if (next.length < 4 || next.length > 64) {
      setError('邀请码需为 4-64 位')
      return
    }
    setSaving(true)
    setError('')
    setMsg('')
    try {
      const r = await updateInviteCode(next)
      setCode(r.code)
      setMsg('邀请码已更新，立即生效')
    } catch (err) {
      setError(err instanceof NcmError ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="dm-invite-editor">
      <h4 className="dm-invite-title">注册邀请码</h4>
      {loading ? (
        <p className="dm-invite-hint">加载中…</p>
      ) : (
        <form className="dm-invite-form" onSubmit={submit}>
          <input
            className="dm-field-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            minLength={4}
            maxLength={64}
            placeholder="4-64 位邀请码"
            aria-label="注册邀请码"
          />
          <button type="submit" className="dm-btn-primary" disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </form>
      )}
      {msg && <p className="dm-invite-msg">{msg}</p>}
      {error && <p className="dm-invite-error" role="alert">{error}</p>}
    </div>
  )
}
