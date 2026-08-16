import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { CurrentUserProvider } from './CurrentUserContext'

vi.mock('./api', () => ({
  redeemCode: vi.fn(async () => ({ points: 40, redeemedPoints: 10, code: 'DM-TEST' })),
  generateRedeemCodes: vi.fn(async () => ({ codes: ['DM-NEW'] })),
  getRedeemCodes: vi.fn(async () => []),
  NcmError: class NcmError extends Error {},
}))

import { redeemCode } from './api'
import RedeemModal from './RedeemModal'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RedeemModal — 兑换码', () => {
  it('redeems a code and shows earned points', async () => {
    const { getByLabelText, getByRole, findByText } = render(
      <CurrentUserProvider
        user={{ id: 1, username: 'tester', role: 'user', bound: true, bindInvalid: false }}
      >
        <RedeemModal onClose={vi.fn()} />
      </CurrentUserProvider>,
    )
    fireEvent.change(getByLabelText('兑换码输入'), { target: { value: 'DM-TEST' } })
    await act(async () => {
      fireEvent.click(getByRole('button', { name: '兑换' }))
    })
    expect(redeemCode).toHaveBeenCalledWith('DM-TEST')
    expect(await findByText(/兑换成功/)).toBeInTheDocument()
  })
})
