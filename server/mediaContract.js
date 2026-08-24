const MEDIA_REF_VERSION = 1

function encode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decode(value) {
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'))
    if (parsed?.version !== MEDIA_REF_VERSION || typeof parsed.source !== 'string' ||
      typeof parsed.sourceId !== 'string' || parsed.kind !== 'song') return null
    return parsed
  } catch {
    return null
  }
}

export function createMediaRef({ source, sourceId, kind = 'song' }) {
  return encode({ version: MEDIA_REF_VERSION, source: String(source), sourceId: String(sourceId), kind })
}

export function parseMediaRef(value) {
  return decode(value)
}

function normalizeApiSong(raw) {
  const id = raw?.id
  if (id === undefined || raw?.name === undefined) return null
  const artists = Array.isArray(raw.ar) ? raw.ar : Array.isArray(raw.artists) ? raw.artists : []
  const album = raw.al || raw.album || {}
  const sourceId = String(id)
  return {
    mediaRef: createMediaRef({ source: 'api-enhanced', sourceId }),
    source: 'api-enhanced',
    sourceId,
    legacyId: Number(id),
    title: String(raw.name),
    artists: artists.map((artist) => String(artist?.name || '')).filter(Boolean),
    album: {
      name: String(album.name || ''),
      pictureUrl: String(album.picUrl || ''),
    },
    durationMs: Number(raw.dt || 0),
  }
}

function normalizeInternalSong(raw) {
  if (!raw || typeof raw !== 'object' || raw.sourceId === undefined) return null
  const source = String(raw.source || '')
  const sourceId = String(raw.sourceId)
  const artists = Array.isArray(raw.artists) ? raw.artists : raw.artist ? [raw.artist] : []
  const album = raw.album || {}
  return {
    ...raw,
    mediaRef: raw.mediaRef || createMediaRef({ source, sourceId }),
    source,
    sourceId,
    title: String(raw.title || raw.name || ''),
    artists: artists.map((artist) => String(artist)).filter(Boolean),
    album: {
      name: String(album.name || ''),
      pictureUrl: String(album.pictureUrl || album.picUrl || ''),
    },
    durationMs: Number(raw.durationMs || 0),
  }
}

export function toMediaV2Body(path, body, mediaRef = '') {
  if (path === 'search') {
    const rawSongs = Array.isArray(body?.result?.songs)
      ? body.result.songs.map(normalizeApiSong)
      : Array.isArray(body?.data) ? body.data.map(normalizeInternalSong) : []
    return {
      code: body?.code === undefined ? 200 : body.code,
      data: rawSongs.filter(Boolean),
      hasMore: body?.result?.more === true,
    }
  }
  if (path === 'song/detail') {
    const rawSongs = Array.isArray(body?.songs)
      ? body.songs.map((song) => normalizeApiSong({
          ...song,
          id: song.id || parseMediaRef(mediaRef)?.sourceId,
          name: song.name || song.al?.name || song.album?.name || '',
        }))
      : Array.isArray(body?.data) ? body.data.map(normalizeInternalSong) : []
    return { code: body?.code === undefined ? 200 : body.code, data: rawSongs.filter(Boolean) }
  }
  if (path === 'song/url/v1') {
    const data = Array.isArray(body?.data) ? body.data : []
    return {
      code: body?.code === undefined ? 200 : body.code,
      data: data.length > 0 ? [{ ...data[0], mediaRef }] : [],
      mediaRef,
    }
  }
  if (path === 'lyric/new') {
    return { ...body, mediaRef }
  }
  return body
}
