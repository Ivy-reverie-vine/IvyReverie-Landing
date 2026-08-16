import { useEffect, useState } from 'react'
import { getApiKey, rotateApiKey, NcmError } from './api'
import './SearchOverlay.css'
import './ApiKeyPanel.css'

/**
 * API Key 面板（D4）：查看/复制/重置自己的 key。
 * 外部调用 /dreammusic/api/v1/* 时放在 X-API-Key 请求头。
 */
export default function ApiKeyPanel({ onClose }: { onClose: () => void }) {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getApiKey()
      .then((r) => setApiKey(r.apiKey))
      .catch((e) => setError(e instanceof NcmError ? e.message : '获取失败'))
  }, [])

  async function handleRotate() {
    setBusy(true)
    setError('')
    try {
      const r = await rotateApiKey()
      setApiKey(r.apiKey)
      setCopied(false)
    } catch (e) {
      setError(e instanceof NcmError ? e.message : '重置失败')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(apiKey)
      setCopied(true)
    } catch {
      setError('复制失败，请手动选择复制')
    }
  }

  return (
    <div className="dm-overlay" role="dialog" aria-label="API Key">
      <div className="dm-overlay-backdrop" onClick={onClose} />
      <div className="dm-apikey-panel">
        <h2 className="dm-apikey-title">API Key</h2>
        <p className="dm-apikey-desc">
          外部程序调用 <code>/dreammusic/api/v1/...</code> 时，在请求头带上{' '}
          <code>X-API-Key</code>，转发时会自动使用你绑定的网易云账号。
        </p>
        <input
          className="dm-apikey-value"
          readOnly
          value={apiKey}
          aria-label="API Key 值"
          onFocus={(e) => e.currentTarget.select()}
        />
        {error && (
          <p className="dm-apikey-error" role="alert">
            {error}
          </p>
        )}
        {copied && <p className="dm-apikey-ok">已复制</p>}
        <div className="dm-apikey-actions">
          <button type="button" className="dm-btn-primary" onClick={handleCopy}>
            复制
          </button>
          <button
            type="button"
            className="dm-btn-danger"
            onClick={handleRotate}
            disabled={busy}
          >
            {busy ? '重置中…' : '重置（旧 key 立即失效）'}
          </button>
          <button type="button" className="dm-btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
