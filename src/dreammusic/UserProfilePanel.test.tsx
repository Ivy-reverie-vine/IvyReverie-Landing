import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'

vi.mock('./api', () => ({
  getProfile: vi.fn(),
  updateSignature: vi.fn(),
  checkin: vi.fn(),
  getUsers: vi.fn(),
  adminUserAction: vi.fn(),
  adminAdjustPoints: vi.fn(),
  adminResetPassword: vi.fn(),
  getInviteCode: vi.fn(async () => ({ code: 'testcode' })),
  updateInviteCode: vi.fn(async () => ({ code: 'testcode' })),
  getAuditLogs: vi.fn(async () => []),
  getSessions: vi.fn(async () => []),
  revokeSession: vi.fn(async () => ({ ok: true })),
  getPointLogs: vi.fn(async () => []),
  changePassword: vi.fn(async () => ({ ok: true })),
  uploadAvatar: vi.fn(),
  getAnnouncements: vi.fn(async () => []),
  NcmError: class NcmError extends Error {
    code: string
    constructor(m: string, c: string) {
      super(m)
      this.code = c
    }
  },
}))

import { getProfile, checkin } from './api'
import UserProfilePanel from './UserProfilePanel'

const me = {
  id: 1,
  username: 'tester',
  role: 'admin',
  status: 'active',
  bound: true,
  bindInvalid: false,
  avatarUrl: null,
  signature: '梦里啥都有',
  playSeconds: 3661,
  playedSongCount: 42,
  dreamPoints: 130,
  lastCheckinDate: '2026-08-15',
}

beforeEach(() => {
  vi.mocked(getProfile).mockResolvedValue(me as never)
  vi.mocked(checkin).mockResolvedValue({ points: 140, alreadyChecked: false })
})

describe('UserProfilePanel — D5', () => {
  it('renders profile info and stats', async () => {
    const { findByTestId, findByText, getByText } = render(
      <UserProfilePanel onClose={vi.fn()} />,
    )
    await findByTestId('dm-profile')
    expect(getByText('tester')).toBeInTheDocument()
    expect(getByText('管理员')).toBeInTheDocument()
    expect(getByText('「梦里啥都有」')).toBeInTheDocument()
    expect(getByText('130')).toBeInTheDocument()
    expect(getByText('1 小时 1 分')).toBeInTheDocument()
    expect(getByText('42')).toBeInTheDocument()
    expect(await findByText('展开用户管理')).toBeInTheDocument()
  })

  it('checkin adds points and disables button', async () => {
    const { findByText, getByRole } = render(
      <UserProfilePanel onClose={vi.fn()} />,
    )
    await findByText('签到 +10 梦点')
    await act(async () => {
      fireEvent.click(getByRole('button', { name: /签到/ }))
    })
    expect(checkin).toHaveBeenCalled()
    expect(getByRole('button', { name: /今日已签到/ })).toBeDisabled()
  })
})
