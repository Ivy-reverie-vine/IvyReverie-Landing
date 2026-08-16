import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act, waitFor } from '@testing-library/react'
import { PlayerProvider, usePlayer } from './player/PlayerContext'
import PlaylistGrid from './PlaylistGrid'
import PlaylistDetail from './PlaylistDetail'

// mock api
vi.mock('./api', () => ({
  personalized: vi.fn(async () => ({
    result: [
      { id: 101, name: '华语热门', picUrl: 'https://img/1.jpg' },
      { id: 102, name: '夜晚听歌', picUrl: 'https://img/2.jpg' },
    ],
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
})
