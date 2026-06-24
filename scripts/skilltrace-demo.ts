import {
  buildDemoEvents,
  buildDemoRunId,
  demoRunCases,
  type DemoCase,
  runUrl,
} from './lib/skilltrace-demo'

const DEFAULT_SERVER = 'http://localhost:7555'

async function main() {
  let options = parseArgs(process.argv.slice(2))
  let baseRunId = options.run || buildDemoRunId()
  let caseName = options.caseName ?? 'both'
  let server = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER
  let runs = demoRunCases(caseName, baseRunId)

  for (let run of runs) {
    let events = buildDemoEvents({
      runId: run.runId,
      caseName: run.caseName,
    })

    for (let event of events) {
      await postEvent(server, event)
      console.error(`[${run.label}] Posted ${event.event_type}`)
    }

    console.error('')
    console.error(`${run.label}:`)
    console.error(`Run ID: ${run.runId}`)
    console.error(`Run URL: ${runUrl(server, run.runId)}`)
    console.error('')
  }
}

function parseArgs(args: string[]) {
  let options: Options = {}

  for (let index = 0; index < args.length; index += 1) {
    let arg = args[index]

    if (arg === '--run') {
      options.run = args[++index]
    } else if (arg === '--case') {
      options.caseName = parseCase(args[++index])
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
  console.error(
    'Usage: pnpm skilltrace:demo [--case pass|warning|both] [--run <base_run_id>] [--server <url>]',
  )
  process.exit(1)
}

await main()

function parseCase(value: string): DemoCase {
  if (['pass', 'warning', 'both'].includes(value)) return value as DemoCase
  usage(`Unknown case: ${value}`)
}

type Options = {
  run?: string
  caseName?: DemoCase
  server?: string
}
