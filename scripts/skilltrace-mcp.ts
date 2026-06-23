import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  buildMcpSkillLogEvent,
  buildMcpSkillTraceContextEvent,
  mcpRunId,
  skillLogEventInputSchema,
  skillTraceContextInputSchema,
  skillTraceServerUrl,
  type SkillLogEventInput,
  type SkillTraceContextInput,
} from './lib/skilltrace-mcp'
import { readActiveSession, sessionFilePath } from './lib/skilltrace-session'

const ACTIVE_SESSION = readActiveSession(
  sessionFilePath({
    sessionFile: process.env.SKILLTRACE_SESSION_FILE,
  }),
)
const MCP_RUN_ID = mcpRunId({
  runId: process.env.SKILLTRACE_RUN_ID,
  sessionRunId: ACTIVE_SESSION?.run_id,
  runStem: process.env.SKILLTRACE_RUN_STEM,
})
const SERVER_URL = skillTraceServerUrl({
  server: process.env.SKILLTRACE_SERVER ?? ACTIVE_SESSION?.server,
})

const server = new McpServer({
  name: 'skilltrace-mcp',
  version: '0.1.0',
})

server.registerTool(
  'skill_log_event',
  {
    title: 'SkillTrace semantic logger',
    description:
      'Log semantic skill-use declarations to a local SkillTrace server.',
    inputSchema: skillLogEventInputSchema,
  },
  async (input) => {
    let session = MCP_RUN_ID
      ? undefined
      : await resolveActiveSession(SERVER_URL)
    let runId = MCP_RUN_ID || session?.run_id
    let event = buildMcpSkillLogEvent(input as SkillLogEventInput, {
      runId,
    })
    let result = await postSkillLogEvent(SERVER_URL, event)

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ok: true,
              run_id: event.run_id,
              event_type: event.event_type,
              event_id: result.event?.id,
            },
            null,
            2,
          ),
        },
      ],
    }
  },
)

server.registerTool(
  'skill_trace_context',
  {
    title: 'SkillTrace run context',
    description:
      'Declare run metadata such as model, client, working directory, and task summary.',
    inputSchema: skillTraceContextInputSchema,
  },
  async (input) => {
    let runId = await resolveRunId()
    let event = buildMcpSkillTraceContextEvent(
      input as SkillTraceContextInput,
      { runId },
    )
    let result = await postSkillLogEvent(SERVER_URL, event)

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ok: true,
              run_id: event.run_id,
              event_type: event.event_type,
              event_id: result.event?.id,
            },
            null,
            2,
          ),
        },
      ],
    }
  },
)

async function resolveRunId() {
  if (MCP_RUN_ID) return MCP_RUN_ID

  let session = await resolveActiveSession(SERVER_URL)
  return session?.run_id
}

async function postSkillLogEvent(serverUrl: string, event: any) {
  let response = await fetch(new URL('/api/skill-log-events', serverUrl), {
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

  return await response.json()
}

async function resolveActiveSession(serverUrl: string) {
  let response = await fetch(new URL('/api/sessions/resolve', serverUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      target_root: sessionTargetRoot(),
    }),
  })

  if (!response.ok) {
    let body = await response.text()
    throw new Error(`SkillTrace session resolve failed: ${response.status} ${body}`)
  }

  let data = await response.json()
  return data.session
}

function sessionTargetRoot() {
  return (
    process.env.SKILLTRACE_TARGET_ROOT ||
    process.env.INIT_CWD ||
    process.env.PWD ||
    process.cwd()
  )
}

async function main() {
  let transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('SkillTrace MCP server running on stdio')
  console.error(`SkillTrace server: ${SERVER_URL}`)
  console.error(`SkillTrace run ID: ${MCP_RUN_ID || '(active session required)'}`)
}

await main()
