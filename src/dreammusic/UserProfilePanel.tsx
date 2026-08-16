import { useEffect, useState } from 'react'
import {
  getProfile,
  updateSignature,
  checkin,
  getUsers,
  adminUserAction,
  adminAdjustPoints,
  adminResetPassword,
  getAuditLogs,
  NcmError,
  type UserInfo,
  type AuditLog,
} from './api'
import AccountSettings from './AccountSettings'
import UserAvatar from './UserAvatar'
import AnnouncementAdmin from './AnnouncementAdmin'
import InviteCodeEditor from './InviteCodeEditor'
import Icon from '../components/Icon'
import './UserProfilePanel.css'

/** 与服务端一致使用东八区自然日（server/auth.js shanghaiDate） */
function todayStr() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function fmtDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分钟`
}

/**
 * 用户信息面板（D5）：左侧覆盖队列。头像/签名/签到/梦点/播放统计；admin 多用户管理。
 */
export default function UserProfilePanel({
  onClose,
  onPasswordChanged,
}: {
  onClose: () => void
  onPasswordChanged?: () => void
}) {
  const [profile, setProfile] = useState<UserInfo | null>(null)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [signature, setSignature] = useState('')
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [checkedToday, setCheckedToday] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showAnnounceAdmin, setShowAnnounceAdmin] = useState(false)
  const [showAudit, setShowAudit] = useState(false)
  const [users, setUsers] = useState<UserInfo[] | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[] | null>(null)
  const [adminBusy, setAdminBusy] = useState(false)

  const load = () =>
    getProfile()
      .then((u) => {
        setProfile(u)
        setSignature(u.signature || '')
        setCheckedToday(u.lastCheckinDate === todayStr())
        if (u.role === 'admin') refreshUsers()
      })
      .catch((e) => setError(e instanceof NcmError ? e.message : '加载失败'))

  const refreshUsers = () =>
    getUsers()
      .then(setUsers)
      .catch(() => setUsers(null))

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function saveSignature() {
    setSaving(true)
    setError('')
    try {
      const u = await updateSignature(signature.trim())
      setProfile(u)
      setEditing(false)
    } catch (e) {
      setError(e instanceof NcmError ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  async function doCheckin() {
    setChecking(true)
    setError('')
    try {
      const r = await checkin()
      setCheckedToday(true)
      setProfile((p) => (p ? { ...p, dreamPoints: r.points } : p))
    } catch (e) {
      setError(e instanceof NcmError ? e.message : '签到失败')
    } finally {
      setChecking(false)
    }
  }

  async function adminAdjustPointsAction(u: UserInfo) {
    const deltaRaw = window.prompt(`给 ${u.username} 增加/扣除梦点（填写整数，如 50 或 -20）`)
    if (deltaRaw == null) return
    const delta = Number(deltaRaw)
    if (!Number.isInteger(delta) || delta === 0) {
      setError('请输入非零整数')
      return
    }
    const note = window.prompt('调整原因（必填，会写入流水）') || ''
    if (!note.trim()) {
      setError('必须填写调整原因')
      return
    }
    setAdminBusy(true)
    setError('')
    try {
      await adminAdjustPoints(u.id, delta, note.trim())
      refreshUsers()
    } catch (e) {
      setError(e instanceof NcmError ? e.message : '调整失败')
    } finally {
      setAdminBusy(false)
    }
  }

  async function adminResetPasswordAction(u: UserInfo) {
    const newPassword = window.prompt(`重置 ${u.username} 的密码（至少 6 位）`)
    if (!newPassword) return
    if (newPassword.length < 6) {
      setError('新密码至少 6 位')
      return
    }
    setAdminBusy(true)
    setError('')
    try {
      await adminResetPassword(u.id, newPassword)
    } catch (e) {
      setError(e instanceof NcmError ? e.message : '重置失败')
    } finally {
      setAdminBusy(false)
    }
  }

  function loadAuditLogs() {
    getAuditLogs()
      .then(setAuditLogs)
      .catch((e) => setError(e instanceof NcmError ? e.message : '审计日志加载失败'))
  }

  async function adminAction(u: UserInfo, action: 'ban' | 'unban' | 'set-admin' | 'set-user') {
    setAdminBusy(true)
    setError('')
    let reason: string | undefined
    if (action === 'ban') {
      reason = window.prompt('封禁原因（可留空）') || undefined
    }
    try {
      await adminUserAction(u.id, action, reason)
      refreshUsers()
    } catch (e) {
      setError(e instanceof NcmError ? e.message : '操作失败')
    } finally {
      setAdminBusy(false)
    }
  }

  if (!profile) {
    return (
      <div className="dm-profile" data-testid="dm-profile">
        <button type="button" className="dm-profile-back" onClick={onClose}>
          <Icon name="back" size={16} /> 返回
        </button>
        <p className="dm-profile-hint">{error || '加载中…'}</p>
      </div>
    )
  }

  const isAdmin = profile.role === 'admin'

  return (
    <div className="dm-profile" data-testid="dm-profile">
      <div className="dm-profile-head">
        <button type="button" className="dm-profile-back" onClick={onClose}>
          <Icon name="back" size={16} /> 返回
        </button>
        <span className="dm-profile-title">个人中心</span>
      </div>

      <div className="dm-profile-card">
        <UserAvatar
          user={profile}
          size={76}
          className="dm-profile-avatar"
        />
        <div className="dm-profile-id">
          <span className="dm-profile-name">{profile.username}</span>
          <span className={`dm-profile-role ${isAdmin ? 'is-admin' : ''}`}>
            {isAdmin ? '管理员' : '用户'}
          </span>
        </div>
        {editing ? (
          <div className="dm-profile-sig-edit">
            <input
              className="dm-field-input"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              maxLength={60}
              placeholder="写一句签名（≤60 字）"
              aria-label="签名"
            />
            <button
              type="button"
              className="dm-btn-primary dm-profile-sig-save"
              onClick={saveSignature}
              disabled={saving}
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="dm-profile-sig"
            onClick={() => setEditing(true)}
            title="点击修改签名"
          >
            {profile.signature ? `「${profile.signature}」` : '点击写一句签名'}
          </button>
        )}
      </div>

      <div className="dm-profile-stats">
        <div className="dm-profile-stat">
          <span className="dm-profile-stat-num">{profile.dreamPoints ?? 0}</span>
          <span className="dm-profile-stat-label">梦点</span>
        </div>
        <div className="dm-profile-stat">
          <span className="dm-profile-stat-num">{fmtDuration(profile.playSeconds || 0)}</span>
          <span className="dm-profile-stat-label">播放时长</span>
        </div>
        <div className="dm-profile-stat">
          <span className="dm-profile-stat-num">{profile.playedSongCount ?? 0}</span>
          <span className="dm-profile-stat-label">听过歌曲</span>
        </div>
      </div>

      <button
        type="button"
        className="dm-btn-primary dm-profile-checkin"
        onClick={doCheckin}
        disabled={checkedToday || checking}
      >
        <Icon name={checkedToday ? 'check' : 'plus'} size={16} />
        {checkedToday ? '今日已签到' : '签到 +10 梦点'}
      </button>

      <AccountSettings
        onProfileChanged={(u) => setProfile(u)}
        onPasswordChanged={() => onPasswordChanged?.()}
      />

      {error && (
        <p className="dm-profile-error" role="alert">
          {error}
        </p>
      )}

      {isAdmin && (
        <div className="dm-admin">
          <button
            type="button"
            className="dm-profile-admin-toggle"
            onClick={() => {
              setShowAdmin((v) => !v)
              if (!users) refreshUsers()
            }}
          >
            {showAdmin ? '收起' : '展开'}用户管理
          </button>
          {showAdmin && (
            <ul className="dm-admin-list" data-testid="dm-admin-list">
              {(users || []).map((u) => (
                <li key={u.id} className="dm-admin-item">
                  <div className="dm-admin-info">
                    <span className="dm-admin-name">
                      {u.username}
                      {u.status === 'banned' && (
                        <span className="dm-admin-banned">已封禁</span>
                      )}
                    </span>
                    <span className="dm-admin-sub">
                      {u.role === 'admin' ? '管理员' : '用户'} · {u.dreamPoints ?? 0} 梦点
                    </span>
                  </div>
                  <div className="dm-admin-actions">
                    <button
                      type="button"
                      className="dm-admin-btn"
                      onClick={() => adminAdjustPointsAction(u)}
                      disabled={adminBusy}
                      title="增加/扣除梦点"
                    >
                      梦点
                    </button>
                    {u.id !== profile.id && (
                      <button
                        type="button"
                        className="dm-admin-btn"
                        onClick={() => adminResetPasswordAction(u)}
                        disabled={adminBusy}
                        title="重置密码"
                      >
                        重置密码
                      </button>
                    )}
                    {u.status === 'banned' ? (
                      <button
                        type="button"
                        className="dm-admin-btn is-unban"
                        onClick={() => adminAction(u, 'unban')}
                        disabled={adminBusy}
                      >
                        解封
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="dm-admin-btn is-ban"
                        onClick={() => adminAction(u, 'ban')}
                        disabled={adminBusy}
                      >
                        封禁
                      </button>
                    )}
                    {u.role === 'admin' ? (
                      <button
                        type="button"
                        className="dm-admin-btn"
                        onClick={() => adminAction(u, 'set-user')}
                        disabled={adminBusy}
                      >
                        取消管理
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="dm-admin-btn"
                        onClick={() => adminAction(u, 'set-admin')}
                        disabled={adminBusy}
                      >
                        设为管理
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isAdmin && <InviteCodeEditor />}

      {isAdmin && (
        <div className="dm-admin">
          <button
            type="button"
            className="dm-profile-admin-toggle"
            onClick={() => setShowAnnounceAdmin((v) => !v)}
          >
            {showAnnounceAdmin ? '收起' : '展开'}公告管理
          </button>
          {showAnnounceAdmin && <AnnouncementAdmin />}
        </div>
      )}

      {isAdmin && (
        <div className="dm-admin">
          <button
            type="button"
            className="dm-profile-admin-toggle"
            onClick={() => {
              setShowAudit((v) => !v)
              if (!auditLogs) loadAuditLogs()
            }}
          >
            {showAudit ? '收起' : '展开'}操作审计
          </button>
          {showAudit && (
            <ul className="dm-admin-list" data-testid="dm-audit-list">
              {(auditLogs || []).map((log) => (
                <li key={log.id} className="dm-admin-item">
                  <div className="dm-admin-info">
                    <span className="dm-admin-name">
                      {log.actorUsername} · {log.action}
                    </span>
                    <span className="dm-admin-sub">
                      target={log.targetUserId ?? '-'} · {log.detail || ''} ·{' '}
                      {new Date(log.createdAt).toLocaleString('zh-CN', { hour12: false })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
