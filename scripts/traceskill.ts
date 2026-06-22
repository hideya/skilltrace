import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawn, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const DEFAULT_SERVER = 'http://localhost:5173'
const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const DAEMON_DIR = path.join(os.homedir(), '.skilltrace')
const DAEMON_LOG_PATH = path.join(DAEMON_DIR, 'logs', 'daemon.log')
const DAEMON_STATE_PATH = path.join(DAEMON_DIR, 'daemon.json')

async function main() {
  let [command, ...args] = process.argv.slice(2)

  if (command === 'start') {
    await start(args)
  } else if (command === 'end' || command === 'stop') {
    await end(args)
  } else if (command === 'status') {
    await status(args)
  } else if (command === 'serve') {
    run(['pnpm', 'dev'])
  } else if (command === 'daemon') {
    await daemon(args)
  } else if (command === 'mcp') {
    run(['pnpm', 'skilltrace:mcp'])
  } else {
    usage(command ? `Unknown command: ${command}` : 'Missing command')
  }
}

async function start(args: string[]) {
  let options = parseArgs(args)
  let targetRoot = path.resolve(options.target || defaultTargetRoot())
  let server = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER

  primeSudo()

  let result = await postJson(server, '/api/sessions/start', {
    target_root: targetRoot,
  })
  let worker = startProbeWorker({
    runId: result.session.run_id,
    targetRoot,
    server,
    debug: options.debugProbe,
  })

  await postJson(server, '/api/sessions/probe', {
    run_id: result.session.run_id,
    probe_pid: worker.pid,
    probe_log_path: worker.logPath,
  })

  printSession('Started SkillTrace session', server, {
    ...result.session,
    probe_pid: worker.pid,
    probe_log_path: worker.logPath,
  })
}

async function end(args: string[]) {
  let options = parseArgs(args)
  let server = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER
  let result = await postJson(server, '/api/sessions/end', {})

  if (result.session) {
    printSession('Ended SkillTrace session', server, result.session)
  } else {
    console.log('No active SkillTrace session.')
  }
}

async function status(args: string[]) {
  let options = parseArgs(args)
  let server = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER
  let result = await getJson(server, '/api/sessions/status')

  if (result.session) {
    printSession('Active SkillTrace session', server, result.session)
  } else {
    console.log('No active SkillTrace session.')
  }
}

async function daemon(args: string[]) {
  let [command, ...rest] = args

  if (command === 'start') {
    await daemonStart(rest)
  } else if (command === 'stop') {
    await daemonStop(rest)
  } else if (command === 'status') {
    await daemonStatus(rest)
  } else if (command === 'logs') {
    daemonLogs(rest)
  } else {
    usage(command ? `Unknown daemon command: ${command}` : 'Missing daemon command')
  }
}

async function daemonStart(args: string[]) {
  let options = parseArgs(args)
  let server = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER
  let status = await getDaemonStatus(server)

  if (status.alive) {
    if (status.state) {
      console.log('SkillTrace daemon is already running.')
    } else {
      console.log('A SkillTrace server is already responding.')
    }
    printDaemonStatus(status)
    return
  }

  fs.mkdirSync(path.dirname(DAEMON_LOG_PATH), { recursive: true })
  let logFd = fs.openSync(DAEMON_LOG_PATH, 'a')
  let child = spawn('pnpm', ['dev'], {
    cwd: PROJECT_ROOT,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: {
      ...process.env,
      SKILLTRACE_DAEMON: '1',
    },
  })

  child.unref()
  fs.closeSync(logFd)

  if (typeof child.pid !== 'number') {
    throw new Error('Failed to start SkillTrace daemon')
  }

  let state = {
    pid: child.pid,
    server,
    log_path: DAEMON_LOG_PATH,
    started_at: new Date().toISOString(),
  }

  writeDaemonState(state)

  console.log('Started experimental SkillTrace daemon.')
  console.log(`  pid: ${state.pid}`)
  console.log(`  server: ${state.server}`)
  console.log(`  log: ${state.log_path}`)

  if (await waitForDaemon(server)) {
    console.log('  health: ok')
  } else {
    console.log('  health: not ready yet')
    console.log('  check: traceskill daemon logs')
  }
}

async function daemonStop(args: string[]) {
  let options = parseArgs(args)
  let state = readDaemonState()
  let server = options.server || state?.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER

  if (!state) {
    console.log('No SkillTrace daemon state found.')
    if (await isServerAlive(server)) console.log(`A server is responding at ${server}.`)
    return
  }

  await endServerSession(server)
  if (processAlive(state.pid)) {
    killProcessGroup(state.pid, 'SIGTERM')
    killProcessTree(state.pid, 'SIGTERM')
    await waitForExit(state.pid)
  }
  if (processAlive(state.pid)) {
    killProcessGroup(state.pid, 'SIGKILL')
    killProcessTree(state.pid, 'SIGKILL')
    await waitForExit(state.pid)
  }

  removeDaemonState()
  if (await isServerAlive(server)) {
    console.log('SkillTrace daemon state was removed, but a server is still responding.')
  } else {
    console.log('Stopped SkillTrace daemon.')
  }
}

async function daemonStatus(args: string[]) {
  let options = parseArgs(args)
  let state = readDaemonState()
  let server = options.server || state?.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER
  let status = await getDaemonStatus(server)

  printDaemonStatus(status)
}

function daemonLogs(args: string[]) {
  let options = parseArgs(args)
  let lines = options.lines || 80
  let logPath = readDaemonState()?.log_path || DAEMON_LOG_PATH

  if (!fs.existsSync(logPath)) {
    console.log(`No SkillTrace daemon log found at ${logPath}`)
    return
  }

  let content = fs.readFileSync(logPath, 'utf8')
  let tail = content.split('\n').slice(-lines).join('\n')
  if (tail.trim()) console.log(tail)
}

function defaultTargetRoot() {
  return (
    process.env.SKILLTRACE_TARGET_ROOT ||
    process.env.INIT_CWD ||
    process.env.PWD ||
    process.cwd()
  )
}

function parseArgs(args: string[]) {
  let options: Options = {}

  for (let index = 0; index < args.length; index += 1) {
    let arg = args[index]

    if (arg === '--target') {
      options.target = args[++index]
    } else if (arg === '--server') {
      options.server = args[++index]
    } else if (arg === '--debug-probe') {
      options.debugProbe = true
    } else if (arg === '--lines') {
      options.lines = Number(args[++index])
    } else {
      usage(`Unknown option: ${arg}`)
    }
  }

  return options
}

async function getJson(server: string, pathname: string) {
  let response = await fetch(new URL(pathname, server))
  return await jsonResponse(response)
}

async function postJson(server: string, pathname: string, body: any) {
  let response = await fetch(new URL(pathname, server), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  return await jsonResponse(response)
}

async function jsonResponse(response: Response) {
  if (!response.ok) {
    let body = await response.text()
    throw new Error(`TraceSkill request failed: ${response.status} ${body}`)
  }

  return await response.json()
}

async function getDaemonStatus(server: string) {
  let state = readDaemonState()
  let health = await getHealth(server)

  return {
    state,
    server,
    alive: health?.ok === true,
    health,
    pid_status: state?.pid ? probeStatus(state.pid) : 'unknown',
  }
}

async function getHealth(server: string) {
  try {
    return await getJson(server, '/api/health')
  } catch {
    return null
  }
}

async function isServerAlive(server: string) {
  return (await getHealth(server))?.ok === true
}

async function endServerSession(server: string) {
  try {
    await postJson(server, '/api/sessions/end', {})
  } catch {}
}

async function waitForDaemon(server: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await isServerAlive(server)) return true
    await sleep(500)
  }

  return false
}

async function waitForExit(pid: number) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!processAlive(pid)) return
    await sleep(250)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function printSession(label: string, server: string, session: any) {
  console.log(label)
  console.log(`  run: ${session.run_id}`)
  console.log(`  repo: ${session.target_root}`)
  console.log(`  probe: ${probeStatus(session.probe_pid)}`)
  if (session.probe_log_path) {
    console.log(`  probe log: ${session.probe_log_path}`)
  }
  console.log(`  ui: ${new URL(`/app/runs/${session.run_id}`, server)}`)
}

function printDaemonStatus(status: any) {
  if (status.alive && status.state && processAlive(status.state.pid)) {
    console.log('SkillTrace daemon is healthy.')
  } else if (status.alive) {
    console.log('SkillTrace server is healthy.')
  } else {
    console.log('SkillTrace daemon is not responding.')
  }

  console.log(`  server: ${status.server}`)
  if (status.state) {
    console.log(`  pid: ${status.pid_status}`)
    console.log(`  started: ${status.state.started_at}`)
    console.log(`  log: ${status.state.log_path}`)
  } else {
    console.log('  pid: no daemon state')
    console.log(`  log: ${DAEMON_LOG_PATH}`)
  }

  if (status.health?.session) {
    printSession('Active SkillTrace session', status.server, status.health.session)
  }
}

function run(command: string[]) {
  let result = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    env: process.env,
  })

  process.exit(result.status ?? 1)
}

function processAlive(pid?: number) {
  if (!pid) return false

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function killProcessGroup(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(-pid, signal)
  } catch {
    try {
      process.kill(pid, signal)
    } catch {}
  }
}

function killProcessTree(pid: number, signal: NodeJS.Signals) {
  for (let childPid of childPids(pid)) {
    killProcessTree(childPid, signal)
  }

  try {
    process.kill(pid, signal)
  } catch {}
}

function childPids(pid: number) {
  let result = spawnSync('pgrep', ['-P', String(pid)], {
    encoding: 'utf8',
  })

  if (result.status !== 0) return []

  return result.stdout
    .split('\n')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
}

function probeStatus(pid?: number) {
  if (!pid) return 'not running'

  if (processAlive(pid)) return `${pid} running`
  return `${pid} not running`
}

function startProbeWorker(options: ProbeWorkerOptions) {
  let logPath = path.join(
    PROJECT_ROOT,
    'data/local',
    `traceskill-probe-${options.runId}.log`,
  )
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  let logFd = fs.openSync(logPath, 'a')
  let args = [
    '--dir',
    PROJECT_ROOT,
    'exec',
    'tsx',
    'scripts/traceskill-probe-worker.ts',
    '--run',
    options.runId,
    '--target',
    options.targetRoot,
    '--server',
    options.server,
  ]
  if (options.debug) args.push('--debug')

  let child = spawn(
    'pnpm',
    args,
    {
      detached: false,
      stdio: ['ignore', logFd, logFd],
      env: process.env,
    },
  )

  child.unref()
  fs.closeSync(logFd)

  if (typeof child.pid !== 'number') {
    throw new Error('Failed to start TraceSkill probe worker')
  }

  return {
    pid: child.pid,
    logPath,
  }
}

function primeSudo() {
  let sudo = spawnSync('sudo', ['-v'], { stdio: 'inherit' })
  if (sudo.status !== 0) {
    throw new Error('sudo authorization failed')
  }
}

function readDaemonState() {
  if (!fs.existsSync(DAEMON_STATE_PATH)) return null

  try {
    return JSON.parse(fs.readFileSync(DAEMON_STATE_PATH, 'utf8'))
  } catch {
    return null
  }
}

function writeDaemonState(state: DaemonState) {
  fs.mkdirSync(path.dirname(DAEMON_STATE_PATH), { recursive: true })
  fs.writeFileSync(DAEMON_STATE_PATH, `${JSON.stringify(state, null, 2)}\n`)
}

function removeDaemonState() {
  if (fs.existsSync(DAEMON_STATE_PATH)) fs.rmSync(DAEMON_STATE_PATH)
}

function usage(message: string): never {
  console.error(message)
  console.error('Usage: pnpm traceskill <serve|start|status|end|stop|mcp>')
  console.error('       pnpm traceskill start [--target <repo>] [--server <url>]')
  console.error('       pnpm traceskill daemon <start|status|stop|logs>')
  process.exit(1)
}

await main()

type Options = {
  target?: string
  server?: string
  debugProbe?: boolean
  lines?: number
}

type ProbeWorkerOptions = {
  runId: string
  targetRoot: string
  server: string
  debug?: boolean
}

type DaemonState = {
  pid: number
  server: string
  log_path: string
  started_at: string
}
