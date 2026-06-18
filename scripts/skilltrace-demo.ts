import {
  buildDemoEvents,
  buildDemoRunId,
  runUrl,
} from './lib/skilltrace-demo'

const DEFAULT_SERVER = 'http://localhost:5173'

async function main() {
  let options = parseArgs(process.argv.slice(2))
  let runId = options.run || buildDemoRunId()
  let server = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER

  let events = buildDemoEvents({ runId })

  for (let event of events) {
    await postEvent(server, event)
    console.error(`Posted ${event.event_type}`)
  }

  console.error('')
  console.error(`Run ID: ${runId}`)
  console.error(`Run URL: ${runUrl(server, runId)}`)
}

function parseArgs(args: string[]) {
  let options: Options = {}

  for (let index = 0; index < args.length; index += 1) {
    let arg = args[index]

    if (arg === '--run') {
      options.run = args[++index]
    } else if (arg === '--server') {
      options.server = args[++index]
    } else {
      usage(`Unknown option: ${arg}`)
    }
  }

  return options
}

async function postEvent(server: string, event: any) {
  let route =
    event.source === undefined && event.summary !== undefined
      ? '/api/skill-log-events'
      : '/api/passive-events'
  let response = await fetch(new URL(route, server), {
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
  console.error('Usage: pnpm skilltrace:demo [--run <run_id>] [--server <url>]')
  process.exit(1)
}

await main()

type Options = {
  run?: string
  server?: string
}
