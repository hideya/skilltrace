import path from 'path'
import { spawnSync } from 'child_process'

const DEFAULT_SERVER = 'http://localhost:5173'

async function main() {
  let [command, ...args] = process.argv.slice(2)

  if (command === 'start') {
    await start(args)
  } else if (command === 'end') {
    await end(args)
  } else if (command === 'status') {
    await status(args)
  } else if (command === 'serve') {
    primeSudo()
    run(['pnpm', 'dev'])
  } else if (command === 'mcp') {
    run(['pnpm', 'skilltrace:mcp'])
  } else {
    usage(command ? `Unknown command: ${command}` : 'Missing command')
  }
}

async function start(args: string[]) {
  let options = parseArgs(args)
  let targetRoot = path.resolve(options.target || process.cwd())
  let server = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER

  let result = await postJson(server, '/api/sessions/start', {
    target_root: targetRoot,
  })

  printSession('Started SkillTrace session', server, result.session)
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

function parseArgs(args: string[]) {
  let options: Options = {}

  for (let index = 0; index < args.length; index += 1) {
    let arg = args[index]

    if (arg === '--target') {
      options.target = args[++index]
    } else if (arg === '--server') {
      options.server = args[++index]
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
  console.log(`  probe: ${session.probe_pid ?? 'not running'}`)
  console.log(`  ui: ${new URL(`/app/runs/${session.run_id}`, server)}`)
}

function run(command: string[]) {
  let result = spawnSync(command[0], command.slice(1), {
    stdio: 'inherit',
    env: process.env,
  })

  process.exit(result.status ?? 1)
}

function primeSudo() {
  let sudo = spawnSync('sudo', ['-v'], { stdio: 'inherit' })
  if (sudo.status !== 0) {
    throw new Error('sudo authorization failed')
  }
}

function usage(message: string): never {
  console.error(message)
  console.error('Usage: pnpm traceskill <serve|start|status|end|mcp>')
  console.error('       pnpm traceskill start [--target <repo>] [--server <url>]')
  process.exit(1)
}

await main()

type Options = {
  target?: string
  server?: string
}
