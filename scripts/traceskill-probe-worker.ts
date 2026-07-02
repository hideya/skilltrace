import { spawn, spawnSync, type ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import {
  ProbeDeduper,
  buildProbeReadEvent,
  discoverProbeConfig,
  isFsUsageReadOperation,
  isIgnoredObservedProcess,
  isWatchedSkillPath,
  parseFsUsageProcess,
  parseInotifywaitPath,
  parseOpenSnoopPath,
} from './lib/skilltrace-probe'

const SHARED_POLL_INTERVAL_MS = 500
const SHARED_POLL_FAILURE_LIMIT = 1200
const SHARED_POLL_FAILURE_LOG_INTERVAL = 20
const SHARED_POLL_MESSAGE_LIMIT = 600

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
  if (backend === 'fs_usage' && !isFsUsageReadOperation(line)) {
    if (options.debug) {
      let rootHint = debugRootHintForLine(line, active)
      if (rootHint) {
        console.error(
          `TraceSkill ${backend} metadata ignored (${rootHint}): ${line}`,
        )
      }
    }
    return
  }

  let filePath = parsePath(line)
  if (!filePath) {
    if (options.debug) {
      let rootHint = debugRootHintForLine(line, active)
      if (rootHint) {
        console.error(`TraceSkill ${backend} unmatched (${rootHint}): ${line}`)
      }
    }
    return
  }
  if (options.debug) {
    console.error(`TraceSkill ${backend} matched: ${line}`)
  }
  if (!isWatchedSkillPath(filePath, active.skillRoots)) {
    if (options.debug) {
      console.error(`TraceSkill ${backend} outside watched roots: ${filePath}`)
    }
    return
  }
  if (!isReadableFile(filePath)) {
    if (options.debug) {
      console.error(`TraceSkill ${backend} unreadable: ${filePath}`)
    }
    return
  }
  if (deduper.has(`${active.runId}:${filePath}`)) return
  let observedProcess = observedProcessForLine(backend, line)
  if (isIgnoredObservedProcess(observedProcess.observedProcessName)) {
    if (options.debug) {
      console.error(
        `TraceSkill ${backend} ignored ${filePath} from ${observedProcess.observedProcess}`,
      )
    }
    return
  }

  let event = buildProbeReadEvent({
    runId: active.runId,
    targetRoot: active.targetRoot,
    filePath,
    ...observedProcess,
  })

  await postJson(options.serverUrl, '/api/passive-events', event)
  console.error(`TraceSkill passive event: ${event.event_type} ${filePath}`)
}

function debugRootHintForLine(line: string, options: ActiveProbeOptions) {
  let lowerLine = line.toLowerCase()
  let matches: string[] = []

  for (let root of options.skillRoots) {
    let absoluteRoot = path.resolve(root)
    let relativeRoot = path.relative(options.targetRoot, absoluteRoot)
    let candidates = unique([
      absoluteRoot,
      relativeRoot && !relativeRoot.startsWith('..') ? relativeRoot : '',
    ].filter(Boolean))

    for (let candidate of candidates) {
      if (lowerLine.includes(candidate.toLowerCase())) {
        matches.push(candidate)
      }
    }
  }

  return matches.length > 0 ? unique(matches).join(', ') : null
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function observedProcessForLine(backend: ProbeBackend, line: string) {
  if (backend !== 'fs_usage') return {}

  let process = parseFsUsageProcess(line)
  if (!process) return {}

  return {
    observedProcess: process.process,
    observedProcessName: process.name,
    observedProcessId: process.pid,
  }
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
    pollFailures: 0,
  }
}

async function pollSharedSession(state: SharedProbeState) {
  while (!state.stopped) {
    let failure = await refreshSharedSession(state)

    if (failure) {
      state.pollFailures += 1
      logSharedPollFailure(state.pollFailures, failure)
    } else {
      if (state.pollFailures > 0) {
        console.error(
          `TraceSkill shared session poll recovered after ${state.pollFailures} failed poll${state.pollFailures === 1 ? '' : 's'}`,
        )
      }
      state.pollFailures = 0
    }

    if (state.pollFailures >= SHARED_POLL_FAILURE_LIMIT) {
      console.error(
        `TraceSkill shared probe lost contact with daemon after ${state.pollFailures} failed polls; exiting`,
      )
      process.exit(1)
    }

    await sleep(SHARED_POLL_INTERVAL_MS)
  }
}

async function refreshSharedSession(state: SharedProbeState) {
  try {
    let result = await getJson(state.serverUrl, '/api/sessions/status')
    let session = result.session
    if (!session || session.probe_kind !== 'shared') {
      if (state.session) {
        console.error('TraceSkill shared probe detached from active session')
      }
      state.session = undefined
      return null
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
    return null
  } catch (error) {
    let message = error instanceof Error ? error.message : String(error)
    return message
  }
}

function logSharedPollFailure(count: number, message: string) {
  if (count !== 1 && count % SHARED_POLL_FAILURE_LOG_INTERVAL !== 0) return

  console.error(
    `TraceSkill shared session poll failed (${count}/${SHARED_POLL_FAILURE_LIMIT}): ${truncateLogMessage(message)}`,
  )
}

function truncateLogMessage(message: string) {
  if (message.length <= SHARED_POLL_MESSAGE_LIMIT) return message
  return `${message.slice(0, SHARED_POLL_MESSAGE_LIMIT)}...[truncated]`
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

type ActiveProbeOptions = {
  runId: string
  targetRoot: string
  skillRoots: string[]
}

type SharedProbeOptions = {
  serverUrl: string
  debug?: boolean
  sharedState: SharedProbeState
}

type SharedProbeState = {
  serverUrl: string
  session?: SharedProbeSession
  stopped?: boolean
  pollFailures: number
}

type SharedProbeSession = {
  runId: string
  targetRoot: string
  skillRoots: string[]
}

type ProbeBackend = 'fs_usage' | 'inotifywait'
