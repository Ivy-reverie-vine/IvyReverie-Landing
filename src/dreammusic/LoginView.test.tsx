import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'

vi.mock('./api', () => ({
  login: vi.fn(),
  NcmError: class NcmError extends Error {
    code: string
    constructor(m: string, c: string) {
      super(m)
      this.code = c
    }
  },
}))

import { login, NcmError } from './api'
import LoginView from './LoginView'

describe('LoginView — D4 账户登录', () => {
  it('renders account login form', () => {
    const { getByTestId, getByLabelText } = render(
      <LoginView onLogin={vi.fn()} onGoRegister={vi.fn()} />,
    )
    expect(getByTestId('dm-login')).toBeInTheDocument()
    expect(getByLabelText('用户名')).toBeInTheDocument()
    expect(getByLabelText('密码')).toBeInTheDocument()
  })

  it('submits and calls onLogin on success', async () => {
    vi.mocked(login).mockResolvedValue({
      id: 1,
      username: 'tester',
      bound: false,
      bindInvalid: false,
    })
    const onLogin = vi.fn()
    const { getByLabelText, getByRole } = render(
      <LoginView onLogin={onLogin} onGoRegister={vi.fn()} />,
    )
    fireEvent.change(getByLabelText('用户名'), {
      target: { value: 'tester' },
    })
    fireEvent.change(getByLabelText('密码'), {
      target: { value: 'secret123' },
    })
    await act(async () => {
      fireEvent.click(getByRole('button', { name: '登录' }))
    })
    expect(login).toHaveBeenCalledWith('tester', 'secret123')
    expect(onLogin).toHaveBeenCalled()
  })

  it('shows error and does not call onLogin on failure', async () => {
    vi.mocked(login).mockRejectedValue(new NcmError('用户名或密码错误', 'AUTH'))
    const onLogin = vi.fn()
    const { getByLabelText, getByRole, findByRole } = render(
      <LoginView onLogin={onLogin} onGoRegister={vi.fn()} />,
    )
    fireEvent.change(getByLabelText('用户名'), {
      target: { value: 'tester' },
    })
    fireEvent.change(getByLabelText('密码'), {
      target: { value: 'wrongpass123' },
    })
    await act(async () => {
      fireEvent.click(getByRole('button', { name: '登录' }))
    })
    expect(await findByRole('alert')).toHaveTextContent('用户名或密码错误')
    expect(onLogin).not.toHaveBeenCalled()
  })

  it('goes to register view', () => {
    const onGoRegister = vi.fn()
    const { getByRole } = render(
      <LoginView onLogin={vi.fn()} onGoRegister={onGoRegister} />,
    )
    fireEvent.click(getByRole('button', { name: /注册/ }))
    expect(onGoRegister).toHaveBeenCalled()
  })
})
