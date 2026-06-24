import { spawn, spawnSync, type ChildProcess } from 'child_process'
import fs from 'fs'
import {
  ProbeDeduper,
  buildProbeReadEvent,
  discoverProbeConfig,
  isWatchedSkillPath,
  parseInotifywaitPath,
  parseOpenSnoopPath,
} from './lib/skilltrace-probe'

async function main() {
  let options = parseArgs(process.argv.slice(2))
  if (!options.server) usage('Missing --server')
  if (options.shared) {
    await startSharedWorker(options)
    return
  }

  if (!options.run) usage('Missing --run')
  if (!options.target) usage('Missing --target')

  let config = discoverProbeConfig({
    targetRoot: options.target,
    cwd: options.target,
  })
  if (!config) usage('Target repo must contain .skilltrace.json or .skills')

  let backend = probeBackend()
  assertProbeReady(backend)

  let probe = startPassiveProbe(backend, {
    runId: options.run,
    serverUrl: options.server,
    targetRoot: config.targetRoot,
    skillRoots: config.skillRoots,
    debug: options.debug ?? process.env.TRACESKILL_PROBE_DEBUG === '1',
  })

  bindCleanup(probe)

  console.error(`TraceSkill probe worker started: ${process.pid}`)
  console.error(`TraceSkill probe backend: ${backend}`)
  console.error(`TraceSkill run ID: ${options.run}`)
  console.error(`TraceSkill target root: ${config.targetRoot}`)
  console.error(`TraceSkill skill roots: ${config.skillRoots.join(', ')}`)
}

async function startSharedWorker(options: Options) {
  let backend = probeBackend()
  if (backend !== 'fs_usage') {
    throw new Error('shared passive probing currently supports macOS fs_usage only')
  }
  assertProbeReady(backend)

  let state = createSharedState(options.server!)
  let probe = startSharedProbe(backend, {
    serverUrl: options.server!,
    debug: options.debug ?? process.env.TRACESKILL_PROBE_DEBUG === '1',
    sharedState: state,
  })

  bindCleanup(probe)
  void pollSharedSession(state)

  console.error(`TraceSkill shared probe worker started: ${process.pid}`)
  console.error(`TraceSkill probe backend: ${backend}`)
  console.error(`TraceSkill server: ${options.server}`)
}

function parseArgs(args: string[]) {
  let options: Options = {}

  for (let index = 0; index < args.length; index += 1) {
    let arg = args[index]

    if (arg === '--run') {
      options.run = args[++index]
    } else if (arg === '--target') {
      options.target = args[++index]
    } else if (arg === '--server') {
      options.server = args[++index]
    } else if (arg === '--debug') {
      options.debug = true
    } else if (arg === '--shared') {
      options.shared = true
    } else {
      usage(`Unknown option: ${arg}`)
    }
  }

  return options
}

function startPassiveProbe(backend: ProbeBackend, options: ProbeOptions) {
  if (backend === 'fs_usage') return startFsUsageProbe(options)
  return startInotifywaitProbe(options)
}

function startSharedProbe(backend: ProbeBackend, options: SharedProbeOptions) {
  if (backend !== 'fs_usage') {
    throw new Error('shared passive probing currently supports fs_usage only')
  }

  let probe = spawn('sudo', ['-n', 'fs_usage', '-w', '-f', 'filesys'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })

  return handleProbeOutput(probe, options, 'fs_usage', (line) => {
    let session = options.sharedState.session
    if (!session) return undefined
    return parseOpenSnoopPath(line, session.skillRoots, session.targetRoot)
  })
}

function startFsUsageProbe(options: ProbeOptions) {
  let probe = spawn('sudo', ['-n', 'fs_usage', '-w', '-f', 'filesys'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return handleProbeOutput(probe, options, 'fs_usage', (line) =>
    parseOpenSnoopPath(line, options.skillRoots, options.targetRoot)
  )
}

function startInotifywaitProbe(options: ProbeOptions) {
  let roots = options.skillRoots.filter((root) => fs.existsSync(root))
  if (roots.length === 0) {
    throw new Error('No configured skill roots exist for inotifywait')
  }

  let probe = spawn(
    'inotifywait',
    ['-m', '-r', '-e', 'open', '--format', '%w%f', ...roots],
    {
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  return handleProbeOutput(probe, options, 'inotifywait', (line) =>
    parseInotifywaitPath(line, options.targetRoot)
  )
}

function handleProbeOutput(
  probe: ChildProcess,
  options: ProbeOptions | SharedProbeOptions,
  backend: ProbeBackend,
  parsePath: (line: string) => string | undefined,
) {
  let deduper = new ProbeDeduper(Number.POSITIVE_INFINITY)
  let buffer = ''
  if (!probe.stdout || !probe.stderr) {
    throw new Error(`TraceSkill ${backend} did not expose stdout/stderr`)
  }

  probe.stdout.setEncoding('utf8')
  probe.stderr.setEncoding('utf8')

  probe.stdout.on('data', (chunk) => {
    buffer += chunk
    let lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (let line of lines) {
      void handleProbeLine(line, options, deduper, backend, parsePath).catch((error) => {
        console.error(`TraceSkill passive event failed: ${error.message}`)
      })
    }
  })

  probe.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
  })

  probe.on('error', (error) => {
    console.error(`TraceSkill ${backend} failed: ${error.message}`)
    process.exit(1)
  })

  probe.on('exit', (code, signal) => {
    console.error(`TraceSkill ${backend} exited: code=${code} signal=${signal}`)
    process.exit(code ?? 1)
  })

  return probe
}

async function handleProbeLine(
  line: string,
  options: ProbeOptions | SharedProbeOptions,
  deduper: ProbeDeduper,
  backend: ProbeBackend,
  parsePath: (line: string) => string | undefined,
) {
  let active = activeProbeOptions(options)
  if (!active) return
  let filePath = parsePath(line)
  if (!filePath && options.debug && line.includes('.skills')) {
    console.error(`TraceSkill ${backend} unmatched: ${line}`)
  }
  if (!filePath) return
  if (options.debug) {
    console.error(`TraceSkill ${backend} matched: ${line}`)
  }
  if (!isWatchedSkillPath(filePath, active.skillRoots)) return
  if (!isReadableFile(filePath)) return
  if (deduper.has(`${active.runId}:${filePath}`)) return

  let event = buildProbeReadEvent({
    runId: active.runId,
    targetRoot: active.targetRoot,
    filePath,
  })

  await postJson(options.serverUrl, '/api/passive-events', event)
  console.error(`TraceSkill passive event: ${event.event_type} ${filePath}`)
}

function activeProbeOptions(options: ProbeOptions | SharedProbeOptions) {
  if ('sharedState' in options) return options.sharedState.session
  return options
}

function probeBackend(): ProbeBackend {
  if (process.platform === 'darwin') return 'fs_usage'
  if (process.platform === 'linux') return 'inotifywait'
  throw new Error(`traceskill passive probing does not support ${process.platform}`)
}

function assertProbeReady(backend: ProbeBackend) {
  let executable = backend === 'fs_usage' ? 'fs_usage' : 'inotifywait'
  let which = spawnSync('which', [executable], { stdio: 'pipe' })
  if (which.status !== 0) {
    throw new Error(`${executable} was not found on PATH`)
  }

  if (backend !== 'fs_usage') return

  let sudo = spawnSync('sudo', ['-n', 'true'], { stdio: 'pipe' })
  if (sudo.status !== 0) {
    throw new Error('sudo is not ready. Run `sudo -v` before traceskill start.')
  }
}

function isReadableFile(filePath: string) {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function bindCleanup(probe: ChildProcess) {
  let cleanup = () => {
    if (!probe.pid || probe.killed) return

    try {
      probe.kill('SIGTERM')
    } catch {}
  }

  process.on('SIGINT', () => {
    cleanup()
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    cleanup()
    process.exit(143)
  })
  process.on('exit', cleanup)
}

async function postJson(serverUrl: string, pathname: string, body: any) {
  let response = await fetch(new URL(pathname, serverUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    let text = await response.text()
    throw new Error(`TraceSkill POST failed: ${response.status} ${text}`)
  }

  return await response.json()
}

async function getJson(serverUrl: string, pathname: string) {
  let response = await fetch(new URL(pathname, serverUrl))

  if (!response.ok) {
    let text = await response.text()
    throw new Error(`TraceSkill GET failed: ${response.status} ${text}`)
  }

  return await response.json()
}

function createSharedState(serverUrl: string): SharedProbeState {
  return {
    serverUrl,
  }
}

async function pollSharedSession(state: SharedProbeState) {
  while (true) {
    await refreshSharedSession(state)
    await sleep(500)
  }
}

async function refreshSharedSession(state: SharedProbeState) {
  try {
    let result = await getJson(state.serverUrl, '/api/sessions/status')
    let session = result.session
    if (!session) {
      if (state.session) {
        console.error('TraceSkill shared probe detached from active session')
      }
      state.session = undefined
      return
    }

    let next = {
      runId: session.run_id,
      targetRoot: session.target_root,
      skillRoots: session.skill_roots ?? [],
    }
    if (state.session?.runId !== next.runId) {
      console.error(`TraceSkill shared probe attached to run: ${next.runId}`)
      console.error(`TraceSkill target root: ${next.targetRoot}`)
      console.error(`TraceSkill skill roots: ${next.skillRoots.join(', ')}`)
    }
    state.session = next
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error)
    console.error(`TraceSkill shared session poll failed: ${message}`)
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function usage(message: string): never {
  console.error(message)
  console.error(
    'Usage: traceskill-probe-worker --run <run_id> --target <repo> --server <url>',
  )
  process.exit(1)
}

await main()

type Options = {
  run?: string
  target?: string
  server?: string
  debug?: boolean
  shared?: boolean
}

type ProbeOptions = {
  runId: string
  serverUrl: string
  targetRoot: string
  skillRoots: string[]
  debug?: boolean
}

type SharedProbeOptions = {
  serverUrl: string
  debug?: boolean
  sharedState: SharedProbeState
}

type SharedProbeState = {
  serverUrl: string
  session?: SharedProbeSession
}

type SharedProbeSession = {
  runId: string
  targetRoot: string
  skillRoots: string[]
}

type ProbeBackend = 'fs_usage' | 'inotifywait'
