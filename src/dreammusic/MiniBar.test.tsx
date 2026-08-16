import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { useEffect } from 'react'
import { PlayerProvider, usePlayer } from './player/PlayerContext'
import MiniBar from './MiniBar'

vi.mock('./api', () => ({
  songUrlV1: vi.fn(),
  songUrlMatch: vi.fn(),
  songDetail: vi.fn(async () => ({ songs: [] })),
  reportStats: vi.fn(),
}))

const track = {
  id: 1,
  name: '晴天',
  artist: '周杰伦',
  picUrl: 'https://img/1.jpg',
  url: 'https://x/1.mp3',
}

beforeEach(() => {
  localStorage.clear()
})

function Harness({ children }: { children: React.ReactNode }) {
  const { dispatch } = usePlayer()
  useEffect(() => {
    dispatch({ type: 'PLAY_TRACK', track })
  }, [dispatch])
  return <>{children}</>
}

describe('MiniBar — DM-07', () => {
  it('shows track name + cover and calls onClick', async () => {
    const onClick = vi.fn()
    const { findByText, getByRole } = render(
      <PlayerProvider>
        <Harness>
          <MiniBar onClick={onClick} />
        </Harness>
      </PlayerProvider>,
    )
    expect(await findByText('晴天')).toBeInTheDocument()
    act(() => {
      fireEvent.click(getByRole('button', { name: '返回播放页' }))
    })
    expect(onClick).toHaveBeenCalled()
  })

  it('toggles play/pause via mini button', async () => {
    const { findByRole, getByRole } = render(
      <PlayerProvider>
        <Harness>
          <MiniBar onClick={vi.fn()} />
        </Harness>
      </PlayerProvider>,
    )
    // PLAY_TRACK 后 isPlaying=true → 暂停按钮
    const pauseBtn = await findByRole('button', { name: '暂停' })
    act(() => {
      fireEvent.click(pauseBtn)
    })
    // 切换后 → 播放按钮
    expect(getByRole('button', { name: '播放' })).toBeInTheDocument()
  })
})
