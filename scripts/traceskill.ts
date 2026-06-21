import path from 'path'
import fs from 'fs'
import { spawn, spawnSync } from 'child_process'
import { fileURLToPath } from 'url'

const DEFAULT_SERVER = 'http://localhost:5173'
const PROJECT_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

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

function run(command: string[]) {
  let result = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    env: process.env,
  })

  process.exit(result.status ?? 1)
}

function probeStatus(pid?: number) {
  if (!pid) return 'not running'

  try {
    process.kill(pid, 0)
    return `${pid} running`
  } catch {
    return `${pid} not running`
  }
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

function usage(message: string): never {
  console.error(message)
  console.error('Usage: pnpm traceskill <serve|start|status|end|stop|mcp>')
  console.error('       pnpm traceskill start [--target <repo>] [--server <url>]')
  process.exit(1)
}

await main()

type Options = {
  target?: string
  server?: string
  debugProbe?: boolean
}

type ProbeWorkerOptions = {
  runId: string
  targetRoot: string
  server: string
  debug?: boolean
}
