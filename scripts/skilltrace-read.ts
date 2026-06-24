import fs from 'fs'
import path from 'path'
import { buildSkillReadEvent } from './lib/skilltrace-read'

const DEFAULT_SERVER = 'http://localhost:7555'

async function main() {
  let options = parseArgs(process.argv.slice(2))
  let runId = options.run || process.env.SKILLTRACE_RUN_ID
  if (!runId) usage('Missing --run or SKILLTRACE_RUN_ID')
  if (!options.filePath) usage('Missing file path')

  let filePath = path.resolve(options.filePath)
  let content = fs.readFileSync(filePath, 'utf8')
  let event = buildSkillReadEvent({
    runId,
    skillName: options.skill,
    filePath,
    content,
  })

  let server = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER
  await postEvent(server, event)

  process.stdout.write(content)
}

function parseArgs(args: string[]) {
  let options: Options = {}

  for (let index = 0; index < args.length; index += 1) {
    let arg = args[index]

    if (arg === '--run') {
      options.run = args[++index]
    } else if (arg === '--skill') {
      options.skill = args[++index]
    } else if (arg === '--server') {
      options.server = args[++index]
    } else if (arg.startsWith('--')) {
      usage(`Unknown option: ${arg}`)
    } else {
      options.filePath = arg
    }
  }

  return options
}

async function postEvent(server: string, event: any) {
  let url = new URL('/api/passive-events', server)
  let response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(event),
  })

  if (!response.ok) {
    let body = await response.text()
    throw new Error(`SkillTrace POST failed: ${response.status} ${body}`)
  }
}

function usage(message: string): never {
  console.error(message)
  console.error(
    'Usage: pnpm skilltrace:read --run <run_id> [--skill <name>] [--server <url>] <file>',
  )
  process.exit(1)
}

await main()

type Options = {
  run?: string
  skill?: string
  server?: string
  filePath?: string
}
