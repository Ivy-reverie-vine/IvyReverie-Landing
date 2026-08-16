import { useEffect, useRef, useState } from 'react'
import { qrKey, qrCreate, qrCheck } from './api'

/** QR 绑定状态机（登录后绑定自己的网易云账号） */
export type QrState =
  | 'loading' // 正在获取二维码
  | 'qrcode' // 已展示二维码，等待扫码
  | 'scanned' // 已扫码，等待确认
  | 'expired' // 二维码过期
  | 'error' // 出错
  | 'bound' // 绑定成功

export interface QrBind {
  state: QrState
  /** base64 二维码图片（可直接做 <img src>） */
  qrimg: string | null
  message: string
}

const POLL_INTERVAL = 1500

/**
 * QR 扫码绑定状态机（D4 中间层版）。
 *
 * - key→create→poll(1.5s)；code 800 过期重生成；803 时中间层已把网易 cookie 落库，
 *   前端拿到 bound=true 后回调 onBound() 重新拉 /auth/me。
 * - 代数守卫：dev StrictMode 会挂载两次 effect，旧一代的异步结果一律丢弃，
 *   避免「显示 A 二维码、轮询 B key」的竞态。
 */
export function useQrLogin(onBound: () => void): QrBind {
  const [state, setState] = useState<QrState>('loading')
  const [qrimg, setQrimg] = useState<string | null>(null)
  const [message, setMessage] = useState('正在获取二维码…')
  const onBoundRef = useRef(onBound)
  onBoundRef.current = onBound
  const cancelledRef = useRef(false)
  const genRef = useRef(0)

  useEffect(() => {
    const gen = ++genRef.current
    cancelledRef.current = false
    let key = ''
    let timer: ReturnType<typeof setTimeout> | null = null

    function isStale() {
      return cancelledRef.current || gen !== genRef.current
    }

    async function genQr() {
      setState('loading')
      setMessage('正在获取二维码…')
      try {
        const k = await qrKey()
        if (isStale()) return
        key = k.data?.unikey || ''
        if (!key) throw new Error('no unikey')
        const c = await qrCreate(key, true)
        if (isStale()) return
        const img = c.data?.qrimg || ''
        // 兼容 base64 前缀
        const src = img.startsWith('data:')
          ? img
          : `data:image/png;base64,${img}`
        setQrimg(src)
        setState('qrcode')
        setMessage('请用网易云 App 扫码绑定')
        schedulePoll()
      } catch {
        if (isStale()) return
        setState('error')
        setMessage('二维码获取失败，5s 后重试…')
        timer = setTimeout(genQr, 5000)
      }
    }

    function schedulePoll() {
      timer = setTimeout(poll, POLL_INTERVAL)
    }

    async function poll() {
      if (isStale()) return
      try {
        const r = await qrCheck(key)
        if (isStale()) return
        // 800 过期 → 重新生成
        if (r.code === 800) {
          setState('expired')
          setMessage('二维码已过期，重新生成…')
          timer = setTimeout(genQr, 800)
          return
        }
        // 801 等待扫码 → 继续轮询
        if (r.code === 801) {
          schedulePoll()
          return
        }
        // 802 已扫码待确认
        if (r.code === 802) {
          setState('scanned')
          setMessage('已扫码，请在手机上确认')
          schedulePoll()
          return
        }
        // 803 成功
        if (r.code === 803) {
          setState('bound')
          setMessage('绑定成功')
          onBoundRef.current()
          return
        }
        // 其它：继续轮询
        schedulePoll()
      } catch {
        if (isStale()) return
        // 出错短暂后退继续
        timer = setTimeout(poll, POLL_INTERVAL * 2)
      }
    }

    genQr()
    return () => {
      cancelledRef.current = true
      if (timer) clearTimeout(timer)
    }
  }, [])

  return { state, qrimg, message }
}
