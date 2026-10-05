import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { PlayerProvider, usePlayer } from './PlayerContext'
import { recoverMediaUrl } from '../api'

vi.mock('../api', () => ({ recoverMediaUrl: vi.fn(), mediaUrl: vi.fn(), songUrlV1: vi.fn(), reportStats: vi.fn() }))
const original = { id: 'row', name: '目录歌曲', artist: '原歌手', mediaRef: 'catalog', catalogRef: 'catalog',
  playbackRef: 'qq', lyricsRef: 'catalog', playbackSource: 'meting-tencent', lyricsSource: 'api-enhanced',
  recoveryToken: 'receipt', url: 'https://audio.test/expired' }
const refreshed = { catalogRef: 'catalog', playbackRef: 'qq', lyricsRef: 'catalog', playbackSource: 'meting-tencent',
  recoveryToken: 'receipt', data: [{ url: 'https://audio.test/fresh' }],
  audioIntegrity: { status: 'full' as const, reason: 'controlled_full', catalogDurationMs: 90000, resourceDurationMs: 90000, evidence: ['controlled'] } }
function Harness() {
  const { state, dispatch, playbackError } = usePlayer()
  return <><button onClick={() => dispatch({ type: 'PLAY_TRACK', track: original })}>播放</button>
    <button onClick={() => dispatch({ type: 'PLAY_TRACK', track: { ...original, id: 'next', url: 'https://audio.test/next' } })}>切歌</button>
    <button onClick={() => dispatch({ type: 'PAUSE' })}>暂停</button>
    <output data-testid="state">{JSON.stringify(state)}</output><p>{playbackError}</p></>
}
beforeEach(() => {
  localStorage.clear(); vi.clearAllMocks()
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.mocked(recoverMediaUrl).mockResolvedValue(refreshed)
})
afterEach(() => { vi.restoreAllMocks() })
const mount = () => {
  const ui = render(<PlayerProvider><Harness /></PlayerProvider>)
  fireEvent.click(ui.getByText('播放'))
  return { ...ui, audio: ui.container.querySelector('audio')!, state: () => JSON.parse(ui.getByTestId('state').textContent!) }
}
describe('T13 Web recovery ownership', () => {
  it('refreshes exact audio, resumes position and keeps catalog/lyrics roles; duplicate errors coalesce', async () => {
    const ui = mount(); ui.audio.currentTime = 12
    let resolve!: (result: typeof refreshed) => void
    vi.mocked(recoverMediaUrl).mockReturnValueOnce(new Promise(done => { resolve = done }))
    fireEvent.error(ui.audio); fireEvent.error(ui.audio)
    expect(recoverMediaUrl).toHaveBeenCalledTimes(1)
    expect(recoverMediaUrl).toHaveBeenCalledWith('qq', 'receipt', expect.any(AbortSignal))
    resolve(refreshed)
    await waitFor(() => expect(ui.audio.src).toBe('https://audio.test/fresh'))
    fireEvent.canPlay(ui.audio); expect(ui.audio.currentTime).toBe(12)
    fireEvent.playing(ui.audio)
    expect(ui.state().queue[0]).toMatchObject({ ...original, url: refreshed.data[0].url, playbackRevision: 1 })
    expect(localStorage.getItem('dreammusic_player')).not.toContain('receipt')
  })
  it.each(['切歌', '暂停'])('%s aborts pending recovery and late completion cannot change selection', async action => {
    const ui = mount(); let resolve!: (result: typeof refreshed) => void
    vi.mocked(recoverMediaUrl).mockReturnValueOnce(new Promise(done => { resolve = done }))
    fireEvent.error(ui.audio); const signal = vi.mocked(recoverMediaUrl).mock.calls[0][2]
    fireEvent.click(ui.getByText(action)); expect(signal.aborted).toBe(true)
    resolve(refreshed); await new Promise(done => setTimeout(done, 0))
    expect(ui.state().queue[ui.state().currentIndex].url).not.toBe(refreshed.data[0].url)
  })
  it('rejects changed resource identity and terminates without automatic source replacement', async () => {
    vi.mocked(recoverMediaUrl).mockResolvedValueOnce({ ...refreshed, playbackRef: 'other-recording' })
    const ui = mount(); fireEvent.error(ui.audio)
    await ui.findByText('所选资源恢复失败，请重试或重新选择来源')
    expect(ui.state().isPlaying).toBe(false); expect(ui.state().queue[0].playbackRef).toBe('qq')
  })
  it('reloads a refreshed response even at the same URL', async () => {
    vi.mocked(recoverMediaUrl).mockResolvedValueOnce({ ...refreshed, data: [{ url: original.url }] })
    const ui = mount(); const loads = vi.mocked(HTMLMediaElement.prototype.load).mock.calls.length
    fireEvent.error(ui.audio)
    await waitFor(() => expect(HTMLMediaElement.prototype.load).toHaveBeenCalledTimes(loads + 1))
    fireEvent.playing(ui.audio)
  })
})
