import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scripts = dirname(fileURLToPath(import.meta.url))
const stateFile = join(scripts, '..', 'data', 'music-test-processes.json')
const runner = join(scripts, 'service-runner.mjs')

function readState() {
  try { return JSON.parse(readFileSync(stateFile, 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') return null; throw error }
}
export function saveProcesses(runId, children, stopping = false) {
  mkdirSync(dirname(stateFile), { recursive: true })
  writeFileSync(stateFile + '.tmp', JSON.stringify({ runId, stopping, children: children.filter(c => c.pid).map(c => c.pid) }))
  renameSync(stateFile + '.tmp', stateFile)
}
export function stopRequested(runId) {
  const state = readState()
  return state?.runId === runId && state.stopping === true
}
export function clearProcesses(runId) {
  if (readState()?.runId === runId) {
    try { unlinkSync(stateFile) } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
}
export async function stopSavedProcesses() {
  const state = readState()
  if (!state) return console.log('[test] 没有记录中的测试服务。')
  if (!/^[a-f0-9]{32}$/.test(state.runId) || !Array.isArray(state.children) || state.children.some(pid => !Number.isInteger(pid) || pid < 1)) {
    throw new Error('测试进程记录无效，未停止任何进程。')
  }
  saveProcesses(state.runId, state.children.map(pid => ({ pid })), true)
  if (process.platform !== 'win32') throw new Error('停止脚本目前用于 Windows；其他系统请在启动窗口按 Ctrl+C。')
  const quote = value => "'" + value.replaceAll("'", "''") + "'"
  // Check both the exact runner path and a per-launch token before stopping a PID.
  const script = `$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$runnerPath = ${quote(runner)}
$runToken = ${quote(state.runId)}
foreach ($ownedPid in @(${state.children.join(',')})) {
  $info = Get-CimInstance Win32_Process -Filter "ProcessId = $ownedPid"
  if ($info -and $info.Name -eq 'node.exe' -and $info.CommandLine.Contains($runnerPath) -and $info.CommandLine.Contains($runToken)) {
    Stop-Process -Id $ownedPid -ErrorAction SilentlyContinue
    Write-Output "[test] stopped owned service PID $ownedPid"
  }
}`
  await new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true,
    })
    child.on('error', reject)
    child.on('exit', code => code === 0 ? resolve() : reject(new Error('停止服务失败，请查看上方信息。')))
  })
  clearProcesses(state.runId)
  console.log('[test] 本次记录中的测试服务已停止。')
}
