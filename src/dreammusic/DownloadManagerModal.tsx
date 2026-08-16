import { useEffect, useRef, useState } from 'react'
import {
  getDownloadTasks,
  deleteDownloadTask,
  downloadTaskFileUrl,
  NcmError,
  type DownloadTask,
} from './api'
import Icon from '../components/Icon'
import './DownloadManagerModal.css'

function fmtSize(n: number): string {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** 下载管理（顶部导航入口）：展示后台下载任务，完成后从中间层获取文件 */
export default function DownloadManagerModal({ onClose }: { onClose: () => void }) {
  const [tasks, setTasks] = useState<DownloadTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  async function load() {
    try {
      const list = await getDownloadTasks()
      setTasks(list)
      setError('')
    } catch (e) {
      setError(e instanceof NcmError ? e.message : '下载列表加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    timerRef.current = setInterval(load, 1500)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  async function remove(task: DownloadTask) {
    try {
      await deleteDownloadTask(task.id)
      setTasks((list) => list.filter((t) => t.id !== task.id))
    } catch (e) {
      setError(e instanceof NcmError ? e.message : '删除失败')
    }
  }

  return (
    <div className="dm-overlay" role="dialog" aria-label="下载管理">
      <div className="dm-overlay-backdrop" onClick={onClose} />
      <div className="dm-download-panel">
        <div className="dm-download-head">
          <h2 className="dm-download-title">
            <Icon name="download" size={18} /> 下载管理
          </h2>
          <button type="button" className="dm-icon-btn" onClick={onClose} aria-label="关闭下载管理">
            <Icon name="close" size={16} />
          </button>
        </div>

        {loading && <p className="dm-download-hint">加载中…</p>}
        {error && <p className="dm-download-error" role="alert">{error}</p>}

        {!loading && tasks.length === 0 && (
          <p className="dm-download-hint">暂无下载任务。播放页点「下载」会出现在这里。</p>
        )}

        <ul className="dm-download-list">
          {tasks.map((t) => (
            <li key={t.id} className={`dm-download-item status-${t.status}`}>
              <div className="dm-download-info">
                <span className="dm-download-name">
                  {t.songName}
                  {t.artist && <em>{t.artist}</em>}
                </span>
                <span className="dm-download-meta">
                  {t.status === 'downloading' && `下载中 ${t.progress}% · ${fmtSize(t.received)} / ${fmtSize(t.total)}`}
                  {t.status === 'ready' && `已完成 · ${fmtSize(t.total)}`}
                  {t.status === 'failed' && `失败：${t.error || '未知错误'}`}
                </span>
                {t.status === 'downloading' && (
                  <span className="dm-download-progress">
                    <span style={{ width: `${t.progress}%` }} />
                  </span>
                )}
              </div>
              <div className="dm-download-actions">
                {t.ready && (
                  <a
                    className="dm-download-get"
                    href={downloadTaskFileUrl(t.id)}
                    download={t.fileName || `${t.songName}.mp3`}
                  >
                    获取文件
                  </a>
                )}
                <button
                  type="button"
                  className="dm-download-del"
                  onClick={() => remove(t)}
                  aria-label={`删除任务 ${t.songName}`}
                >
                  <Icon name="trash" size={13} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
