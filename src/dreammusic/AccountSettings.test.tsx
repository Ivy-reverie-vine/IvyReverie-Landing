import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { CurrentUserProvider } from './CurrentUserContext'

vi.mock('./api', () => ({
  getSessions: vi.fn(async () => []),
  getPointLogs: vi.fn(async () => []),
  changePassword: vi.fn(async () => ({ ok: true })),
  uploadAvatar: vi.fn(),
  revokeSession: vi.fn(),
  NcmError: class NcmError extends Error {},
}))

import { changePassword } from './api'
import AccountSettings from './AccountSettings'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AccountSettings — T-06/T-07', () => {
  it('submits password change and notifies parent', async () => {
    const onPasswordChanged = vi.fn()
    const { getByPlaceholderText, getByRole } = render(
      <CurrentUserProvider
        user={{ id: 1, username: 'tester', bound: true, bindInvalid: false }}
      >
        <AccountSettings
          onProfileChanged={vi.fn()}
          onPasswordChanged={onPasswordChanged}
        />
      </CurrentUserProvider>,
    )
    fireEvent.change(getByPlaceholderText('旧密码'), { target: { value: 'old123' } })
    fireEvent.change(getByPlaceholderText('新密码（至少 6 位）'), {
      target: { value: 'new123' },
    })
    fireEvent.change(getByPlaceholderText('确认新密码'), { target: { value: 'new123' } })
    await act(async () => {
      fireEvent.click(getByRole('button', { name: '修改密码' }))
    })
    expect(changePassword).toHaveBeenCalledWith('old123', 'new123')
    expect(onPasswordChanged).toHaveBeenCalled()
  })
})
