import type { SongUrlResult } from './api'

export function fullAudioUrl(result: SongUrlResult): string {
  const url = result.data?.[0]?.url
  if (!url || result.audioIntegrity?.status === 'unavailable') throw new Error('当前来源音频不可用，请重试或切换音源')
  if (result.audioIntegrity?.status === 'preview') throw new Error('当前来源只提供试听片段，请重试或切换音源')
  if (result.audioIntegrity?.status !== 'full') throw new Error('暂时无法确认音频是否完整，请重试或切换音源')
  return url
}
