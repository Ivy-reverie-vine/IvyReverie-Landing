import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act, waitFor } from '@testing-library/react'
import { PlayerProvider } from './player/PlayerContext'
import { CurrentUserProvider } from './CurrentUserContext'
import DailyRecommendView from './DailyRecommendView'
import FmView from './FmView'
import LikedSongsView from './LikedSongsView'

vi.mock('./api', () => ({
  recommendSongs: vi.fn(async () => ({
    data: { dailySongs: [{ id: 1, name: '每日好歌', ar: [{ name: '歌手A' }] }] },
  })),
  personalFm: vi.fn(async () => ({
    data: [{ id: 2, name: 'FM 好歌', ar: [{ name: '歌手B' }] }],
  })),
  likedList: vi.fn(async () => ({ ids: [3] })),
  songDetail: vi.fn(async () => ({
    songs: [{ id: 3, name: '我喜欢的歌', ar: [{ name: '歌手C' }] }],
  })),
  loginStatus: vi.fn(async () => ({ data: { profile: { userId: 42 } } })),
  songUrlV1: vi.fn(),
  songUrlMatch: vi.fn(),
  reportStats: vi.fn(),
  NcmError: class NcmError extends Error {
    code: string
    constructor(m: string, c: string) {
      super(m)
      this.code = c
    }
  },
}))

import { personalFm } from './api'

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

function renderWithPlayer(ui: React.ReactNode) {
  return render(<PlayerProvider>{ui}</PlayerProvider>)
}

describe('collections — T-01/T-02/T-03', () => {
  it('DailyRecommendView renders recommended songs', async () => {
    const { findByText } = renderWithPlayer(<DailyRecommendView />)
    expect(await findByText('每日好歌')).toBeInTheDocument()
  })

  it('FmView renders FM songs and requests a fresh batch on 换一批', async () => {
    const { findByText, getByRole } = renderWithPlayer(<FmView />)
    expect(await findByText('FM 好歌')).toBeInTheDocument()
    act(() => {
      fireEvent.click(getByRole('button', { name: '换一批' }))
    })
    await waitFor(() => expect(personalFm).toHaveBeenCalledWith(true))
  })

  it('LikedSongsView resolves liked ids into song details', async () => {
    const { findByText } = render(
      <PlayerProvider>
        <CurrentUserProvider
          user={{
            id: 1,
            username: 'tester',
            bound: true,
            bindInvalid: false,
            neteaseUid: '42',
          }}
        >
          <LikedSongsView />
        </CurrentUserProvider>
      </PlayerProvider>,
    )
    expect(await findByText('我喜欢的歌')).toBeInTheDocument()
  })
})
