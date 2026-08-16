import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

vi.mock('./api', () => ({
  getDownloadTasks: vi.fn(async () => [
    {
      id: 1,
      songId: 123,
      songName: '晴天',
      artist: '周杰伦',
      level: 'standard',
      status: 'ready',
      received: 100,
      total: 100,
      progress: 100,
      source: 'match:qq',
      fileName: '晴天 - 周杰伦.mp3',
      contentType: 'audio/mpeg',
      error: null,
      createdAt: Date.now(),
      completedAt: Date.now(),
      ready: true,
    },
  ]),
  deleteDownloadTask: vi.fn(),
  downloadTaskFileUrl: vi.fn((id: number) => `/downloads/${id}/file`),
  NcmError: class NcmError extends Error {},
}))

import DownloadManagerModal from './DownloadManagerModal'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DownloadManagerModal', () => {
  it('renders ready task with get-file link', async () => {
    const { findByText, getByRole } = render(<DownloadManagerModal onClose={vi.fn()} />)
    expect(await findByText('晴天')).toBeInTheDocument()
    expect(getByRole('link', { name: '获取文件' })).toHaveAttribute('href', '/downloads/1/file')
  })
})
