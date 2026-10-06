import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { compareRecordingFingerprints } from './audioRecording.js'

const MAX_BYTES = 12 * 1024 * 1024

async function command(binary, args, signal) {
  signal.throwIfAborted()
  return new Promise((resolveCommand, reject) => {
    const child = spawn(binary, args, { windowsHide: true, signal, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', errors = '', failure
    child.stdout.on('data', bytes => { output += bytes; if (output.length > 128 * 1024) child.kill() })
    child.stderr.on('data', bytes => { errors += bytes; if (errors.length > 8192) child.kill() })
    child.once('error', error => { failure = error })
    child.once('close', code => failure ? reject(failure) : resolveCommand({ code, output, errors }))
  })
}

async function fingerprint(file, signal, binary) {
  signal.throwIfAborted()
  return new Promise((finish, reject) => {
    const child = spawn(binary, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', file,
      '-map', '0:a:0', '-f', 'chromaprint', '-algorithm', '1', '-fp_format', 'raw', 'pipe:1'],
    { windowsHide: true, signal, stdio: ['ignore', 'pipe', 'pipe'] })
    const chunks = []; let bytes = 0, failed = false, failure
    child.stdout.on('data', chunk => { bytes += chunk.length; chunks.push(chunk); if (bytes > 128 * 1024) { failed = true; child.kill() } })
    child.stderr.on('data', () => { failed = true })
    child.once('error', error => { failure = error })
    child.once('close', code => {
      if (failure) { reject(failure); return }
      const raw = Buffer.concat(chunks)
      finish(code === 0 && !failed && raw.length % 4 === 0
        ? Array.from({ length: raw.length / 4 }, (_, index) => raw.readUInt32LE(index * 4)) : [])
    })
  })
}

async function decodedDuration(file, signal, binary) {
  signal.throwIfAborted()
  return new Promise((finish, reject) => {
    const child = spawn(binary, ['-v', 'error', '-xerror', '-protocol_whitelist', 'file,pipe', '-i', file,
      '-map', '0:a:0', '-ac', '1', '-ar', '8000', '-f', 's16le', 'pipe:1'],
    { windowsHide: true, signal, stdio: ['ignore', 'pipe', 'pipe'] })
    let bytes = 0, failed = false, failure
    child.stdout.on('data', chunk => { bytes += chunk.length; if (bytes > 15 * 60 * 8000 * 2) { failed = true; child.kill() } })
    child.stderr.on('data', () => { failed = true })
    child.once('error', error => { failure = error })
    child.once('close', code => failure ? reject(failure) : finish(code === 0 && !failed && bytes > 0 ? bytes / 16 : 0))
  })
}

// A complete transfer and actual AAC decoding provide evidence independent of
// a platform's optional trial marker. Never infer full from Range or metadata alone.
export async function inspectCompleteAac({ url, headers, fetchImpl, signal, reference, ffmpeg = 'ffmpeg', ffprobe = 'ffprobe' }) {
  let directory, reader
  const began = Date.now()
  try {
    signal.throwIfAborted()
    const response = await fetchImpl(url, { headers, signal })
    reader = response.body?.getReader()
    const length = Number(response.headers.get('content-length')) || 0
    const range = /^bytes 0-(\d+)\/(\d+|\*)$/.exec(response.headers.get('content-range') || '')
    const completeRange = [200, 206].includes(response.status) && range && (range[2] === '*' || Number(range[1]) + 1 === Number(range[2]))
    if (!reader || !((response.status === 200 && !response.headers.has('content-range')) || completeRange)) return { decoded: false, reason: 'complete_get_required' }
    if (length > MAX_BYTES) return { decoded: false, reason: 'media_size_limit' }
    const chunks = []; let bytes = 0
    while (true) {
      signal.throwIfAborted()
      const part = await reader.read()
      if (part.done) break
      bytes += part.value.length
      if (bytes > MAX_BYTES) return { decoded: false, reason: 'media_size_limit' }
      chunks.push(Buffer.from(part.value))
    }
    if (!bytes || (length && bytes !== length) || (completeRange && bytes !== Number(range[1]) + 1)) return { decoded: false, reason: 'incomplete_media_transfer' }
    const media = Buffer.concat(chunks)
    directory = await mkdtemp(join(tmpdir(), 'nightdream-media-inspection-'))
    const file = join(directory, 'audio.m4a')
    await writeFile(file, media)
    const probe = await command(ffprobe, ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries',
      'format=format_name:stream=codec_name,codec_type', '-of', 'json', file], signal)
    if (probe.code !== 0 || probe.errors) return { decoded: false, reason: 'media_probe_failed' }
    const metadata = JSON.parse(probe.output)
    if (!metadata.format?.format_name?.split(',').includes('mp4') || metadata.streams?.length !== 1 ||
      metadata.streams[0].codec_type !== 'audio' || metadata.streams[0].codec_name !== 'aac') {
      return { decoded: false, reason: 'unsupported_media_stream' }
    }
    // Count actual decoded PCM samples, not declared container duration or the
    // last timestamp (gaps in timestamps must not turn a short clip into full).
    const durationMs = await decodedDuration(file, signal, ffmpeg)
    if (!durationMs) return { decoded: false, reason: 'complete_decode_failed' }
    const sha256 = createHash('sha256').update(media).digest('hex')
    let audioMatch
    if (reference?.url && Number.isFinite(reference.startSeconds) && reference.durationMs >= 20000 && reference.durationMs <= 60000) {
      const response = await fetchImpl(reference.url, { signal, headers: { 'User-Agent': 'Mozilla/5.0' } })
      const sampleReader = response.body?.getReader()
      try {
        if (!response.ok || !sampleReader) throw new Error('reference unavailable')
        const chunks = []; let length = 0
        while (true) {
          signal.throwIfAborted()
          const part = await sampleReader.read(); if (part.done) break
          length += part.value.length; if (length > 2 * 1024 * 1024) throw new Error('reference size limit')
          chunks.push(Buffer.from(part.value))
        }
        const sample = Buffer.concat(chunks), referenceFile = join(directory, 'reference.audio')
        await writeFile(referenceFile, sample)
        const compared = compareRecordingFingerprints(await fingerprint(referenceFile, signal, ffmpeg),
          await fingerprint(file, signal, ffmpeg), reference.startSeconds)
        audioMatch = { ...compared, catalogRef: reference.catalogRef, resourceSha256: sha256,
          referenceSha256: createHash('sha256').update(sample).digest('hex') }
      } catch { audioMatch = { matched: false, reason: 'reference_audio_unavailable' } }
      finally { await sampleReader?.cancel().catch(() => {}) }
    }
    return { decoded: true, durationMs, bytes, sha256, ...(audioMatch ? { audioMatch } : {}),
      elapsedMs: Date.now() - began, policy: 'complete-aac-decode-v1' }
  } catch (error) {
    return { decoded: false, reason: signal.aborted ? 'inspection_cancelled'
      : error.code === 'ENOENT' ? 'inspection_engine_unavailable' : 'media_inspection_failed' }
  } finally {
    await reader?.cancel().catch(() => {})
    if (directory) {
      const owned = resolve(directory)
      if (dirname(owned) !== resolve(tmpdir()) || !owned.startsWith(join(resolve(tmpdir()), 'nightdream-media-inspection-'))) throw new Error('Unexpected media cleanup path')
      await rm(owned, { recursive: true, force: true })
    }
  }
}
