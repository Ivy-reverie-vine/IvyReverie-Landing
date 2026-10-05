import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act, waitFor } from '@testing-library/react'
import { PlayerProvider, usePlayer } from './player/PlayerContext'
import SearchOverlay from './SearchOverlay'

// mock api
vi.mock('./api', () => ({
  mediaSearch: vi.fn(async () => ({
      data: [
        {
          mediaRef: 'tencent-ref', source: 'meting-tencent', sourceId: 'qq-001',
          title: '晴天', artists: ['周杰伦'],
          album: { name: 'The Day', pictureUrl: 'https://img/1.jpg' },
        },
      ],
  })),
  mediaUrl: vi.fn(async () => ({ audioIntegrity: { status: 'full' as const, reason: 'controlled_full', catalogDurationMs: 90000, resourceDurationMs: 90000, evidence: ['controlled'] }, data: [{ url: 'https://x/1.mp3' as string | null }] })),
  songUrlV1: vi.fn(async () => ({ audioIntegrity: { status: 'full' as const, reason: 'controlled_full', catalogDurationMs: 90000, resourceDurationMs: 90000, evidence: ['controlled'] }, data: [{ url: 'https://x/1.mp3' }] })),
  songUrlMatch: vi.fn(async () => ({ audioIntegrity: { status: 'full' as const, reason: 'controlled_full', catalogDurationMs: 90000, resourceDurationMs: 90000, evidence: ['controlled'] }, data: [{ url: 'https://qq/1.mp3' }] })),
  reportStats: vi.fn(),
  NcmError: class NcmError extends Error {
    code: string
    constructor(m: string, c: string) {
      super(m)
      this.code = c
    }
  },
}))

import { mediaSearch, mediaUrl, songUrlMatch } from './api'

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
    expect(mediaSearch).toHaveBeenCalledWith('晴天', '')
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
    expect(mediaUrl).toHaveBeenCalledWith('tencent-ref', 'exhigh')
    // 拿到 url → PLAY_TRACK → 当前曲变成「晴天」
    expect(await findByText('晴天')).toBeInTheDocument()
    expect(getByTestId('current').textContent).toBe('晴天')
  })

  it('keeps an unavailable source result from falling into the download resolver', async () => {
    // 让 songUrlV1 返回空 url
    vi.mocked(mediaUrl).mockResolvedValueOnce({ data: [{ url: null }] })
    const { getByLabelText, findByText, getByTestId } = renderHarness()
    fireEvent.change(getByLabelText('搜索关键词'), {
      target: { value: '周杰伦' },
    })
    const item = await findByText('晴天')
    act(() => {
      fireEvent.click(item)
    })
    // 解灰路径有两次 await，等 PLAY_TRACK 落地（当前曲变「晴天」）再断言
    await waitFor(() => expect(getByTestId('current').textContent).toBe('none'))
    expect(await findByText(/当前来源音频不可用/)).toBeInTheDocument()
    expect(mediaUrl).toHaveBeenCalledWith('tencent-ref', 'exhigh')
    expect(songUrlMatch).not.toHaveBeenCalled()
  })
  it('sends the selected source and replaces previous source results', async () => {
    const { getByLabelText, findByText } = renderHarness()
    fireEvent.change(getByLabelText('搜索关键词'), { target: { value: '晴天' } })
    await findByText('晴天')
    fireEvent.change(getByLabelText('音源'), { target: { value: 'meting-kugou' } })
    await waitFor(() => expect(mediaSearch).toHaveBeenLastCalledWith('晴天', 'meting-kugou'))
  })
  for (const status of ['preview', 'unknown', 'unavailable'] as const) {
    it(`keeps ${status} out of the audio element and lets the user retry the selected result`, async () => {
      vi.mocked(mediaUrl).mockResolvedValueOnce({ data: [{ url: 'https://x/non-full.mp3' }],
        audioIntegrity: { status, reason: 'controlled', catalogDurationMs: 90000, resourceDurationMs: 30000, evidence: [] } })
      const ui = renderHarness()
      fireEvent.change(ui.getByLabelText('搜索关键词'), { target: { value: '晴天' } })
      const item = await ui.findByText('晴天')
      fireEvent.click(item)
      expect(await ui.findByRole('alert')).toHaveTextContent(/重试/)
      expect(ui.getByTestId('current')).toHaveTextContent('none')
      expect(ui.container.querySelector('audio')).not.toHaveAttribute('src')
      expect(songUrlMatch).not.toHaveBeenCalled()
      await waitFor(() => expect(item.closest('button')).not.toBeDisabled())
      fireEvent.click(item)
      await waitFor(() => expect(ui.getByTestId('current')).toHaveTextContent('晴天'))
      expect(mediaUrl).toHaveBeenLastCalledWith('tencent-ref', 'exhigh')
    })
  }
})
