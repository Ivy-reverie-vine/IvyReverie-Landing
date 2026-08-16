import { Router } from 'express'
import { mkdirSync, createWriteStream, unlinkSync } from 'node:fs'
import { join, extname } from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { resolveDownloadUrl } from './downloadSource.js'

const CONTENT_EXT = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
}

function sanitizeName(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'song'
}

function guessExt(url, contentType) {
  if (contentType && CONTENT_EXT[contentType]) return CONTENT_EXT[contentType]
  const ext = extname(new URL(url).pathname).replace('.', '').toLowerCase()
  if (['mp3', 'flac', 'wav', 'm4a', 'ogg', 'aac'].includes(ext)) return ext
  return 'mp3'
}

function json(res, data) {
  res.json({ code: 200, data })
}

function fail(res, status, message) {
  res.status(status).json({ code: status, message })
}

function publicTask(row) {
  return {
    id: row.id,
    songId: row.song_id,
    songName: row.song_name,
    artist: row.artist,
    level: row.level,
    status: row.status,
    received: row.received,
    total: row.total,
    progress: row.total > 0 ? Math.min(100, Math.round((row.received / row.total) * 100)) : 0,
    source: row.source,
    fileName: row.file_name,
    contentType: row.content_type,
    error: row.error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    ready: row.status === 'ready',
  }
}

/**
 * 下载管理器：
 * - POST /auth/downloads        创建任务（立即返回，后台抓文件）
 * - GET  /auth/downloads        任务列表/进度
 * - GET  /auth/downloads/:id/file  获取已完成文件（仅本人）
 * - DELETE /auth/downloads/:id  删除任务和缓存文件
 *
 * 文件由中间层代理抓取后落盘，避免把上游直链交给浏览器导致跳转。
 */
export function createDownloadManager({ users, config, requireUser, audit }) {
  const router = Router()
  const downloadsDir = join(config.dataDir, 'downloads')
  mkdirSync(downloadsDir, { recursive: true })

  async function runTask(id) {
    const task = users.getDownloadTask(id)
    if (!task || task.status !== 'downloading') return
    const user = users.findById(task.user_id)
    if (!user) return

    try {
      // 1) 解析可下载直链（原下载 → unblock → qq/kugou/kuwo/migu）
      const { url, source } = await resolveDownloadUrl({
        config,
        user,
        songId: task.song_id,
        level: task.level,
      })
      users.updateDownloadProgress(id, 0, 0)

      // 2) 由中间层抓取上游文件
      const upstreamRes = await fetch(url, {
        headers: { 'User-Agent': 'DreamMusic/1.0 (personal download manager)' },
        redirect: 'follow',
      })
      if (!upstreamRes.ok || !upstreamRes.body) {
        throw new Error(`上游文件请求失败：HTTP ${upstreamRes.status}`)
      }

      const contentType = String(upstreamRes.headers.get('content-type') || '')
      const ext = guessExt(url, contentType)
      const fileName = `${sanitizeName(task.song_name)} - ${sanitizeName(task.artist)}.${ext}`
      const filePath = join(downloadsDir, `task_${id}.${ext}`)
      let received = 0
      let total = Number(upstreamRes.headers.get('content-length')) || 0

      const progress = new Transform({
        transform(chunk, _enc, cb) {
          received += chunk.length
          if (Date.now() - (progress.lastUpdate || 0) > 500) {
            users.updateDownloadProgress(id, received, total)
            progress.lastUpdate = Date.now()
          }
          cb(null, chunk)
        },
      })
      progress.lastUpdate = Date.now()

      await pipeline(Readable.fromWeb(upstreamRes.body), progress, createWriteStream(filePath))
      if (total <= 0) total = received
      users.completeDownloadTask(id, {
        filePath,
        fileName,
        contentType: contentType || 'application/octet-stream',
        size: received,
      })
      if (audit) audit({ user }, 'download_task_ready', null, `download_task_id=${id} source=${source}`)
    } catch (err) {
      // 失败退款，避免“扣了梦点但没有文件”
      const taskNow = users.getDownloadTask(id)
      if (taskNow?.status === 'downloading') {
        users.failDownloadTask(id, err.message || '下载失败')
        users.addDreamPoints(task.user_id, 1, 'download_refund', `下载失败退款 task=${id}`, id)
      }
    }
  }

  // 创建任务：先扣点，后台抓取；失败自动退款
  router.post('/', requireUser, (req, res) => {
    const songId = Number((req.body || {}).songId)
    const level = String((req.body || {}).level || 'exhigh')
    if (!Number.isFinite(songId) || songId <= 0) return fail(res, 400, 'songId 无效')
    if (!['standard', 'exhigh', 'lossless', 'hires'].includes(level)) {
      return fail(res, 400, '音质参数无效')
    }
    const user = users.findById(req.user.id)
    if (!user.netease_cookie || user.netease_invalid === 1) {
      return fail(res, 403, '请先绑定或重新绑定网易云账号')
    }
    if ((user.dream_points || 0) < 1) {
      return fail(res, 402, '梦点不足，下载需要 1 梦点')
    }

    const created = users.createDownloadTask({
      userId: user.id,
      songId,
      songName: String((req.body || {}).songName || `歌曲 ${songId}`),
      artist: String((req.body || {}).artist || ''),
      level,
      source: '',
      url: '',
    })
    const points = users.addDreamPoints(user.id, -1, 'song_download', `下载歌曲 ${songId}`, created.id)
    if (audit) audit(req, 'download_task_create', null, `task=${created.id} songId=${songId} level=${level}`)

    // 异步执行，接口立即返回
    runTask(created.id).catch(() => {})
    json(res, {
      task: publicTask(users.getDownloadTask(created.id)),
      points,
      message: '下载已经开始，请耐心等待，完成后去下载管理获取',
    })
  })

  router.get('/', requireUser, (req, res) => {
    json(res, users.listDownloadTasks(req.user.id).map(publicTask))
  })

  router.get('/:id/file', requireUser, (req, res) => {
    const id = Number(req.params.id)
    const task = users.getDownloadTask(id)
    if (!task || task.user_id !== req.user.id) return fail(res, 404, '下载任务不存在')
    if (task.status !== 'ready' || !task.file_path) return fail(res, 409, '文件尚未准备好，请耐心等待')
    res.setHeader('Cache-Control', 'private, no-store')
    res.download(task.file_path, task.file_name || 'download.mp3', (err) => {
      if (err && !res.headersSent) fail(res, 500, '文件读取失败')
    })
  })

  router.delete('/:id', requireUser, (req, res) => {
    const id = Number(req.params.id)
    const task = users.getDownloadTask(id)
    if (!task || task.user_id !== req.user.id) return fail(res, 404, '下载任务不存在')
    if (task.file_path) {
      try {
        unlinkSync(task.file_path)
      } catch {
        /* 文件已不存在则忽略 */
      }
    }
    users.deleteDownloadTask(id)
    json(res, { ok: true })
  })

  return { router }
}
