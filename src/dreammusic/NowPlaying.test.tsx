import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { PlayerProvider, usePlayer } from './player/PlayerContext'
import NowPlaying from './NowPlaying'

// mock api：songDetail 给封面，lyricNew 给歌词
vi.mock('./api', () => ({
  songDetail: vi.fn(async () => ({
    songs: [{ id: 1, al: { picUrl: 'https://img/1.jpg' } }],
  })),
  lyricNew: vi.fn(async () => ({
    lrc: { lyric: '[00:01.00]第一行\n[00:03.00]第二行' },
    yrc: { lyric: '' },
  })),
  songUrlV1: vi.fn(),
  songUrlMatch: vi.fn(),
  reportStats: vi.fn(),
}))

import { lyricNew } from './api'

beforeEach(() => {
  localStorage.clear()
})

function Harness() {
  const { dispatch } = usePlayer()
  useEffect(() => {
    dispatch({
      type: 'PLAY_TRACK',
      track: { id: 1, name: '晴天', artist: '周杰伦', url: 'https://x/1.mp3' },
    })
  }, [dispatch])
  return <NowPlaying />
}

describe('NowPlaying — DM-06', () => {
  it('renders cover + lyrics (lrc lines)', async () => {
    const { findByAltText, findByText } = render(
      <PlayerProvider>
        <Harness />
      </PlayerProvider>,
    )
    expect(await findByAltText('晴天')).toHaveAttribute('src', 'https://img/1.jpg?param=600y600')
    expect(await findByText('第一行')).toBeInTheDocument()
    expect(lyricNew).toHaveBeenCalledWith(1)
  })

  it('uses yrc chars when available', async () => {
    vi.mocked(lyricNew).mockResolvedValueOnce({
      lrc: { lyric: '' },
      yrc: { lyric: '[1000,2000](1000,500,0)我(1500,500,0)爱' },
    })
    const { findByText } = render(
      <PlayerProvider>
        <Harness />
      </PlayerProvider>,
    )
    // yrc 渲染字 span，聚合文本「我爱」
    expect(await findByText('我')).toBeInTheDocument()
  })

  it('shows hint when no track', () => {
    const { container } = render(
      <PlayerProvider>
        <NowPlaying />
      </PlayerProvider>,
    )
    expect(container.querySelector('.dm-np-hint')).toHaveTextContent('未播放')
  })

  it('shows 纯音乐 hint when lyrics empty', async () => {
    vi.mocked(lyricNew).mockResolvedValueOnce({ lrc: { lyric: '' }, yrc: { lyric: '' } })
    const { findByText } = render(
      <PlayerProvider>
        <Harness />
      </PlayerProvider>,
    )
    // 曲目存在但歌词空 → 纯音乐
    await waitFor(() => expect(findByText).toBeDefined())
    // 先确保 track 已设置（PLAY_TRACK 已 dispatch）
    expect(await findByText('纯音乐，无歌词')).toBeInTheDocument()
  })
})
