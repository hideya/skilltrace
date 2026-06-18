import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  buildMcpSkillLogEvent,
  skillLogEventInputSchema,
  skillTraceServerUrl,
  type SkillLogEventInput,
} from './lib/skilltrace-mcp'

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
    let event = buildMcpSkillLogEvent(input as SkillLogEventInput, {
      runId: process.env.SKILLTRACE_RUN_ID,
      server: process.env.SKILLTRACE_SERVER,
    })
    let result = await postSkillLogEvent(skillTraceServerUrl({
      server: process.env.SKILLTRACE_SERVER,
    }), event)

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

async function main() {
  let transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('SkillTrace MCP server running on stdio')
}

await main()
