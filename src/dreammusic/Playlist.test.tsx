import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act, waitFor } from '@testing-library/react'
import { PlayerProvider, usePlayer } from './player/PlayerContext'
import PlaylistGrid from './PlaylistGrid'
import PlaylistDetail from './PlaylistDetail'
import { CurrentUserProvider } from './CurrentUserContext'
import { playlistTrackAll, userPlaylist } from './api'

// mock api
vi.mock('./api', () => ({
  loginStatus: vi.fn(async () => ({ data: { profile: { userId: 99 } } })),
  personalized: vi.fn(async () => ({
    result: [
      { id: 101, name: '华语热门', picUrl: 'https://img/1.jpg' },
      { id: 102, name: '夜晚听歌', picUrl: 'https://img/2.jpg' },
    ],
  })),
  userPlaylist: vi.fn(async () => ({
    playlist: [{ id: 201, name: '我的夜曲', coverImgUrl: 'https://img/mine.jpg' }],
  })),
  playlistDetail: vi.fn(async () => ({
    playlist: { id: 101, name: '华语热门', coverImgUrl: 'https://img/1.jpg' },
  })),
  playlistTrackAll: vi.fn(async () => ({
    songs: [
      { id: 1, name: '晴天', ar: [{ name: '周杰伦' }] },
      { id: 2, name: '稻香', ar: [{ name: '周杰伦' }] },
    ],
  })),
  songUrlV1: vi.fn(),
  songUrlMatch: vi.fn(),
  reportStats: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('PlaylistGrid — DM-06', () => {
  it('renders recommended playlist cards and opens on click', async () => {
    const onOpen = vi.fn()
    const { findByAltText } = render(<PlaylistGrid onOpen={onOpen} />)
    const card = await findByAltText('华语热门')
    act(() => {
      fireEvent.click(card.closest('button')!)
    })
    expect(onOpen).toHaveBeenCalledWith(101)
  })

  it('renders the bound user playlists alongside recommendations', async () => {
    const { findByAltText } = render(
      <CurrentUserProvider
        user={{ id: 1, username: 'tester', bound: true, bindInvalid: false, neteaseUid: '99' }}
      >
        <PlaylistGrid onOpen={vi.fn()} />
      </CurrentUserProvider>,
    )
    expect(await findByAltText('我的夜曲')).toBeInTheDocument()
  })

  it('loads the next page of user playlists without replacing the first page', async () => {
    vi.mocked(userPlaylist)
      .mockResolvedValueOnce({
        playlist: [{ id: 201, name: '第一页', coverImgUrl: 'https://img/page-1.jpg' }],
        more: true,
      })
      .mockResolvedValueOnce({
        playlist: [{ id: 202, name: '第二页', coverImgUrl: 'https://img/page-2.jpg' }],
        more: false,
      })
    const { findByAltText, findByRole } = render(
      <CurrentUserProvider
        user={{ id: 1, username: 'tester', bound: true, bindInvalid: false, neteaseUid: '99' }}
      >
        <PlaylistGrid onOpen={vi.fn()} />
      </CurrentUserProvider>,
    )
    expect(await findByAltText('第一页')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(await findByRole('button', { name: '加载更多我的歌单' }))
    })
    expect(await findByAltText('第二页')).toBeInTheDocument()
    expect(await findByAltText('第一页')).toBeInTheDocument()
  })

})

describe('PlaylistDetail — DM-06', () => {
  function Harness({ id, onBack }: { id: number; onBack: () => void }) {
    const { state } = usePlayer()
    const track = state.queue[state.currentIndex]
    return (
      <>
        <div data-testid="current">{track ? track.name : 'none'}</div>
        <div data-testid="queue-count">{state.queue.length}</div>
        <PlaylistDetail id={id} onBack={onBack} />
      </>
    )
  }

  it('renders songs and plays one on click', async () => {
    const { findByText, getByTestId } = render(
      <PlayerProvider>
        <Harness id={101} onBack={vi.fn()} />
      </PlayerProvider>,
    )
    const item = await findByText('晴天')
    act(() => {
      fireEvent.click(item)
    })
    await waitFor(() => expect(getByTestId('current').textContent).toBe('晴天'))
  })

  it('enqueues all songs without clearing current queue', async () => {
    const { findByText, findByTestId, getByRole } = render(
      <PlayerProvider>
        <Harness id={101} onBack={vi.fn()} />
      </PlayerProvider>,
    )
    await findByText('晴天')
    act(() => {
      fireEvent.click(getByRole('button', { name: '加入队列' }))
    })
    expect(await findByTestId('queue-count')).toHaveTextContent('2')
    // 加入队列不自动播放：currentIndex 被 ADD_TO_QUEUE 置为 0，但 isPlaying 为 false
    expect((await findByTestId('current')).textContent).toBe('晴天')
  })

  it('calls onBack on back button', async () => {
    const onBack = vi.fn()
    const { findByText, getByRole } = render(
      <PlayerProvider>
        <Harness id={101} onBack={onBack} />
      </PlayerProvider>,
    )
    await findByText('晴天')
    act(() => {
      fireEvent.click(getByRole('button', { name: /返回/ }))
    })
    expect(onBack).toHaveBeenCalled()
  })

  it('loads the next page of a long playlist without replacing loaded songs', async () => {
    vi.mocked(playlistTrackAll)
      .mockResolvedValueOnce({
        songs: [{ id: 1, name: '晴天', ar: [{ name: '周杰伦' }] }],
        more: true,
      })
      .mockResolvedValueOnce({
        songs: [{ id: 2, name: '稻香', ar: [{ name: '周杰伦' }] }],
        more: false,
      })
    const { findByText, findByRole } = render(
      <PlayerProvider>
        <Harness id={101} onBack={vi.fn()} />
      </PlayerProvider>,
    )
    expect(await findByText('晴天')).toBeInTheDocument()
    await act(async () => {
      fireEvent.click(await findByRole('button', { name: '加载更多歌曲' }))
    })
    expect(await findByText('稻香')).toBeInTheDocument()
    expect(await findByText('晴天')).toBeInTheDocument()
  })
})
