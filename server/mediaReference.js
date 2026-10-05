import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

function sign(secret, value) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

export class MediaReferenceStore {
  constructor({ secret = randomBytes(32).toString('hex'), ttlMs = 30000, now = () => Date.now() } = {}) {
    this.secret = secret
    this.ttlMs = Math.max(1000, Number(ttlMs || 30000))
    this.now = now
    this.references = new Map()
  }

  issue({ userId, upstreamUrl, headers = {} }) {
    const parsed = new URL(upstreamUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('media reference requires an HTTP(S) URL')
    }
    const id = randomBytes(18).toString('base64url')
    const expiresAt = this.now() + this.ttlMs
    const owner = String(userId)
    const signed = `${id}.${owner}.${expiresAt}`
    const token = `${signed}.${sign(this.secret, signed)}`
    // Only adapter-provided public transport headers. Never forward account credentials.
    const transportHeaders = Object.fromEntries(Object.entries(headers)
      .filter(([name, value]) => ['referer', 'user-agent'].includes(name.toLowerCase()) && typeof value === 'string'))
    this.references.set(id, { userId: owner, upstreamUrl, expiresAt, headers: transportHeaders })
    return token
  }

  resolve(token) {
    const parts = String(token || '').split('.')
    if (parts.length !== 4) return null
    const [id, owner, expiresAtText, signature] = parts
    const signed = `${id}.${owner}.${expiresAtText}`
    const expected = sign(this.secret, signed)
    if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) {
      return null
    }
    const reference = this.references.get(id)
    if (!reference || reference.userId !== owner || reference.expiresAt <= this.now()) {
      this.references.delete(id)
      return null
    }
    return { ...reference, headers: { ...reference.headers } }
  }

  clear() {
    this.references.clear()
  }
}
