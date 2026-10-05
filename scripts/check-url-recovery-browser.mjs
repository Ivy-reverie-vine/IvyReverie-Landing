// Reproducible native-browser acceptance with the production React player/API.
import { createServer } from 'vite'
import { startRecoveryGateway } from '../server/test-support/recoveryGateway.js'
const gateway = await startRecoveryGateway()
gateway.app.get('/test/fixture', async (req, res) => {
  gateway.recoveryControls.failFresh = req.query.failure === 'true'
  gateway.recoveryControls.resolveDelayMs = req.query.slow === 'true' ? 1200 : 0
  gateway.evidence.length = 0
  res.json(await gateway.select())
})
gateway.app.get('/test/evidence', (_req, res) => res.json(gateway.evidence))
const vite = await createServer({ server: { port: 5186, strictPort: true, host: '127.0.0.1',
  proxy: Object.fromEntries(['/test', '/dreammusic/api', '/dreammusic/media'].map(path => [path, { target: gateway.base, changeOrigin: true }])) } })
await vite.listen()
console.log('Recovery acceptance: http://127.0.0.1:5186/server/test-support/recovery-browser.html')
async function stop() { await vite.close(); await gateway.close(); process.exit(0) }
gateway.app.post('/test/shutdown', (_req, res) => { res.end('stopping'); setTimeout(stop, 100) })
process.on('SIGINT', stop); process.on('SIGTERM', stop)
