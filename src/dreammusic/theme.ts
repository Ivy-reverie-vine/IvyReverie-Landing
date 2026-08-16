/**
 * 从封面图提取主色（D4-Q7）：平均色 + 轻微提饱和，失败返回 null（UI 用默认主题色）。
 */
export async function getDominantColor(url: string): Promise<string | null> {
  try {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve()
      img.onerror = () => reject(new Error('image load failed'))
      img.src = url
    })
    const size = 24
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(img, 0, 0, size, size)
    const data = ctx.getImageData(0, 0, size, size).data
    let r = 0
    let g = 0
    let b = 0
    let n = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
      n += 1
    }
    if (!n) return null
    // 轻微提饱和：往最亮通道靠一点，避免纯灰
    const avg = [r / n, g / n, b / n]
    const max = Math.max(...avg)
    const boosted = avg.map((v) => Math.round(v + (max - v) * 0.15))
    return `${boosted[0]},${boosted[1]},${boosted[2]}`
  } catch {
    return null
  }
}

/** 把主题色写到根节点 CSS 变量（--dm-theme-rgb），供各组件使用 */
export async function applyThemeColor(picUrl?: string): Promise<void> {
  const root = document.documentElement
  const fallback = '232,139,167'
  if (!picUrl) {
    root.style.setProperty('--dm-theme-rgb', fallback)
    return
  }
  const rgb = await getDominantColor(picUrl)
  root.style.setProperty('--dm-theme-rgb', rgb || fallback)
}
