import { describe, it, expect, beforeEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { useEffect } from 'react'
import { PlayerProvider, usePlayer } from './PlayerContext'
import Controls from './Controls'

beforeEach(() => {
  localStorage.clear()
})

/** 测试壳：挂载后塞入一首曲目让 Controls 可交互（只 dispatch 一次） */
function Harness() {
  const { dispatch } = usePlayer()
  useEffect(() => {
    dispatch({
      type: 'PLAY_TRACK',
      track: { id: 1, name: '测试曲', artist: '测试', url: 'https://e/1.mp3' },
    })
  }, [dispatch])
  return <Controls />
}

describe('Controls — DM-04', () => {
  it('renders control buttons, mode & level labels', () => {
    const { getByRole } = render(
      <PlayerProvider>
        <Controls />
      </PlayerProvider>,
    )
    expect(getByRole('button', { name: '上一首' })).toBeInTheDocument()
    expect(getByRole('button', { name: '下一首' })).toBeInTheDocument()
    expect(getByRole('button', { name: '播放模式 顺序' })).toBeInTheDocument()
    const select = getByRole('combobox', { name: '音质' }) as HTMLSelectElement
    expect(select.value).toBe('exhigh')
    expect(getByRole('button', { name: '下载歌曲' })).toBeInTheDocument()
  })

  it('changes quality via select in one action', async () => {
    const { findByRole, getByRole } = render(
      <PlayerProvider>
        <Harness />
      </PlayerProvider>,
    )
    const select = (await findByRole('combobox', { name: '音质' })) as HTMLSelectElement
    act(() => {
      fireEvent.change(select, { target: { value: 'lossless' } })
    })
    expect((getByRole('combobox', { name: '音质' }) as HTMLSelectElement).value).toBe(
      'lossless',
    )
  })

  it('toggles play/pause label on click', async () => {
    const { findByRole, getByRole } = render(
      <PlayerProvider>
        <Harness />
      </PlayerProvider>,
    )
    // PLAY_TRACK 后 isPlaying=true → 按钮为「暂停」
    const pauseBtn = await findByRole('button', { name: '暂停' })
    act(() => {
      fireEvent.click(pauseBtn)
    })
    // 点击 → TOGGLE → 暂停 → 按钮变「播放」
    expect(getByRole('button', { name: '播放' })).toBeInTheDocument()
  })

  it('disables transport buttons when no track', () => {
    const { getByRole } = render(
      <PlayerProvider>
        <Controls />
      </PlayerProvider>,
    )
    expect(getByRole('button', { name: '上一首' })).toBeDisabled()
    expect(getByRole('button', { name: '播放' })).toBeDisabled()
  })
})
