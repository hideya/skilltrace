import fs from 'fs'
import path from 'path'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { mcpRunId } from './lib/skilltrace-mcp'
import {
  ProbeDeduper,
  buildProbeReadEvent,
  discoverProbeConfig,
  isWatchedSkillPath,
  parseOpenSnoopPath,
} from './lib/skilltrace-probe'
import {
  removeActiveSession,
  sessionFilePath,
  writeActiveSession,
} from './lib/skilltrace-session'

const DEFAULT_SERVER = 'http://localhost:5173'
const DEFAULT_CODEX = '/Applications/Codex.app/Contents/Resources/codex'

let shuttingDown = false

async function main() {
  let options = parseArgs(process.argv.slice(2))
  let config = discoverProbeConfig({
    targetRoot: options.target,
    initCwd: process.env.INIT_CWD,
    pwd: process.env.PWD,
    cwd: process.cwd(),
  })

  if (!config) {
    usage(
      'Missing target repo. Pass --target <repo> or run from a repo with .skilltrace.json or .skills.',
    )
  }

  let serverUrl = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER
  let runId =
    options.run ||
    mcpRunId({
      runStem:
        options.stem ||
        process.env.SKILLTRACE_RUN_STEM ||
        'run_skilltrace_session',
    })
  if (!runId) {
    throw new Error('Missing SkillTrace run ID')
  }
  let filePath = sessionFilePath({
    sessionFile: options.sessionFile || process.env.SKILLTRACE_SESSION_FILE,
  })

  assertMacOpenSnoopReady()

  writeActiveSession(
    {
      run_id: runId,
      server: serverUrl,
      target_root: config.targetRoot,
      skill_roots: config.skillRoots,
      started_at: new Date().toISOString(),
    },
    filePath,
  )

  let probe = startOpenSnoopProbe({
    runId,
    serverUrl,
    targetRoot: config.targetRoot,
    skillRoots: config.skillRoots,
  })

  console.error(`SkillTrace session file: ${filePath}`)
  console.error(`SkillTrace run ID: ${runId}`)
  console.error(`SkillTrace target root: ${config.targetRoot}`)
  console.error(`SkillTrace skill roots: ${config.skillRoots.join(', ')}`)

  let codex = spawn(options.codex || DEFAULT_CODEX, [], {
    cwd: config.targetRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      SKILLTRACE_RUN_ID: runId,
      SKILLTRACE_SERVER: serverUrl,
      SKILLTRACE_TARGET_ROOT: config.targetRoot,
      SKILLTRACE_SESSION_FILE: filePath,
    },
  })

  bindCleanup({ probe, codex, sessionFile: filePath })

  codex.on('exit', (code, signal) => {
    cleanup({ probe, sessionFile: filePath })
    if (signal) {
      console.error(`Codex exited with signal ${signal}`)
      process.exit(1)
    }
    process.exit(code ?? 0)
  })
}

function parseArgs(args: string[]) {
  let options: Options = {}

  for (let index = 0; index < args.length; index += 1) {
    let arg = args[index]

    if (arg === '--target') {
      options.target = args[++index]
    } else if (arg === '--run') {
      options.run = args[++index]
    } else if (arg === '--stem') {
      options.stem = args[++index]
    } else if (arg === '--server') {
      options.server = args[++index]
    } else if (arg === '--session-file') {
      options.sessionFile = args[++index]
    } else if (arg === '--codex') {
      options.codex = args[++index]
    } else {
      usage(`Unknown option: ${arg}`)
    }
  }

  return options
}

function startOpenSnoopProbe(options: OpenSnoopProbeOptions) {
  let probe = spawn('sudo', ['-n', 'opensnoop'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
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
        console.error(`SkillTrace passive event failed: ${error.message}`)
      })
    }
  })

  probe.stderr.on('data', (chunk) => {
    process.stderr.write(chunk)
  })

  probe.on('error', (error) => {
    console.error(`SkillTrace opensnoop failed: ${error.message}`)
    process.exit(1)
  })

  probe.on('exit', (code, signal) => {
    console.error(`SkillTrace opensnoop exited: code=${code} signal=${signal}`)
    if (!shuttingDown) {
      process.exit(code ?? 1)
    }
  })

  return probe
}

async function handleOpenSnoopLine(
  line: string,
  options: OpenSnoopProbeOptions,
  deduper: ProbeDeduper,
) {
  let filePath = parseOpenSnoopPath(line, options.skillRoots)
  if (!filePath) return
  if (!isWatchedSkillPath(filePath, options.skillRoots)) return
  if (deduper.has(filePath)) return
  if (!isReadableFile(filePath)) return

  let event = buildProbeReadEvent({
    runId: options.runId,
    targetRoot: options.targetRoot,
    filePath,
  })

  await postJson(options.serverUrl, '/api/passive-events', event)
  console.error(`SkillTrace passive event: ${event.event_type} ${filePath}`)
}

function assertMacOpenSnoopReady() {
  if (process.platform !== 'darwin') {
    throw new Error('skilltrace:probe-session currently supports macOS only')
  }

  let which = spawnSync('which', ['opensnoop'], { stdio: 'pipe' })
  if (which.status !== 0) {
    throw new Error('opensnoop was not found on PATH')
  }

  let sudo = spawnSync('sudo', ['-n', 'true'], { stdio: 'pipe' })
  if (sudo.status !== 0) {
    throw new Error('sudo is not ready. Run `sudo -v` before starting.')
  }
}

function bindCleanup(resources: CleanupResources) {
  process.on('SIGINT', () => {
    cleanup(resources)
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    cleanup(resources)
    process.exit(143)
  })
  process.on('exit', () => cleanup(resources))
}

function cleanup(resources: CleanupResources) {
  shuttingDown = true
  killProcessGroup(resources.probe)
  if (resources.codex) killProcess(resources.codex)
  removeActiveSession(resources.sessionFile)
}

function killProcessGroup(child: ChildProcess) {
  if (!child.pid || child.killed) return

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    killProcess(child)
  }
}

function killProcess(child: ChildProcess) {
  if (!child.pid || child.killed) return

  try {
    child.kill('SIGTERM')
  } catch {}
}

function isReadableFile(filePath: string) {
  try {
    let stat = fs.statSync(filePath)
    return stat.isFile()
  } catch {
    return false
  }
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
    throw new Error(`SkillTrace POST failed: ${response.status} ${text}`)
  }

  return await response.json()
}

function usage(message: string): never {
  console.error(message)
  console.error(
    'Usage: pnpm skilltrace:probe-session --target <repo> [--server <url>] [--stem <run_stem>] [--run <run_id>]',
  )
  process.exit(1)
}

await main()

type Options = {
  target?: string
  run?: string
  stem?: string
  server?: string
  sessionFile?: string
  codex?: string
}

type OpenSnoopProbeOptions = {
  runId: string
  serverUrl: string
  targetRoot: string
  skillRoots: string[]
}

type CleanupResources = {
  probe: ChildProcess
  codex?: ChildProcess
  sessionFile: string
}
