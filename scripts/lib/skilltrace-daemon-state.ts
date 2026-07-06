import fs from 'fs'
import os from 'os'
import path from 'path'

export const DAEMON_DIR = path.join(os.homedir(), '.skilltrace')
export const DAEMON_LOG_PATH = path.join(DAEMON_DIR, 'logs', 'daemon.log')
export const DAEMON_STATE_PATH = path.join(DAEMON_DIR, 'daemon.json')

export function readDaemonState(statePath = DAEMON_STATE_PATH) {
  if (!fs.existsSync(statePath)) return null

  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8')) as DaemonState
  } catch {
    return null
  }
}

export function writeDaemonState(
  state: DaemonState,
  statePath = DAEMON_STATE_PATH,
) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true })
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

export function removeDaemonState(statePath = DAEMON_STATE_PATH) {
  if (fs.existsSync(statePath)) fs.rmSync(statePath)
}

export type DaemonState = {
  pid: number
  server: string
  bind_host?: string
  bind_port?: string
  ui_urls?: string[]
  log_path: string
  started_at: string
  shared_probe_requested?: boolean
  shared_probe_pid?: number
  shared_probe_log_path?: string
  shared_probe_platform?: string
  shared_probe_warning?: string
  shared_probe_blocks_run_probe?: boolean
}
