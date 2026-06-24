import path from 'path'
import fs from 'fs'
import os from 'os'
import { spawn, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import {
  assessInstrumentation,
  ejectExistingInstructions,
  ejectInstructions,
  injectInstructions,
  instructionInjectionStatus,
} from './lib/instruction-injection'

const DEFAULT_SERVER = 'http://localhost:7555'
const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const ENTRY_DIR = path.dirname(fileURLToPath(import.meta.url))
const DIST_MODE = path.basename(ENTRY_DIR) === 'dist'
const TSX_LOADER_PATH = path.join(PROJECT_ROOT, 'node_modules', 'tsx', 'dist', 'loader.mjs')
const RUNTIME_ENV_IMPORT_PATH = DIST_MODE
  ? path.join(ENTRY_DIR, 'skilltrace-runtime-env.js')
  : path.join(PROJECT_ROOT, 'scripts/lib/skilltrace-runtime-env.js')
const DEV_MODE = process.env.SKILLTRACE_DEV === '1'
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
    runServe()
  } else if (command === 'daemon') {
    await daemon(args)
  } else if (command === 'mcp') {
    runScript('scripts/skilltrace-mcp.ts')
  } else {
    usage(command ? `Unknown command: ${command}` : 'Missing command')
  }
}

async function start(args: string[]) {
  let options = parseArgs(args)
  let targetRoot = path.resolve(options.target || defaultTargetRoot())
  let server = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER
  let probe = passiveProbeSupport()
  let instrumentation = withPassiveProbeWarning(
    assessInstrumentation(targetRoot, options.injectInstructions),
    probe,
  )
  let active = await getJson(server, '/api/sessions/status')
  if (active.session) {
    printActiveSessionRefusal(server, active.session)
    process.exit(1)
  }

  if (probe.supported) primeSudo()
  cleanupTargetInjection(targetRoot)

  let result = await postJson(server, '/api/sessions/start', {
    target_root: targetRoot,
    instrumentation,
  })
  printInstrumentationWarning(instrumentation, options.injectInstructions)
  let injection = options.injectInstructions
    ? injectInstructions(targetRoot, result.session.run_id)
    : null
  if (injection) {
    printInjectionResult('Instruction injection', injection)
    await postSessionEvent(server, result.session.run_id, 'instruction_injection_started', {
      ...injection,
      target_root: targetRoot,
    })
  }
  let worker = probe.supported
    ? startProbeWorker({
      runId: result.session.run_id,
      targetRoot,
      server,
      debug: options.debugProbe,
    })
    : null

  if (worker) {
    await postJson(server, '/api/sessions/probe', {
      run_id: result.session.run_id,
      probe_pid: worker.pid,
      probe_log_path: worker.logPath,
    })
  } else {
    printPassiveProbeWarning(probe)
    await postSessionEvent(server, result.session.run_id, 'trace_probe_unavailable', {
      platform: probe.platform,
      reason: probe.reason,
      target_root: targetRoot,
    })
  }

  printSession('Started SkillTrace session', server, {
    ...result.session,
    probe_pid: worker?.pid,
    probe_log_path: worker?.logPath,
  })
}

async function end(args: string[]) {
  let options = parseArgs(args)
  let server = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER
  await cleanupActiveInjection(server)

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
  let bindHost = process.env.HOST || '127.0.0.1'
  let port = process.env.PORT || new URL(server).port || '7555'
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
  let child = spawn(serveCommand(), serveArgs(), {
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
    bind_host: bindHost,
    bind_port: port,
    ui_urls: displayUrls(bindHost, port),
    log_path: DAEMON_LOG_PATH,
    started_at: new Date().toISOString(),
  }

  writeDaemonState(state)

  console.log('Started experimental SkillTrace daemon.')
  console.log(`  pid: ${state.pid}`)
  console.log(`  server: ${state.server}`)
  console.log(`  bind: ${state.bind_host}:${port}`)
  printDisplayUrls(state.ui_urls)
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

  await cleanupActiveInjection(server)
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
    } else if (arg === '--inject-instructions') {
      options.injectInstructions = true
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

async function postSessionEvent(
  server: string,
  runId: string,
  eventType: string,
  payload: Record<string, unknown>,
) {
  try {
    await postJson(server, '/api/sessions/event', {
      run_id: runId,
      event_type: eventType,
      payload,
    })
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error)
    console.warn(`Warning: failed to record ${eventType}: ${message}`)
  }
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

async function cleanupActiveInjection(server: string) {
  let active
  try {
    active = await getJson(server, '/api/sessions/status')
  } catch {
    return
  }

  if (!active.session) return

  let injection = ejectInstructions(active.session.target_root, active.session.run_id)
  if (!injection) return

  printInjectionResult('Instruction injection cleanup', injection)
  await postSessionEvent(server, active.session.run_id, 'instruction_injection_finished', {
    ...injection,
    target_root: active.session.target_root,
  })
}

function cleanupTargetInjection(targetRoot: string) {
  let injection = ejectExistingInstructions(targetRoot)
  if (!injection) return

  printInjectionResult('Previous instruction injection cleanup', injection)
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
  console.log(`  instruction injection: ${instructionInjectionStatus(session.target_root)}`)
  console.log(`  probe: ${probeStatus(session.probe_pid)}`)
  if (session.probe_log_path) {
    console.log(`  probe log: ${session.probe_log_path}`)
  }
  console.log(`  ui: ${new URL(`/app/runs/${session.run_id}`, server)}`)
}

function printActiveSessionRefusal(server: string, session: any) {
  console.error('A SkillTrace session is already active.')
  console.error(`  run: ${session.run_id}`)
  console.error(`  repo: ${session.target_root}`)
  console.error(`  instruction injection: ${instructionInjectionStatus(session.target_root)}`)
  console.error(`  ui: ${new URL(`/app/runs/${session.run_id}`, server)}`)
  console.error('')
  console.error('Run `traceskill stop` before starting another session.')
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
    if (status.state.bind_host) {
      console.log(`  bind: ${status.state.bind_host}:${status.state.bind_port ?? '?'}`)
    }
    printDisplayUrls(status.state.ui_urls)
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

function runScript(scriptPath: string, args: string[] = []) {
  let result = spawnSync(process.execPath, [
    ...nodeScriptArgs(scriptPath),
    ...args,
  ], {
    stdio: 'inherit',
    env: process.env,
  })

  process.exit(result.status ?? 1)
}

function runServe() {
  if (DEV_MODE) {
    let result = spawnSync('pnpm', ['dev'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
      env: process.env,
    })

    process.exit(result.status ?? 1)
  }

  let result = spawnSync(process.execPath, packagedServeArgs(), {
    cwd: PROJECT_ROOT,
    stdio: 'inherit',
    env: process.env,
  })

  process.exit(result.status ?? 1)
}

function serveCommand() {
  if (DEV_MODE) return 'pnpm'
  return process.execPath
}

function serveArgs() {
  if (DEV_MODE) return ['dev']
  return packagedServeArgs()
}

function packagedServeArgs() {
  return [
    '--import',
    RUNTIME_ENV_IMPORT_PATH,
    ...nodeScriptArgs('scripts/traceskill-serve.js'),
  ]
}

function nodeScriptArgs(scriptPath: string) {
  let builtPath = builtScriptPath(scriptPath)
  if (DIST_MODE) return [builtPath]

  return [
    '--import',
    TSX_LOADER_PATH,
    path.join(PROJECT_ROOT, scriptPath),
  ]
}

function builtScriptPath(scriptPath: string) {
  let parsed = path.parse(scriptPath)
  return path.join(ENTRY_DIR, `${parsed.name}.js`)
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
    DAEMON_DIR,
    'logs/probes',
    `traceskill-probe-${options.runId}.log`,
  )
  fs.mkdirSync(path.dirname(logPath), { recursive: true })
  let logFd = fs.openSync(logPath, 'a')
  let args = [
    ...nodeScriptArgs('scripts/traceskill-probe-worker.ts'),
    '--run',
    options.runId,
    '--target',
    options.targetRoot,
    '--server',
    options.server,
  ]
  if (options.debug) args.push('--debug')

  let child = spawn(
    process.execPath,
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

function printInjectionResult(label: string, result: any) {
  console.log(label)
  console.log(`  status: ${result.status}`)
  console.log(`  AGENTS.md: ${result.agents_path}`)
  console.log(`  instrumentation: ${result.instrumentation_path}`)
  if ('inserted_agents_instruction' in result) {
    console.log(`  inserted instruction: ${result.inserted_agents_instruction ? 'yes' : 'no'}`)
  }
  if ('created_instrumentation' in result) {
    console.log(`  created instrumentation: ${result.created_instrumentation ? 'yes' : 'no'}`)
  }
  if ('removed_agents_instruction' in result) {
    console.log(`  removed instruction: ${result.removed_agents_instruction ? 'yes' : 'no'}`)
  }
  if ('removed_instrumentation' in result) {
    console.log(`  removed instrumentation: ${result.removed_instrumentation ? 'yes' : 'no'}`)
  }
  for (let warning of result.warnings ?? []) {
    console.warn(`  warning: ${warning}`)
  }
}

function printInstrumentationWarning(instrumentation: any, injectRequested?: boolean) {
  if (instrumentation.status === 'ready') return
  if (injectRequested) return

  console.warn('Warning: SkillTrace instrumentation is not configured.')
  console.warn('Semantic MCP events are unlikely.')
  console.warn('Use: traceskill start --inject-instructions')
  for (let warning of instrumentation.warnings ?? []) {
    console.warn(`  warning: ${warning}`)
  }
}

function passiveProbeSupport() {
  if (process.platform === 'darwin') {
    return {
      supported: true,
      platform: process.platform,
    }
  }

  return {
    supported: false,
    platform: process.platform,
    reason: `Passive file probing is not available on ${process.platform} yet; semantic tracing will still run.`,
  }
}

function withPassiveProbeWarning(instrumentation: any, probe: PassiveProbeSupport) {
  if (probe.supported) return instrumentation

  return {
    ...instrumentation,
    warnings: [...(instrumentation.warnings ?? []), probe.reason],
  }
}

function printPassiveProbeWarning(probe: PassiveProbeSupport) {
  if (probe.supported) return
  console.warn(`Warning: ${probe.reason}`)
}

function primeSudo() {
  let sudo = spawnSync('sudo', ['-v'], { stdio: 'inherit' })
  if (sudo.status !== 0) {
    throw new Error('sudo authorization failed')
  }
}

function displayUrls(host: string, port: string) {
  if (host === '0.0.0.0' || host === '::') {
    let urls = networkAddresses().map((address) => `http://${address}:${port}`)
    return urls.length > 0 ? [...new Set(urls)] : [`http://127.0.0.1:${port}`]
  }

  return [`http://${host || '127.0.0.1'}:${port}`]
}

function networkAddresses() {
  let addresses: string[] = []

  for (let values of Object.values(os.networkInterfaces())) {
    for (let value of values ?? []) {
      if (value.family !== 'IPv4' || value.internal) continue
      addresses.push(value.address)
    }
  }

  return addresses
}

function printDisplayUrls(urls?: string[]) {
  for (let url of urls ?? []) {
    console.log(`  ui: ${url}`)
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
  console.error('Usage: traceskill <serve|start|status|end|stop|mcp>')
  console.error('       traceskill start [--target <repo>] [--server <url>] [--inject-instructions]')
  console.error('       traceskill daemon <start|status|stop|logs>')
  process.exit(1)
}

await main()

type Options = {
  target?: string
  server?: string
  debugProbe?: boolean
  injectInstructions?: boolean
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
  bind_host?: string
  bind_port?: string
  ui_urls?: string[]
  log_path: string
  started_at: string
}

type PassiveProbeSupport = {
  supported: boolean
  platform: NodeJS.Platform
  reason?: string
}
