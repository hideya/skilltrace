import fs from 'fs'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { buildSkillLogEvent } from './lib/skilltrace-log'
import {
  mcpRunId,
  skillLogEventInputSchema,
  skillTraceServerUrl,
  type SkillLogEventInput,
} from './lib/skilltrace-mcp'
import {
  ProbeDeduper,
  buildProbeReadEvent,
  discoverProbeConfig,
  isWatchedSkillPath,
  parseOpenSnoopPath,
} from './lib/skilltrace-probe'

const RUN_ID = mcpRunId({
  runId: process.env.SKILLTRACE_RUN_ID,
  runStem: process.env.SKILLTRACE_RUN_STEM ?? 'run_skilltrace_probe',
})
const SERVER_URL = skillTraceServerUrl({
  server: process.env.SKILLTRACE_SERVER,
})

async function main() {
  let config = discoverProbeConfig({
    targetRoot: process.env.SKILLTRACE_TARGET_ROOT,
    initCwd: process.env.INIT_CWD,
    pwd: process.env.PWD,
    cwd: process.cwd(),
  })

  if (!RUN_ID) {
    throw new Error('Missing SkillTrace run ID')
  }
  if (!config) {
    throw new Error(
      'Missing target repo. Start Codex from a repo with .skilltrace.json or .skills, or set SKILLTRACE_TARGET_ROOT.',
    )
  }

  let probe = startOpenSnoopProbe({
    runId: RUN_ID,
    serverUrl: SERVER_URL,
    targetRoot: config.targetRoot,
    skillRoots: config.skillRoots,
  })
  let server = createMcpServer(RUN_ID, SERVER_URL)
  let transport = new StdioServerTransport()

  bindCleanup(probe)

  await server.connect(transport)

  console.error('SkillTrace probe MCP server running on stdio')
  console.error(`SkillTrace server: ${SERVER_URL}`)
  console.error(`SkillTrace run ID: ${RUN_ID}`)
  console.error(`SkillTrace target root: ${config.targetRoot}`)
  console.error(`SkillTrace skill roots: ${config.skillRoots.join(', ')}`)
}

function createMcpServer(runId: string, serverUrl: string) {
  let server = new McpServer({
    name: 'skilltrace-probe-mcp',
    version: '0.1.0',
  })

  server.registerTool(
    'skill_log_event',
    {
      title: 'SkillTrace semantic logger',
      description:
        'Log semantic skill-use declarations to a local SkillTrace probe session.',
      inputSchema: skillLogEventInputSchema,
    },
    async (input) => {
      let event = buildProbeSkillLogEvent(input as SkillLogEventInput, runId)
      let result = await postJson(serverUrl, '/api/skill-log-events', event)

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

  return server
}

function buildProbeSkillLogEvent(input: SkillLogEventInput, runId: string) {
  return buildSkillLogEvent({
    runId,
    eventType: input.event_type,
    skillName: input.skill_name,
    skillVersion: input.skill_version,
    skillPath: input.skill_path,
    skillFileHash: input.skill_file_hash,
    summary: input.summary,
    confidence: input.confidence,
    relatedArtifacts: input.related_artifacts,
    data: input.data,
  })
}

function startOpenSnoopProbe(options: OpenSnoopProbeOptions) {
  assertMacOpenSnoopReady()

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
    throw new Error('skilltrace:probe-mcp currently supports macOS only')
  }

  let which = spawnSync('which', ['opensnoop'], { stdio: 'pipe' })
  if (which.status !== 0) {
    throw new Error('opensnoop was not found on PATH')
  }

  let sudo = spawnSync('sudo', ['-n', 'true'], { stdio: 'pipe' })
  if (sudo.status !== 0) {
    throw new Error('sudo is not ready. Run `sudo -v` before starting Codex.')
  }
}

function bindCleanup(probe: ChildProcess) {
  let cleanup = () => {
    if (!probe.pid || probe.killed) return

    try {
      process.kill(-probe.pid, 'SIGTERM')
    } catch {
      probe.kill('SIGTERM')
    }
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

await main()

type OpenSnoopProbeOptions = {
  runId: string
  serverUrl: string
  targetRoot: string
  skillRoots: string[]
}
