const MEDIA_REF_VERSION = 1

function encode(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}

function decode(value) {
  try {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) return null
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'))
    if (parsed?.version !== MEDIA_REF_VERSION || typeof parsed.source !== 'string' ||
      typeof parsed.sourceId !== 'string' || !parsed.source.trim() || !parsed.sourceId.trim() ||
      parsed.kind !== 'song') return null
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

// T01: all three roles refer to the selected resource. mediaRef retains its old meaning.
export function singleSourceIdentity(mediaRef) {
  const parsed = parseMediaRef(mediaRef)
  if (!parsed) return {}
  return {
    catalogRef: mediaRef, playbackRef: mediaRef, lyricsRef: mediaRef,
    playbackSource: parsed.source, lyricsSource: parsed.source,
  }
}

function normalizeApiSong(raw) {
  const id = raw?.id
  if (id === undefined || raw?.name === undefined) return null
  const artists = Array.isArray(raw.ar) ? raw.ar : Array.isArray(raw.artists) ? raw.artists : []
  const album = raw.al || raw.album || {}
  const sourceId = String(id)
  return {
    mediaRef: createMediaRef({ source: 'api-enhanced', sourceId }),
    ...singleSourceIdentity(createMediaRef({ source: 'api-enhanced', sourceId })),
    source: 'api-enhanced',
    sourceId,
    legacyId: Number(id),
    title: String(raw.name),
    versionTags: [...(Array.isArray(raw.alia) ? raw.alia : []), ...(Array.isArray(raw.tns) ? raw.tns : []),
      ...(typeof raw.version === 'string' ? [raw.version] : [])].filter(value => typeof value === 'string' && value.trim()),
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
  const mediaRef = createMediaRef({ source, sourceId })
  return {
    ...raw,
    mediaRef,
    ...singleSourceIdentity(mediaRef),
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
      hasMore: body?.result?.more === true || body?.hasMore === true,
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
      data: data.length > 0 ? [{ ...data[0], mediaRef, ...singleSourceIdentity(mediaRef) }] : [],
      mediaRef,
      audioIntegrity: body?.audioIntegrity,
      ...singleSourceIdentity(mediaRef),
    }
  }
  if (path === 'lyric/new') {
    return { ...body, mediaRef, ...singleSourceIdentity(mediaRef) }
  }
  return body
}
