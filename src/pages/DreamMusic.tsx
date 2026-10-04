import { useCallback, useEffect, useState } from 'react'
import ParticleBackground from '../components/ParticleBackground'
import Icon from '../components/Icon'
import LoginView from '../dreammusic/LoginView'
import RegisterView from '../dreammusic/RegisterView'
import BindView from '../dreammusic/BindView'
import ApiKeyPanel from '../dreammusic/ApiKeyPanel'
import UserProfilePanel from '../dreammusic/UserProfilePanel'
import AnnouncementModal from '../dreammusic/AnnouncementModal'
import MessageModal from '../dreammusic/MessageModal'
import RedeemModal from '../dreammusic/RedeemModal'
import DownloadManagerModal from '../dreammusic/DownloadManagerModal'
import UserAvatar from '../dreammusic/UserAvatar'
import { me, logout, getAnnouncements, type UserInfo } from '../dreammusic/api'
import { CurrentUserProvider } from '../dreammusic/CurrentUserContext'
import { PlayerProvider } from '../dreammusic/player/PlayerContext'
import SearchOverlay from '../dreammusic/SearchOverlay'
import NowPlaying from '../dreammusic/NowPlaying'
import QueueView from '../dreammusic/QueueView'
import PlaylistGrid from '../dreammusic/PlaylistGrid'
import PlaylistDetail from '../dreammusic/PlaylistDetail'
import DailyRecommendView from '../dreammusic/DailyRecommendView'
import FmView from '../dreammusic/FmView'
import LikedSongsView from '../dreammusic/LikedSongsView'
import MiniBar from '../dreammusic/MiniBar'
import './DreamMusic.css'

/** 鉴权状态机：loading → guest / unbound / bound */
type AuthState =
  | { status: 'loading' }
  | { status: 'guest' }
  | { status: 'unbound'; username: string; user: UserInfo }
  | { status: 'bound'; username: string; user: UserInfo }

/**
 * 顶部一级导航（D5-Q2）：Logo + 搜索框 + 用户名 + ⋯；
 * API Key / 退出 收进 ⋯ 菜单，不占一级视觉。
 */
function TopActions({
  user,
  onUser,
  onApiKey,
  onAnnounce,
  onMessage,
  onRedeem,
  onDownloads,
  announceUnread,
  onLogout,
}: {
  user: UserInfo
  onUser: () => void
  onApiKey: () => void
  onAnnounce: () => void
  onMessage: () => void
  onRedeem: () => void
  onDownloads: () => void
  announceUnread: boolean
  onLogout: () => void
}) {
  const [moreOpen, setMoreOpen] = useState(false)
  return (
    <div className="dm-topbar-actions">
      {!user.bound && <button type="button" className="dm-user-chip" onClick={() => window.dispatchEvent(new Event('dm-rebind'))}>绑定网易云</button>}
      <button
        type="button"
        className="dm-icon-btn dm-announce-btn"
        onClick={onAnnounce}
        aria-label={announceUnread ? '平台公告（有新公告）' : '平台公告'}
      >
        <Icon name="bell" size={16} />
        {announceUnread && <span className="dm-announce-dot" aria-hidden="true" />}
      </button>
      <button
        type="button"
        className="dm-icon-btn"
        onClick={onMessage}
        aria-label="发送消息"
        title="发送消息"
      >
        <Icon name="send" size={16} />
      </button>
      <button
        type="button"
        className="dm-icon-btn"
        onClick={onDownloads}
        aria-label="下载管理"
        title="下载管理"
      >
        <Icon name="download" size={16} />
      </button>
      <button
        type="button"
        className="dm-icon-btn"
        onClick={onRedeem}
        aria-label="兑换码"
        title="兑换码"
      >
        <Icon name="gift" size={16} />
      </button>
      <button type="button" className="dm-user-chip" onClick={onUser} aria-label="个人中心">
        <UserAvatar user={user} size={30} className="dm-user-avatar" />
        <span className="dm-user-chip-name">{user.username}</span>
      </button>
      <div className="dm-more-wrap">
        <button
          type="button"
          className="dm-icon-btn"
          onClick={() => setMoreOpen((v) => !v)}
          aria-label="更多"
          aria-expanded={moreOpen}
        >
          <Icon name="more" size={18} />
        </button>
        {moreOpen && (
          <>
            <div className="dm-more-backdrop" onClick={() => setMoreOpen(false)} />
            <div className="dm-more-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false)
                  onApiKey()
                }}
              >
                API Key
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false)
                  onLogout()
                }}
              >
                退出登录
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** 左栏：队列 / 歌单 tab + 歌单详情 */
function LeftPane({
  playlistId,
  onOpenPlaylist,
  onClosePlaylist,
  onCollapse,
}: {
  playlistId: number | null
  onOpenPlaylist: (id: number) => void
  onClosePlaylist: () => void
  onCollapse: () => void
}) {
  const [tab, setTab] = useState<'queue' | 'playlist' | 'daily' | 'fm' | 'liked'>('queue')

  return (
    <div className="dm-left-inner">
      <button
        type="button"
        className="dm-left-collapse"
        onClick={onCollapse}
        aria-label="收起左侧列表"
        title="收起列表"
      >
        «
      </button>
      <div className="dm-left-tabs">
        <button
          type="button"
          className={tab === 'queue' ? 'dm-tab is-active' : 'dm-tab'}
          onClick={() => {
            setTab('queue')
            onClosePlaylist()
          }}
        >
          队列
        </button>
        <button
          type="button"
          className={tab === 'playlist' ? 'dm-tab is-active' : 'dm-tab'}
          onClick={() => {
            setTab('playlist')
            onClosePlaylist()
          }}
        >
          歌单
        </button>
        <button
          type="button"
          className={tab === 'daily' ? 'dm-tab is-active' : 'dm-tab'}
          onClick={() => {
            setTab('daily')
            onClosePlaylist()
          }}
        >
          每日推荐
        </button>
        <button
          type="button"
          className={tab === 'fm' ? 'dm-tab is-active' : 'dm-tab'}
          onClick={() => {
            setTab('fm')
            onClosePlaylist()
          }}
        >
          私人FM
        </button>
        <button
          type="button"
          className={tab === 'liked' ? 'dm-tab is-active' : 'dm-tab'}
          onClick={() => {
            setTab('liked')
            onClosePlaylist()
          }}
        >
          我喜欢
        </button>
      </div>
      <div className="dm-left-body">
        {tab === 'queue' && <QueueView />}
        {tab === 'playlist' &&
          (playlistId ? (
            <PlaylistDetail id={playlistId} onBack={onClosePlaylist} />
          ) : (
            <PlaylistGrid onOpen={onOpenPlaylist} />
          ))}
        {tab === 'daily' && <DailyRecommendView />}
        {tab === 'fm' && <FmView />}
        {tab === 'liked' && <LikedSongsView />}
      </div>
    </div>
  )
}

/**
 * DreamMusic（D4 + D5）：
 * 未登录 → 账户登录/注册；已登录未绑定 → QR 绑定；已绑定 → 播放器。
 * 网易云绑定失效（301）→ dm-rebind 事件切回绑定页，会话保留。
 */
export default function DreamMusic() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  const [registerOpen, setRegisterOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [apiKeyOpen, setApiKeyOpen] = useState(false)
  const [leftOpen, setLeftOpen] = useState(false)
  const [userPane, setUserPane] = useState(false)
  const [playlistId, setPlaylistId] = useState<number | null>(null)
  const [announceOpen, setAnnounceOpen] = useState(false)
  const [announceUnread, setAnnounceUnread] = useState(false)
  const [messageOpen, setMessageOpen] = useState(false)
  const [redeemOpen, setRedeemOpen] = useState(false)
  const [downloadsOpen, setDownloadsOpen] = useState(false)
  const [leftCollapsed, setLeftCollapsed] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const u = await me()
      setAuth(
        u.bound
          ? { status: 'bound', username: u.username, user: u }
          : { status: 'unbound', username: u.username, user: u },
      )
    } catch {
      setAuth({ status: 'guest' })
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  // 头像/资料更新后刷新顶部用户信息
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('dm-profile-changed', handler)
    return () => window.removeEventListener('dm-profile-changed', handler)
  }, [refresh])

  // 公告未读红点：只在已绑定进入播放器后检查
  useEffect(() => {
    if (auth.status !== 'bound') return
    let cancelled = false
    const lastSeen = Number(localStorage.getItem('dreammusic_last_announcement_id') || 0)
    getAnnouncements()
      .then((list) => {
        if (!cancelled) setAnnounceUnread(list.some((a) => a.id > lastSeen))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [auth.status])

  // 网易云绑定失效：切回绑定页（保留 DreamMusic 会话）
  useEffect(() => {
    const handler = () => refresh()
    window.addEventListener('dm-rebind', handler)
    return () => window.removeEventListener('dm-rebind', handler)
  }, [refresh])

  // DreamMusic 会话失效（401）：清空所有浮层/子视图并回登录页
  useEffect(() => {
    const handler = () => {
      setRegisterOpen(false)
      setSearchOpen(false)
      setApiKeyOpen(false)
      setUserPane(false)
      setLeftOpen(false)
      setPlaylistId(null)
      setAnnounceOpen(false)
      setMessageOpen(false)
      setRedeemOpen(false)
      setDownloadsOpen(false)
      setLeftCollapsed(false)
      refresh()
    }
    window.addEventListener('dm-unauthorized', handler)
    return () => window.removeEventListener('dm-unauthorized', handler)
  }, [refresh])

  /** MiniBar 点击：关闭浮层/抽屉/歌单详情，回到全屏 NowPlaying */
  function returnToPlayer() {
    setSearchOpen(false)
    setApiKeyOpen(false)
    setUserPane(false)
    setLeftOpen(false)
    setPlaylistId(null)
    setAnnounceOpen(false)
    setMessageOpen(false)
    setRedeemOpen(false)
    setDownloadsOpen(false)
  }

  async function handleLogout() {
    try {
      await logout()
    } catch {
      /* 忽略登出网络错误，本地状态照常清 */
    }
    setAuth({ status: 'guest' })
    setRegisterOpen(false)
    setUserPane(false)
  }

  if (auth.status === 'loading') {
    return (
      <div className="dm-app dm-app-login" data-testid="dreammusic">
        <div className="dm-bg" aria-hidden="true" />
        <ParticleBackground active />
        <p className="dm-boot">加载中…</p>
      </div>
    )
  }

  if (auth.status === 'guest') {
    return (
      <div className="dm-app dm-app-login" data-testid="dreammusic">
        <div className="dm-bg" aria-hidden="true" />
        <ParticleBackground active />
        {registerOpen ? (
          <RegisterView
            onRegistered={() => {
              setRegisterOpen(false)
              refresh()
            }}
            onBackLogin={() => setRegisterOpen(false)}
          />
        ) : (
          <LoginView onLogin={refresh} onGoRegister={() => setRegisterOpen(true)} />
        )}
      </div>
    )
  }

  if (auth.status === 'unbound') {
    return (
      <div className="dm-app dm-app-login" data-testid="dreammusic">
        <div className="dm-bg" aria-hidden="true" />
        <ParticleBackground active />
        <BindView onBound={refresh} onLogout={handleLogout}
          onSkip={() => setAuth({ status: 'bound', username: auth.username, user: auth.user })} />
      </div>
    )
  }

  return (
    <div className="dm-app" data-testid="dreammusic">
      <div className="dm-bg" aria-hidden="true" />
      <CurrentUserProvider user={auth.user}>
      <PlayerProvider storageKey={auth.username}>
        <div className="dm-shell">
          <header className="dm-topbar" data-testid="dm-topbar">
            <div className="dm-topbar-left">
              <button
                type="button"
                className="dm-hamburger"
                onClick={() => setLeftOpen((v) => !v)}
                aria-label="菜单"
                aria-expanded={leftOpen}
              >
                <Icon name="menu" size={17} />
              </button>
              <span className="dm-title">
                <span className="dm-title-a">Dream</span>
                <span className="dm-title-b">Music</span>
              </span>
            </div>
            <div className="dm-topbar-center">
              <button
                type="button"
                className="dm-search-pill"
                onClick={() => setSearchOpen(true)}
                aria-label="搜索"
              >
                <Icon name="search" size={15} />
                <span className="dm-search-pill-text">搜索歌曲 / 歌手</span>
              </button>
            </div>
            <TopActions
              user={auth.user}
              onUser={() => {
                setLeftOpen(false)
                setLeftCollapsed(true)
                setUserPane(true)
              }}
              onApiKey={() => setApiKeyOpen(true)}
              onAnnounce={() => setAnnounceOpen(true)}
              onMessage={() => setMessageOpen(true)}
              onRedeem={() => setRedeemOpen(true)}
              onDownloads={() => setDownloadsOpen(true)}
              announceUnread={announceUnread}
              onLogout={handleLogout}
            />
          </header>
          <main className="dm-main">
            <aside
              className={`dm-left ${leftOpen ? 'is-open' : ''} ${leftCollapsed ? 'is-collapsed' : ''}`}
              data-testid="dm-left"
            >
              {leftCollapsed ? (
                <button
                  type="button"
                  className="dm-left-expand"
                  onClick={() => setLeftCollapsed(false)}
                  aria-label="展开左侧列表"
                  title="展开列表"
                >
                  »
                </button>
              ) : (
                <LeftPane
                  playlistId={playlistId}
                  onOpenPlaylist={(id) => setPlaylistId(id)}
                  onClosePlaylist={() => setPlaylistId(null)}
                  onCollapse={() => setLeftCollapsed(true)}
                />
              )}
            </aside>
            <section className="dm-right" data-testid="dm-right">
              <NowPlaying />
            </section>
            {userPane && (
              <div
                className="dm-user-backdrop"
                onClick={() => setUserPane(false)}
                aria-hidden="true"
              />
            )}
            {userPane && (
              <aside className="dm-user-drawer is-open" data-testid="dm-user-drawer">
                <UserProfilePanel
                  onClose={() => setUserPane(false)}
                  onPasswordChanged={handleLogout}
                />
              </aside>
            )}
            {leftOpen && (
              <div
                className="dm-left-backdrop"
                onClick={() => setLeftOpen(false)}
                aria-hidden="true"
              />
            )}
          </main>
        </div>
        {searchOpen && <SearchOverlay onClose={() => setSearchOpen(false)} />}
        {apiKeyOpen && <ApiKeyPanel onClose={() => setApiKeyOpen(false)} />}
        {announceOpen && (
          <AnnouncementModal
            onClose={() => {
              setAnnounceOpen(false)
              setAnnounceUnread(false)
            }}
          />
        )}
        {messageOpen && (
          <MessageModal
            onClose={() => setMessageOpen(false)}
            onSent={refresh}
          />
        )}
        {redeemOpen && <RedeemModal onClose={() => setRedeemOpen(false)} />}
        {downloadsOpen && (
          <DownloadManagerModal onClose={() => setDownloadsOpen(false)} />
        )}
        {/* 焦点不在主播放视图时显示 mini 条（搜索/API Key/用户中心/歌单详情/公告） */}
        {(searchOpen || apiKeyOpen || userPane || playlistId !== null || announceOpen || messageOpen || redeemOpen || downloadsOpen) && (
          <MiniBar onClick={returnToPlayer} />
        )}
      </PlayerProvider>
      </CurrentUserProvider>
    </div>
  )
}
