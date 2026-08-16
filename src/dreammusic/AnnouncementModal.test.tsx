import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('./api', () => ({
  getAnnouncements: vi.fn(async () => [
    {
      id: 1,
      title: '系统升级公告',
      content: '今晚 23:00 升级',
      level: 'maintenance',
      status: 'published',
      createdBy: 'admin',
      createdAt: Date.now(),
      publishedAt: Date.now(),
      expiresAt: null,
    },
  ]),
  NcmError: class NcmError extends Error {},
}))

import AnnouncementModal from './AnnouncementModal'

describe('AnnouncementModal — T-08', () => {
  it('renders published announcements', async () => {
    const { findByText } = render(<AnnouncementModal onClose={vi.fn()} />)
    expect(await findByText('系统升级公告')).toBeInTheDocument()
    expect(await findByText('今晚 23:00 升级')).toBeInTheDocument()
  })
})
