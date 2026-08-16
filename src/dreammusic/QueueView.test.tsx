import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { PlayerProvider, usePlayer } from './player/PlayerContext'
import QueueView from './QueueView'

vi.mock('./api', () => ({
  songUrlV1: vi.fn(),
  songUrlMatch: vi.fn(),
  songDetail: vi.fn(async () => ({ songs: [] })),
  reportStats: vi.fn(),
}))

const t1 = { id: 1, name: '歌A', artist: '甲' }
const t2 = { id: 2, name: '歌B', artist: '乙' }

beforeEach(() => {
  localStorage.clear()
})

/** 壳：入队两首并播放第一首 */
function Harness() {
  const { dispatch } = usePlayer()
  useEffect(() => {
    dispatch({ type: 'PLAY_TRACK', track: t1 })
    dispatch({ type: 'ADD_TO_QUEUE', track: t2 })
  }, [dispatch])
  return <QueueView />
}

describe('QueueView — DM-06', () => {
  it('renders queue with current track highlighted', async () => {
    const { findByText } = render(
      <PlayerProvider>
        <Harness />
      </PlayerProvider>,
    )
    expect(await findByText('歌A')).toBeInTheDocument()
    expect(await findByText('歌B')).toBeInTheDocument()
    // 当前曲 t1 高亮
    const a = await findByText('歌A')
    expect(a.closest('.dm-queue-item')).toHaveClass('is-current')
  })

  it('reorders queue with move buttons and keeps current highlight', async () => {
    const { findByLabelText, getByLabelText, container } = render(
      <PlayerProvider>
        <Harness />
      </PlayerProvider>,
    )
    await findByLabelText('删除 歌A')
    act(() => {
      fireEvent.click(getByLabelText('下移 歌A'))
    })
    await waitFor(() => {
      const names = [...container.querySelectorAll('.dm-queue-name')].map(
        (el) => el.textContent,
      )
      expect(names).toEqual(['歌B', '歌A'])
    })
    // 当前曲 t1 跟随到 index 1
    const b = [...container.querySelectorAll('.dm-queue-item')].find((el) =>
      el.textContent?.includes('歌A'),
    )
    expect(b).toHaveClass('is-current')
  })

  it('deletes a track and clears queue', async () => {
    const { findByText, getByLabelText, findByTestId } = render(
      <PlayerProvider>
        <Harness />
      </PlayerProvider>,
    )
    await findByText('歌A')
    act(() => {
      fireEvent.click(getByLabelText('删除 歌B'))
    })
    // 删后剩 1 首
    expect(getByLabelText('删除 歌A')).toBeInTheDocument()
    act(() => {
      fireEvent.click(getByLabelText('删除 歌A'))
    })
    // 全删 → 空态
    expect(await findByTestId('dm-queue-empty')).toBeInTheDocument()
  })
})
