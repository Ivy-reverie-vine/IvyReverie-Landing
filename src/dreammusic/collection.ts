import type { Track } from './player/reducer'

/** 兼容 ar/artists、al/album 两种字段形态 */
export interface CollectionSong {
  id: number
  name: string
  ar?: { name: string }[]
  artists?: { name: string }[]
  al?: { name: string; picUrl?: string }
  album?: { name: string; picUrl?: string }
}

export function collectionToTrack(s: CollectionSong): Track {
  const artists = s.ar || s.artists || []
  const album = s.al || s.album
  return {
    id: s.id,
    name: s.name,
    artist: artists.map((a) => a.name).join(' / ') || '未知',
    album: album?.name,
    picUrl: album?.picUrl,
  }
}
