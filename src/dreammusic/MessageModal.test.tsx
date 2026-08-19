import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { CurrentUserProvider } from './CurrentUserContext'
import MessageModal from './MessageModal'
import { sendMessage } from './api'

vi.mock('./api', () => ({
  sendMessage: vi.fn(),
  NcmError: class NcmError extends Error {},
}))

const user = {
  id: 1,
  username: 'tester',
  bound: true,
  bindInvalid: false,
  dreamPoints: 12,
  messageToday: 1,
}

beforeEach(() => {
  vi.mocked(sendMessage).mockReset()
})

describe('MessageModal', () => {
  it('sends a message and shows updated quota', async () => {
    vi.mocked(sendMessage).mockResolvedValue({
      points: 11,
      used: 2,
      remaining: 1,
      dailyLimit: 3,
      result: 'sent',
      detail: '',
    })
    const onClose = vi.fn()
    const onSent = vi.fn()
    const { getByLabelText, getByRole, findByText, getByText } = render(
      <CurrentUserProvider user={user}>
        <MessageModal onClose={onClose} onSent={onSent} />
      </CurrentUserProvider>,
    )

    fireEvent.change(getByLabelText('消息标题'), { target: { value: '提醒' } })
    fireEvent.change(getByLabelText('消息内容'), { target: { value: '晚点见' } })
    await act(async () => {
      fireEvent.click(getByRole('button', { name: '发送（1 梦点）' }))
    })

    expect(sendMessage).toHaveBeenCalledWith('提醒', '晚点见')
    expect(onSent).toHaveBeenCalled()
    expect(await findByText('已发送，消耗 1 梦点，当前余额 11')).toBeInTheDocument()
    expect(getByText('今日还可发送 1 次')).toBeInTheDocument()
  })

  it('disables sending when the daily quota is exhausted', () => {
    const { getByRole } = render(
      <CurrentUserProvider user={{ ...user, messageToday: 3 }}>
        <MessageModal onClose={vi.fn()} />
      </CurrentUserProvider>,
    )
    expect(getByRole('button', { name: '发送（1 梦点）' })).toBeDisabled()
  })
})
