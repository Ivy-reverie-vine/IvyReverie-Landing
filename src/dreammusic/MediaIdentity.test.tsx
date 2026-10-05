import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, fireEvent, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { PlayerProvider, usePlayer } from './player/PlayerContext'
import NowPlaying from './NowPlaying'
import SearchOverlay from './SearchOverlay'

// UI/state evidence; HTTP + real orchestration and ArkTS client are tested separately.
vi.mock('./api', () => ({
  mediaSearch: vi.fn(async () => ({ data: [{
    mediaRef: 'catalog-123', catalogRef: 'catalog-123', playbackRef: 'catalog-123', lyricsRef: 'catalog-123',
    source: 'api-enhanced', sourceId: '123', legacyId: 123, title: '目录歌曲', artists: ['原歌手'],
    album: { pictureUrl: 'https://cover.test/catalog.jpg' },
  }] })),
  mediaUrl: vi.fn(async (ref: string) => ({ audioIntegrity: { status: 'full' as const, reason: 'controlled_full', catalogDurationMs: 90000, resourceDurationMs: 90000, evidence: ['controlled'] }, data: [{ url: 'https://audio.test/123.mp3' }],
    catalogRef: ref, playbackRef: ref, lyricsRef: ref, playbackSource: 'api-enhanced', lyricsSource: 'api-enhanced' })),
  mediaLyrics: vi.fn(async () => ({ lrc: { lyric: '[00:01]目录歌词' }, lyricsRef: 'catalog-123', lyricsSource: 'api-enhanced' })),
  mediaDetail: vi.fn(async () => ({ data: [{ album: { pictureUrl: 'https://cover.test/late.jpg' } }] })),
  lyricNew: vi.fn(async () => ({ lrc: { lyric: '[00:01]新歌歌词' } })),
  songDetail: vi.fn(), songUrlV1: vi.fn(), songUrlMatch: vi.fn(), reportStats: vi.fn(),
  NcmError: class NcmError extends Error {},
}))
import { mediaDetail, mediaLyrics, mediaUrl } from './api'
beforeEach(() => { localStorage.clear(); vi.clearAllMocks() })

function SearchHarness() {
  const { state } = usePlayer()
  return <><output data-testid="public-state">{JSON.stringify(state)}</output>
    <SearchOverlay onClose={() => {}} /><NowPlaying /></>
}
describe('T01 Web public playback state', () => {
  it('consumes role identities and keeps the selected title/artist/cover through playback and lyrics', async () => {
    const ui = render(<PlayerProvider><SearchHarness /></PlayerProvider>)
    fireEvent.change(ui.getByLabelText('搜索关键词'), { target: { value: '目录' } })
    fireEvent.click(await ui.findByText('目录歌曲'))
    await ui.findByText('目录歌词')
    await ui.findByText('音频来源：网易云')
    const state = JSON.parse(ui.getByTestId('public-state').textContent || '{}')
    const track = state.queue[state.currentIndex]
    expect(state.isPlaying).toBe(true)
    expect(track).toMatchObject({ name: '目录歌曲', artist: '原歌手', picUrl: 'https://cover.test/catalog.jpg',
      catalogRef: 'catalog-123', playbackRef: 'catalog-123', lyricsRef: 'catalog-123',
      playbackSource: 'api-enhanced', lyricsSource: 'api-enhanced' })
    expect(ui.getByAltText('目录歌曲')).toHaveAttribute('src', 'https://cover.test/catalog.jpg')
    expect(ui.container.querySelector('audio')).toHaveAttribute('src', 'https://audio.test/123.mp3')
    expect(mediaDetail).not.toHaveBeenCalled()
    expect(mediaLyrics).toHaveBeenCalledWith('catalog-123')
  })

  it('resolves restored identity fields and retains them in public queue state', async () => {
    localStorage.setItem('dreammusic_player', JSON.stringify({ queue: [{ id: 'catalog-123',
      mediaRef: 'catalog-123', catalogRef: 'catalog-123', playbackRef: 'catalog-123', lyricsRef: 'catalog-123',
      source: 'api-enhanced', name: '目录歌曲', artist: '原歌手', picUrl: 'https://cover.test/catalog.jpg' }], currentIndex: 0 }))
    const ui = render(<PlayerProvider><SearchHarness /></PlayerProvider>)
    await ui.findByText('目录歌词')
    await ui.findByText('音频来源：网易云')
    await waitFor(() => expect(ui.container.querySelector('audio')).toHaveAttribute('src', 'https://audio.test/123.mp3'))
    const state = JSON.parse(ui.getByTestId('public-state').textContent || '{}')
    expect(state.queue[0]).toMatchObject({ catalogRef: 'catalog-123', playbackRef: 'catalog-123',
      lyricsRef: 'catalog-123', playbackSource: 'api-enhanced' })
    expect(mediaUrl).toHaveBeenCalledWith('catalog-123', 'exhigh')
  })

  it('late catalog detail and lyrics cannot replace a new selection', async () => {
    let finishDetail!: (value: Awaited<ReturnType<typeof mediaDetail>>) => void
    let finishLyrics!: (value: Awaited<ReturnType<typeof mediaLyrics>>) => void
    vi.mocked(mediaDetail).mockReturnValueOnce(new Promise(resolve => { finishDetail = resolve }))
    vi.mocked(mediaLyrics).mockReturnValueOnce(new Promise(resolve => { finishLyrics = resolve }))
    function SwitchingHarness() {
      const { state, dispatch } = usePlayer()
      useEffect(() => { dispatch({ type: 'PLAY_TRACK', track: { id: 'catalog-123', name: '目录歌曲', artist: '原歌手',
        mediaRef: 'catalog-123', catalogRef: 'catalog-123', lyricsRef: 'catalog-123', url: 'https://audio.test/old' } }) }, [dispatch])
      return <><output data-testid="public-state">{JSON.stringify(state)}</output>
        <button onClick={() => dispatch({ type: 'PLAY_TRACK', track: { id: 7, name: '新目录', artist: '新歌手',
          picUrl: 'https://cover.test/new.jpg', url: 'https://audio.test/new' } })}>选新歌</button><NowPlaying /></>
    }
    const ui = render(<PlayerProvider><SwitchingHarness /></PlayerProvider>)
    await waitFor(() => expect(mediaDetail).toHaveBeenCalledWith('catalog-123'))
    fireEvent.click(ui.getByText('选新歌'))
    await ui.findByText('新歌歌词')
    finishDetail({ data: [{ mediaRef: 'catalog-123', source: 'api-enhanced', sourceId: '123',
      title: '迟到旧名', artists: ['旧歌手'], album: { pictureUrl: 'https://cover.test/late.jpg' } }] })
    finishLyrics({ lrc: { lyric: '[00:01]旧歌词' } })
    await waitFor(() => expect(ui.getByAltText('新目录')).toHaveAttribute('src', 'https://cover.test/new.jpg?param=600y600'))
    expect(ui.queryByText('旧歌词')).toBeNull()
    const state = JSON.parse(ui.getByTestId('public-state').textContent || '{}')
    expect(state.queue[state.currentIndex]).toMatchObject({ name: '新目录', artist: '新歌手' })
  })
})
