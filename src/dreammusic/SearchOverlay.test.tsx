import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act, waitFor } from '@testing-library/react'
import { PlayerProvider, usePlayer } from './player/PlayerContext'
import SearchOverlay from './SearchOverlay'

// mock api
vi.mock('./api', () => ({
  search: vi.fn(async () => ({
    result: {
      songs: [
        {
          id: 1,
          name: '晴天',
          artists: [{ name: '周杰伦' }],
          album: { name: 'The Day', picUrl: 'https://img/1.jpg' },
        },
      ],
    },
  })),
  songUrlV1: vi.fn(async () => ({ data: [{ url: 'https://x/1.mp3' }] })),
  songUrlMatch: vi.fn(async () => ({ data: [{ url: 'https://qq/1.mp3' }] })),
  reportStats: vi.fn(),
  NcmError: class NcmError extends Error {
    code: string
    constructor(m: string, c: string) {
      super(m)
      this.code = c
    }
  },
}))

import { search, songUrlV1, songUrlMatch } from './api'

/** 壳：暴露当前曲名 + 渲染 SearchOverlay */
function Harness({ onClose }: { onClose: () => void }) {
  const { state } = usePlayer()
  const track = state.queue[state.currentIndex]
  return (
    <>
      <div data-testid="current">{track ? track.name : 'none'}</div>
      <SearchOverlay onClose={onClose} />
    </>
  )
}

function renderHarness(onClose = vi.fn()) {
  return render(
    <PlayerProvider>
      <Harness onClose={onClose} />
    </PlayerProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.clearAllMocks()
})

describe('SearchOverlay — DM-05', () => {
  it('renders results after debounced search', async () => {
    const { getByLabelText, findByText } = renderHarness()
    fireEvent.change(getByLabelText('搜索关键词'), {
      target: { value: '晴天' },
    })
    expect(await findByText('晴天')).toBeInTheDocument()
    expect(search).toHaveBeenCalledWith('晴天')
  })

  it('clicking a result fetches url and plays it', async () => {
    const { getByLabelText, findByText, getByTestId } = renderHarness()
    fireEvent.change(getByLabelText('搜索关键词'), {
      target: { value: '周杰伦' },
    })
    const item = await findByText('晴天')
    act(() => {
      fireEvent.click(item)
    })
    expect(songUrlV1).toHaveBeenCalledWith(1, 'exhigh')
    // 拿到 url → PLAY_TRACK → 当前曲变成「晴天」
    expect(await findByText('晴天')).toBeInTheDocument()
    expect(getByTestId('current').textContent).toBe('晴天')
  })

  it('falls back to unblock (songUrlMatch) when url is empty', async () => {
    // 让 songUrlV1 返回空 url
    vi.mocked(songUrlV1).mockResolvedValueOnce({ data: [{ url: null }] })
    const { getByLabelText, findByText, getByTestId } = renderHarness()
    fireEvent.change(getByLabelText('搜索关键词'), {
      target: { value: '周杰伦' },
    })
    const item = await findByText('晴天')
    act(() => {
      fireEvent.click(item)
    })
    // 解灰路径有两次 await，等 PLAY_TRACK 落地（当前曲变「晴天」）再断言
    await waitFor(() => expect(getByTestId('current').textContent).toBe('晴天'))
    expect(songUrlV1).toHaveBeenCalledWith(1, 'exhigh')
    expect(songUrlMatch).toHaveBeenCalledWith(1, 'qq')
  })
})
