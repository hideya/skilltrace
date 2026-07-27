import { spawnSync } from 'child_process'

export function processAlive(pid?: number) {
  if (!pid) return false

  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      return error.code === 'EPERM'
    }
    return false
  }
}

export function commandExists(command: string) {
  return spawnSync('which', [command], { stdio: 'pipe' }).status === 0
}

export function processOwnsServer(parentPid: number, serverPid?: number) {
  if (!serverPid) return false
  if (serverPid === parentPid) return true
  return descendantPids(parentPid).includes(serverPid)
}

export async function waitForExit(pid: number) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!processAlive(pid)) return
    await sleep(250)
  }
}

export function killProcessGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {}
  }
}

export function killProcessTree(pid: number, signal: NodeJS.Signals) {
  for (let childPid of childPids(pid)) {
    killProcessTree(childPid, signal)
  }

  try {
    process.kill(pid, signal)
  } catch {}
}

export function childPids(pid: number) {
  let result = spawnSync('pgrep', ['-P', String(pid)], {
    encoding: 'utf8',
  })

  if (result.status !== 0) return []

  return result.stdout
    .split('\n')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
}

export function descendantPids(pid: number): number[] {
  let descendants: number[] = []
  for (let childPid of childPids(pid)) {
    descendants.push(childPid, ...descendantPids(childPid))
  }
  return descendants
}

export function sharedProbeWorkers() {
  if (process.platform !== 'darwin') return []

  let result = spawnSync('ps', ['-axo', 'pid=,command='], {
    encoding: 'utf8',
  })
  if (result.status !== 0) return []

  return result.stdout
    .split('\n')
    .map(parseProcessLine)
    .filter((process): process is ProcessInfo => !!process)
    .filter((process) =>
      process.command.includes('traceskill-probe-worker') &&
      process.command.includes('--shared')
    )
    .map((process) => ({
      ...process,
      server: sharedProbeServer(process.command),
    }))
}

export async function cleanupSharedProbeWorkers(server: string) {
  let workers = sharedProbeWorkers().filter((worker) =>
    worker.server === server || !worker.server
  )

  for (let worker of workers) {
    await stopProcessTree(worker.pid)
  }
}

export async function stopProcessTree(pid: number) {
  if (!processAlive(pid)) return

  killProcessGroup(pid, 'SIGTERM')
  killProcessTree(pid, 'SIGTERM')
  await waitForExit(pid)

  if (!processAlive(pid)) return

  killProcessGroup(pid, 'SIGKILL')
  killProcessTree(pid, 'SIGKILL')
  await waitForExit(pid)
}

export function parseProcessLine(line: string) {
  let match = line.trim().match(/^(\d+)\s+(.+)$/)
  if (!match) return null

  return {
    pid: Number(match[1]),
    command: match[2],
  }
}

export function sharedProbeServer(command: string) {
  let parts = command.split(/\s+/)
  let index = parts.indexOf('--server')
  if (index === -1) return undefined
  return parts[index + 1]
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type ProcessInfo = {
  pid: number
  command: string
}
