import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppRoutes from '../AppRoutes'

// 避免 BindView 触发真实 QR fetch
vi.mock('../dreammusic/useQrLogin', () => ({
  useQrLogin: () => ({
    state: 'qrcode',
    qrimg: 'data:image/png;base64,AAAA',
    message: '请用网易云 App 扫码绑定',
  }),
}))

vi.mock('../dreammusic/api', () => ({
  me: vi.fn(),
  logout: vi.fn(async () => ({ ok: true })),
  getAnnouncements: vi.fn(async () => []),
  songUrlV1: vi.fn(),
  songUrlMatch: vi.fn(),
  songDetail: vi.fn(async () => ({ songs: [] })),
  reportStats: vi.fn(),
}))

import { me } from '../dreammusic/api'

describe('Routing — DM-01 + D4 auth gate', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(me).mockReset()
  })

  it('renders Landing at / (not the player shell)', () => {
    const { queryByTestId, getByRole } = render(
      <MemoryRouter initialEntries={['/']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(queryByTestId('dreammusic')).not.toBeInTheDocument()
    expect(getByRole('heading', { name: /IvyReverie/i })).toBeInTheDocument()
  })

  it('shows LoginView at /dreammusic when session missing', async () => {
    vi.mocked(me).mockRejectedValue(new Error('未登录'))
    const { findByTestId, queryByTestId } = render(
      <MemoryRouter initialEntries={['/dreammusic']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await findByTestId('dm-login')).toBeInTheDocument()
    expect(queryByTestId('dm-topbar')).not.toBeInTheDocument()
  })

  it('shows BindView when logged in but not bound', async () => {
    vi.mocked(me).mockResolvedValue({
      id: 1,
      username: 'tester',
      bound: false,
      bindInvalid: false,
    })
    const { findByTestId, queryByTestId } = render(
      <MemoryRouter initialEntries={['/dreammusic']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await findByTestId('dm-bind')).toBeInTheDocument()
    expect(queryByTestId('dm-topbar')).not.toBeInTheDocument()
  })

  it('shows player shell at /dreammusic when bound', async () => {
    vi.mocked(me).mockResolvedValue({
      id: 1,
      username: 'tester',
      bound: true,
      bindInvalid: false,
    })
    const { findByTestId, queryByTestId } = render(
      <MemoryRouter initialEntries={['/dreammusic']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    expect(await findByTestId('dm-topbar')).toBeInTheDocument()
    expect(queryByTestId('dm-login')).not.toBeInTheDocument()
    expect(queryByTestId('dm-bind')).not.toBeInTheDocument()
  })

  it('returns to LoginView when dm-unauthorized fires (session expired)', async () => {
    vi.mocked(me).mockResolvedValueOnce({
      id: 1,
      username: 'tester',
      bound: true,
      bindInvalid: false,
    })
    vi.mocked(me).mockRejectedValueOnce(new Error('未登录'))
    const { findByTestId, getByRole } = render(
      <MemoryRouter initialEntries={['/dreammusic']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    await findByTestId('dm-topbar')
    act(() => {
      window.dispatchEvent(new Event('dm-unauthorized'))
    })
    expect(await findByTestId('dm-login')).toBeInTheDocument()
    expect(getByRole('heading', { name: 'DreamMusic' })).toBeInTheDocument()
  })

  it('hamburger toggles left drawer (a11y/responsive)', async () => {
    vi.mocked(me).mockResolvedValue({
      id: 1,
      username: 'tester',
      bound: true,
      bindInvalid: false,
    })
    const { findByTestId, getByRole, getByTestId } = render(
      <MemoryRouter initialEntries={['/dreammusic']}>
        <AppRoutes />
      </MemoryRouter>,
    )
    await findByTestId('dm-topbar')
    const hamburger = getByRole('button', { name: '菜单' })
    expect(hamburger).toHaveAttribute('aria-expanded', 'false')
    expect(getByTestId('dm-left')).not.toHaveClass('is-open')
    act(() => {
      fireEvent.click(hamburger)
    })
    expect(hamburger).toHaveAttribute('aria-expanded', 'true')
    expect(getByTestId('dm-left')).toHaveClass('is-open')
  })
})
