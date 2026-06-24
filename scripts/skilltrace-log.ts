import {
  buildSkillLogEvent,
  parseKeyValueData,
} from './lib/skilltrace-log'

const DEFAULT_SERVER = 'http://localhost:7555'

async function main() {
  let options = parseArgs(process.argv.slice(2))
  let runId = options.run || process.env.SKILLTRACE_RUN_ID
  if (!runId) usage('Missing --run or SKILLTRACE_RUN_ID')
  if (!options.eventType) usage('Missing --event')

  let event = buildSkillLogEvent({
    runId,
    eventType: options.eventType,
    skillName: options.skill,
    skillVersion: options.version,
    skillPath: options.path,
    skillFileHash: options.hash,
    summary: options.summary,
    confidence: options.confidence,
    relatedArtifacts: options.artifacts,
    data: parseKeyValueData(options.data ?? []),
  })

  let server = options.server || process.env.SKILLTRACE_SERVER || DEFAULT_SERVER
  await postEvent(server, event)

  console.error(
    `Logged ${event.event_type} for ${event.skill.name || 'unnamed skill'} in ${event.run_id}`,
  )
}

function parseArgs(args: string[]) {
  let options: Options = {}

  for (let index = 0; index < args.length; index += 1) {
    let arg = args[index]

    if (arg === '--run') {
      options.run = args[++index]
    } else if (arg === '--event') {
      options.eventType = args[++index]
    } else if (arg === '--skill') {
      options.skill = args[++index]
    } else if (arg === '--version') {
      options.version = args[++index]
    } else if (arg === '--path') {
      options.path = args[++index]
    } else if (arg === '--hash') {
      options.hash = args[++index]
    } else if (arg === '--summary') {
      options.summary = args[++index]
    } else if (arg === '--confidence') {
      options.confidence = args[++index]
    } else if (arg === '--artifact') {
      options.artifacts = [...(options.artifacts ?? []), args[++index]]
    } else if (arg === '--data') {
      options.data = [...(options.data ?? []), args[++index]]
    } else if (arg === '--server') {
      options.server = args[++index]
    } else {
      usage(`Unknown option: ${arg}`)
    }
  }

  return options
}

async function postEvent(server: string, event: any) {
  let url = new URL('/api/skill-log-events', server)
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
    'Usage: pnpm skilltrace:log --event <type> [--run <run_id>] [--skill <name>] [--summary <text>]',
  )
  process.exit(1)
}

await main()

type Options = {
  run?: string
  eventType?: string
  skill?: string
  version?: string
  path?: string
  hash?: string
  summary?: string
  confidence?: string
  artifacts?: string[]
  data?: string[]
  server?: string
}
