/**
 * 一条命令同时启动中间层 + Vite（零依赖）。
 * 用法：npm run dev:all
 */
import { spawn } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const middlewarePort = Number(process.env.PORT || 3001)
const children = []
const COLOR = { server: '\x1b[36m', vite: '\x1b[33m', reset: '\x1b[0m' }

function isPortOpen(port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host: '127.0.0.1' })
    sock.once('connect', () => {
      sock.destroy()
      resolve(true)
    })
    sock.once('error', () => resolve(false))
  })
}

function run(name, cmd, args) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const tag = `${COLOR[name]}[${name}]${COLOR.reset} `
  child.stdout.on('data', (d) => process.stdout.write(tag + d))
  child.stderr.on('data', (d) => process.stderr.write(tag + d))
  child.on('exit', (code) => {
    console.log(`\n[dev] ${name} exited (code ${code})，关闭另一个进程…`)
    shutdown()
  })
  children.push(child)
}

function shutdown() {
  for (const c of children) {
    try {
      c.kill()
    } catch {
      /* 忽略 */
    }
  }
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

// 中间层（默认 3001，转发 api-enhanced @ 3000）；已在跑则复用
if (await isPortOpen(middlewarePort)) {
  console.log(`[dev] 中间层已在 ${middlewarePort} 运行，直接复用（不重复启动）`)
} else {
  run(
    'server',
    process.execPath,
    ['--disable-warning=ExperimentalWarning', 'server/index.js'],
  )
}
// 前端（Vite @ 5173，/dreammusic/api/v1 代理到 3001）
run('vite', process.execPath, [join(root, 'node_modules', 'vite', 'bin', 'vite.js')])
