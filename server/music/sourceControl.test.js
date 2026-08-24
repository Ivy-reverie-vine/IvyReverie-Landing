// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import express from 'express'
import { createMusicSourceControlRouter } from './sourceControl.js'

const user = { id: 1, role: 'admin', status: 'active' }
const auth = { currentUser: () => user }
const statuses = [{ id: 'audius', enabled: true, priority: 30 }]
const orchestrator = {
  sourceStatuses: () => statuses,
  setSourceEnabled: (id, enabled) => id === 'audius' ? { id, enabled } : null,
  setSourcePriority: (id, priority) => id === 'audius' ? { id, priority: Number(priority) } : null,
  resetSourceCircuit: (id) => id === 'audius' ? { id, reset: true } : null,
}
const app = express()
app.use(express.json())
app.use('/music-sources', createMusicSourceControlRouter({ orchestrator, auth }))
let server
let base

beforeAll(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve)
  })
  base = `http://127.0.0.1:${server.address().port}/music-sources`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('music source control router', () => {
  it('exposes status and supports immediate source rollback', async () => {
    const statusResponse = await fetch(base)
    expect(statusResponse.status).toBe(200)
    expect((await statusResponse.json()).data[0].id).toBe('audius')

    const response = await fetch(`${base}/audius`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'disable' }),
    })
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ id: 'audius', enabled: false })
  })

  it('rejects unknown control actions', async () => {
    const response = await fetch(`${base}/audius`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'publish' }),
    })
    expect(response.status).toBe(400)
  })
})
