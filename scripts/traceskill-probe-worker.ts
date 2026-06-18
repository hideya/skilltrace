import { spawn, spawnSync, type ChildProcess } from 'child_process'
import {
  ProbeDeduper,
  buildProbeReadEvent,
  discoverProbeConfig,
  isWatchedSkillPath,
  parseOpenSnoopPath,
} from './lib/skilltrace-probe'

async function main() {
  let options = parseArgs(process.argv.slice(2))
  if (!options.run) usage('Missing --run')
  if (!options.target) usage('Missing --target')
  if (!options.server) usage('Missing --server')

  let config = discoverProbeConfig({
    targetRoot: options.target,
    cwd: options.target,
  })
  if (!config) usage('Target repo must contain .skilltrace.json or .skills')

  assertMacOpenSnoopReady()

  let probe = startOpenSnoopProbe({
    runId: options.run,
    serverUrl: options.server,
    targetRoot: config.targetRoot,
    skillRoots: config.skillRoots,
    debug: options.debug ?? process.env.TRACESKILL_PROBE_DEBUG === '1',
  })

  bindCleanup(probe)

  console.error(`TraceSkill probe worker started: ${process.pid}`)
  console.error(`TraceSkill run ID: ${options.run}`)
  console.error(`TraceSkill target root: ${config.targetRoot}`)
  console.error(`TraceSkill skill roots: ${config.skillRoots.join(', ')}`)
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
    } else {
      usage(`Unknown option: ${arg}`)
    }
  }

  return options
}

function startOpenSnoopProbe(options: OpenSnoopProbeOptions) {
  let probe = spawn('sudo', ['-n', 'opensnoop'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let deduper = new ProbeDeduper()
  let buffer = ''

  probe.stdout.setEncoding('utf8')
  probe.stderr.setEncoding('utf8')

  probe.stdout.on('data', (chunk) => {
    buffer += chunk
    let lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (let line of lines) {
      void handleOpenSnoopLine(line, options, deduper).catch((error) => {
        console.error(`TraceSkill passive event failed: ${error.message}`)
      })
    }
  })

  probe.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
  })

  probe.on('error', (error) => {
    console.error(`TraceSkill opensnoop failed: ${error.message}`)
    process.exit(1)
  })

  probe.on('exit', (code, signal) => {
    console.error(`TraceSkill opensnoop exited: code=${code} signal=${signal}`)
    process.exit(code ?? 1)
  })

  return probe
}

async function handleOpenSnoopLine(
  line: string,
  options: OpenSnoopProbeOptions,
  deduper: ProbeDeduper,
) {
  let filePath = parseOpenSnoopPath(line, options.skillRoots)
  if (!filePath && options.debug && line.includes('.skills')) {
    console.error(`TraceSkill opensnoop unmatched: ${line}`)
  }
  if (!filePath) return
  if (options.debug) {
    console.error(`TraceSkill opensnoop matched: ${line}`)
  }
  if (!isWatchedSkillPath(filePath, options.skillRoots)) return
  if (deduper.has(filePath)) return

  let event = buildProbeReadEvent({
    runId: options.runId,
    targetRoot: options.targetRoot,
    filePath,
  })

  await postJson(options.serverUrl, '/api/passive-events', event)
  console.error(`TraceSkill passive event: ${event.event_type} ${filePath}`)
}

function assertMacOpenSnoopReady() {
  if (process.platform !== 'darwin') {
    throw new Error('traceskill passive probing currently supports macOS only')
  }

  let which = spawnSync('which', ['opensnoop'], { stdio: 'pipe' })
  if (which.status !== 0) {
    throw new Error('opensnoop was not found on PATH')
  }

  let sudo = spawnSync('sudo', ['-n', 'true'], { stdio: 'pipe' })
  if (sudo.status !== 0) {
    throw new Error('sudo is not ready. Run `sudo -v` before traceskill start.')
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
}

type OpenSnoopProbeOptions = {
  runId: string
  serverUrl: string
  targetRoot: string
  skillRoots: string[]
  debug?: boolean
}
