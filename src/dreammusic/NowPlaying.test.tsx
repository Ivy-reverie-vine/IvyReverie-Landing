import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, waitFor, fireEvent } from '@testing-library/react'
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
  mediaLyrics: vi.fn(async () => ({ lrc: { lyric: '[00:01.00]来源歌词' } })),
  mediaDetail: vi.fn(async () => ({ data: [{ album: { pictureUrl: 'https://img/cover.jpg?signature=preserved' } }] })),
}))

import { lyricNew, mediaLyrics } from './api'

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
  it('loads non-NetEase lyrics by mediaRef and preserves the cover URL', async () => {
    function SourceHarness() {
      const { dispatch } = usePlayer()
      useEffect(() => { dispatch({ type: 'PLAY_TRACK', track: { id: -1, name: '来源歌曲', artist: 'Artist', source: 'meting-tencent', mediaRef: 'source-reference', url: 'https://x/1.mp3' } }) }, [dispatch])
      return <NowPlaying />
    }
    const { findByText, findByAltText } = render(<PlayerProvider><SourceHarness /></PlayerProvider>)
    expect(await findByText('来源歌词')).toBeInTheDocument()
    expect(await findByAltText('来源歌曲')).toHaveAttribute('src', 'https://img/cover.jpg?signature=preserved')
  })

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

  it('does not infer instrumental from an empty lyric result', async () => {
    vi.mocked(lyricNew).mockResolvedValueOnce({ lrc: { lyric: '' }, yrc: { lyric: '' } })
    const { findByText } = render(
      <PlayerProvider>
        <Harness />
      </PlayerProvider>,
    )
    expect(await findByText('原平台暂无歌词')).toBeInTheDocument()
  })

  it('preserves an explicit instrumental flag', async () => {
    vi.mocked(lyricNew).mockResolvedValueOnce({ nolyric: true })
    const ui = render(<PlayerProvider><Harness /></PlayerProvider>)
    expect(await ui.findByText('纯音乐，无歌词')).toBeInTheDocument()
  })

  it('rechecks timing after audio changes and rejects late lyrics without interrupting playback', async () => {
    const fallback = { provider: 'lrclib', implemented: false, eligible: false }
    vi.mocked(mediaLyrics).mockResolvedValueOnce({ lrc: { lyric: '[00:01]原歌词' }, lyricsSource: 'api-enhanced',
      lyrics: { status: 'available', timeline: 'trusted', reason: 'same_resource', fallback } })
    let late!: (value: Awaited<ReturnType<typeof mediaLyrics>>) => void
    vi.mocked(mediaLyrics).mockReturnValueOnce(new Promise(resolve => { late = resolve }))
    vi.mocked(mediaLyrics).mockResolvedValueOnce({ lrc: { lyric: '新歌纯文本' }, lyricsSource: 'meting-tencent',
      lyrics: { status: 'available', timeline: 'uncertain', reason: 'plain_text', fallback } })
    function Switching() {
      const { state, dispatch } = usePlayer()
      const original = { id: 'catalog', name: '原曲', artist: '原歌手', mediaRef: 'catalog', catalogRef: 'catalog',
        playbackRef: 'catalog', url: 'https://audio.test/original', picUrl: 'https://cover.test/image' }
      useEffect(() => { dispatch({ type: 'PLAY_TRACK', track: original }) }, [dispatch])
      return <><output data-testid="state">{JSON.stringify(state)}</output>
        <button onClick={() => dispatch({ type: 'PLAY_TRACK', track: { ...original, playbackRef: 'qq', url: 'https://audio.test/qq' } })}>换源</button>
        <button onClick={() => dispatch({ type: 'PLAY_TRACK', track: { ...original, id: 'next', mediaRef: 'next', catalogRef: 'next', playbackRef: 'next' } })}>切歌</button>
        <NowPlaying /></>
    }
    const ui = render(<PlayerProvider><Switching /></PlayerProvider>)
    await ui.findByText('原歌词')
    fireEvent.timeUpdate(ui.container.querySelector('audio')!, { target: { currentTime: 2 } })
    await waitFor(() => expect(ui.container.querySelector('.dm-lyric-line.is-active')).toHaveTextContent('原歌词'))
    fireEvent.click(ui.getByText('换源'))
    await ui.findByText('正在加载歌词…')
    expect(ui.queryByText('原歌词')).toBeNull()
    const calls = vi.mocked(mediaLyrics).mock.calls
    const oldSignal = calls[calls.length - 1]?.[2]
    expect(calls[calls.length - 1]?.slice(0, 2)).toEqual(['catalog', 'qq'])
    fireEvent.click(ui.getByText('切歌'))
    await ui.findByText('新歌纯文本')
    expect(oldSignal?.aborted).toBe(true)
    late({ lrc: { lyric: '[00:00]迟到旧词' }, lyrics: { status: 'available', timeline: 'trusted', reason: '', fallback } })
    await waitFor(() => expect(ui.queryByText('迟到旧词')).toBeNull())
    expect(ui.getByText('歌词时间轴未确认，静态显示')).toBeInTheDocument()
    expect(ui.container.querySelector('.dm-lyric-line.is-active')).toBeNull()
    expect(JSON.parse(ui.getByTestId('state').textContent || '{}').isPlaying).toBe(true)
  })

  it.each(['missing', 'unsupported', 'timeout', 'failed'] as const)('shows %s separately while audio plays', async status => {
    const hints = { missing: '原平台暂无歌词', unsupported: '原平台未提供歌词', timeout: '原平台歌词请求超时', failed: '原平台歌词暂时无法加载' }
    vi.mocked(mediaLyrics).mockResolvedValueOnce({ lyrics: { status, timeline: 'none', reason: status,
      fallback: { provider: 'lrclib', implemented: false, eligible: true } } })
    function Source() {
      const { state, dispatch } = usePlayer()
      useEffect(() => { dispatch({ type: 'PLAY_TRACK', track: { id: 'catalog', name: '原曲', artist: '原歌手',
        mediaRef: 'catalog', playbackRef: 'qq', url: 'https://audio.test/qq', picUrl: 'https://cover.test/image' } }) }, [dispatch])
      return <><output data-testid="state">{String(state.isPlaying)}</output><NowPlaying /></>
    }
    const ui = render(<PlayerProvider><Source /></PlayerProvider>)
    await ui.findByText(hints[status])
    expect(ui.getByTestId('state')).toHaveTextContent('true')
    expect(ui.queryByText(/LRCLIB/)).toBeNull()
  })
})
