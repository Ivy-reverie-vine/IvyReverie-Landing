/** Windows local music test launcher. Never reuses a gateway with unknown source configuration. */
import { spawn, fork } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { randomBytes } from 'node:crypto'
import { saveProcesses, clearProcesses, stopRequested, stopSavedProcesses } from './test-processes.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const upstreamRoot = join(root, '..', 'api-enhanced')
const metingRoot = join(root, 'scripts', 'meting-runtime')
const args = process.argv.slice(2)
const sources = ['api-enhanced', 'audius', 'tencent', 'kugou', 'kuwo', 'all']
const children = []
const runId = randomBytes(16).toString('hex')
let stopping = false
const localEnv = join(root, 'music-test.env.local')
if (args.includes('--stop')) {
  try { await stopSavedProcesses() } catch (error) { console.error(`[test] ${error.message}`); process.exit(1) }
  process.exit(0)
}

async function stop(code = 0) {
  if (stopping) return
  stopping = true
  console.log('\n[test] 正在停止本次启动的服务…')
  for (const child of children) child.kill()
  await Promise.all(children.map(async (child) => {
    for (let i = 0; i < 30 && child.exitCode === null && child.signalCode === null; i++) await delay(100)
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  }))
  clearProcesses(runId)
  process.exit(code)
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port })
    const finish = (open) => { socket.destroy(); resolve(open) }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.setTimeout(1000, () => finish(false))
  })
}

function start(name, cwd, argv, env) {
  const child = spawnOwned(cwd, argv, env)
  children.push(child)
  child.stdout.on('data', (data) => process.stdout.write(`[${name}] ${data}`))
  child.stderr.on('data', (data) => process.stderr.write(`[${name}] ${data}`))
  child.on('error', () => {
    console.error(`[test] ${name} 无法启动。`)
    void stop(1)
  })
  child.on('exit', (code) => {
    if (!stopping) {
      if (stopRequested(runId)) return void stop(0)
      console.error(`[test] ${name} 已退出（${code}）。`)
      void stop(code || 1)
    }
  })
}

function spawnOwned(cwd, argv, env) {
  const entryIndex = argv.findIndex(arg => !arg.startsWith('--'))
  const child = fork(join(root, 'scripts', 'service-runner.mjs'), [runId, resolve(cwd, argv[entryIndex]), ...argv.slice(entryIndex + 1)], {
    cwd, env, execArgv: argv.slice(0, entryIndex), stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  // Track immediately so stopping during startup/install is also covered.
  saveProcesses(runId, [...children, child])
  return child
}

async function waitReady(url, status = 200) {
  const deadline = Date.now() + 60000
  while (!stopping && Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
      await response.body?.cancel()
      if (response.status === status) return
    } catch { /* Startup is still in progress. */ }
    await delay(300)
  }
  throw new Error('服务未在 60 秒内就绪，请查看上方启动日志。')
}

async function installMeting() {
  if (existsSync(join(metingRoot, 'node_modules', '@meting', 'core', 'lib', 'meting.esm.js'))) return
  const npmCli = join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (!existsSync(npmCli)) throw new Error('Node 安装缺少 npm。请安装带 npm 的 Node.js 后重试。')
  console.log('[test] 首次使用，正在安装本地 Meting 核心（@meting/core 1.6.1）…')
  await new Promise((resolve, reject) => {
    const child = spawnOwned(metingRoot, [npmCli, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], process.env)
    children.push(child)
    child.stdout.on('data', (data) => process.stdout.write(`[安装] ${data}`))
    child.stderr.on('data', (data) => process.stderr.write(`[安装] ${data}`))
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Meting 安装超时，请检查 npm 网络后重新启动。'))
    }, 120000)
    child.on('error', () => { clearTimeout(timer); reject(new Error('无法启动 npm 安装 Meting。')) })
    child.on('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve()
      else reject(new Error('Meting 安装失败，请查看上方 npm 日志。'))
    })
  })
}

try {
  if (existsSync(localEnv)) process.loadEnvFile(localEnv)
  const major = Number(process.versions.node.split('.')[0])
  if (major < 22 || !process.getBuiltinModule('node:sqlite')) throw new Error('需要支持 node:sqlite 的 Node.js 22.13+。')
  if (args.some((arg, i) => !['--check', '--no-browser', '--source'].includes(arg) && args[i - 1] !== '--source')) {
    throw new Error('用法：Start-NightDream.cmd [--source api-enhanced|audius|tencent|kugou|kuwo|all] [--no-browser] [--check]')
  }
  const sourceIndex = args.indexOf('--source')
  let source = sourceIndex >= 0 ? args[sourceIndex + 1] : process.env.MUSIC_TEST_SOURCE || 'all'
  if (sourceIndex < 0 && !args.includes('--check') && process.stdin.isTTY) {
    console.log('\nNightDream 音乐获取测试\n1. 网易云  2. Audius  3. 腾讯/QQ  4. 酷狗  5. 酷我  6. 全部音源（推荐）')
    const input = createInterface({ input: process.stdin, output: process.stdout })
    try {
      const answer = (await input.question(`选择音源（回车使用 ${source}）：`)).trim()
      if (answer) source = sources[Number(answer) - 1] || answer
    } finally { input.close() }
  }
  if (!sources.includes(source)) throw new Error('无效音源，可选：' + sources.join(', '))
  const allSources = source === 'all'
  const netease = source === 'api-enhanced' || allSources
  const meting = ['tencent', 'kugou', 'kuwo'].includes(source) || allSources
  const localMeting = meting && !process.env.METING_API_URL
  const metingPort = Number(process.env.METING_LOCAL_PORT || 8000)
  if (localMeting && (!Number.isInteger(metingPort) || metingPort < 1 || metingPort > 65535 || [3000, 3001, 5173].includes(metingPort))) {
    throw new Error('METING_LOCAL_PORT 必须是未占用的端口，且不能与 3000、3001、5173 重复。')
  }
  if (meting && !localMeting) {
    const url = new URL(process.env.METING_API_URL)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('METING_API_URL 必须是 HTTP/HTTPS 地址。')
  }
  const required = [join(root, 'node_modules', 'vite', 'bin', 'vite.js'), join(root, 'node_modules', 'express')]
  if (netease) required.push(join(upstreamRoot, 'node_modules', 'axios'))
  if (required.some((path) => !existsSync(path))) {
    throw new Error('缺少依赖。请在 NightDream 执行 npm install；网易云测试还需在 api-enhanced 执行 pnpm install。')
  }
  const ports = netease ? [3000, 3001, 5173] : [3001, 5173]
  if (localMeting) ports.push(metingPort)
  const occupied = (await Promise.all(ports.map(async (port) => await portOpen(port) ? port : null))).filter(Boolean)
  if (occupied.length) throw new Error(`端口已占用：${occupied.join(', ')}。请先关闭已有本地服务，再启动本脚本。`)

  console.log(allSources ? '[test] 全部音源已配置；在正式播放器的搜索面板选择音源。' : `[test] 本次唯一音源：${source}；不会自动回退到其他音源。`)
  if (localMeting) console.log(`[test] 自动启动本地 Meting sidecar（端口 ${metingPort}），无需填写 METING_API_URL。`)
  if (args.includes('--check')) {
    console.log('[test] Node、依赖、音源配置和端口检查通过；尚未启动服务或验证真实音源。')
    process.exit(0)
  }
  const env = {
    ...process.env,
    PORT: '3001', UPSTREAM: 'http://127.0.0.1:3000', COOKIE_SECURE: 'false',
    API_ENHANCED_SOURCE_ENABLED: String(netease),
    AUDIUS_SOURCE_ENABLED: String(source === 'audius' || allSources),
    METING_SOURCE_ENABLED: String(meting), METING_PLATFORMS: allSources ? 'tencent,kugou,kuwo' : meting ? source : '',
  }
  if (localMeting) {
    await installMeting()
    env.METING_API_URL = `http://127.0.0.1:${metingPort}/api`
    env.METING_TOKEN = process.env.METING_TOKEN || randomBytes(32).toString('hex')
    env.METING_LOCAL_PORT = String(metingPort)
    start('Meting', metingRoot, ['server.mjs'], env)
    await waitReady(`http://127.0.0.1:${metingPort}/health`)
  }
  if (netease) {
    start('api-enhanced', upstreamRoot, ['app.js'], { ...env, PORT: '3000', HOST: '127.0.0.1' })
    await waitReady('http://127.0.0.1:3000/')
  }
  start('NightDream', root, ['--disable-warning=ExperimentalWarning', 'server/index.js'], env)
  await waitReady('http://127.0.0.1:3001/dreammusic/api/v1/auth/me', 401)
  start('网页', root, [required[0], '--host', '127.0.0.1', '--port', '5173', '--strictPort'], env)
  const url = 'http://127.0.0.1:5173/dreammusic'
  await waitReady(url)
  console.log(`\n[test] 测试页：${url}\n[test] 播放器：http://127.0.0.1:5173/dreammusic\n[test] 鸿蒙 NightDream 地址：http://本机局域网IP:3001\n[test] 保持窗口打开；按 Ctrl+C、输入 q 回车，或双击 Stop-NightDream.cmd 停止服务。`)
  if (process.stdin.isTTY) {
    const controls = createInterface({ input: process.stdin, output: process.stdout })
    controls.on('line', line => { if (line.trim().toLowerCase() === 'q') void stop() })
  }
  if (!args.includes('--no-browser') && process.platform === 'win32') {
    const browser = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore', windowsHide: true })
    browser.on('error', () => console.log('[test] 浏览器未打开，请手动访问上方链接。'))
    browser.unref()
  }
} catch (error) {
  console.error(`[test] ${error.message}`)
  await stop(1)
}
