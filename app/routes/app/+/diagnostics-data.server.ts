import { spawn } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getTraceSession } from '~/models/.server/trace-session'
import {
  parseGeminiArgs,
  parseGeminiCommand,
  parseMcpValue,
} from './diagnostics-mcp'

const MCP_CHECK_TIMEOUT_MS = 8000

export async function getDiagnosticsData() {
  let state = readDaemonState()
  let server = process.env.SKILLTRACE_SERVER || defaultServerUrl()
  let session = getTraceSession() ?? null
  let mode = process.env.SKILLTRACE_DEV === '1' ? 'dev' : 'package'
  let mcp = await readMcpStatuses(mode)

  return {
    daemon: state,
    server,
    session,
    mcp,
    process: {
      pid: process.pid,
      platform: process.platform,
      node: process.version,
      mode,
      port: process.env.PORT || new URL(server).port || '7555',
      host: process.env.HOST || '127.0.0.1',
    },
    checks: {
      daemon_pid: state?.pid ? processStatus(state.pid) : 'missing',
      shared_probe_pid: state?.shared_probe_pid
        ? processStatus(state.shared_probe_pid)
        : 'missing',
      shared_probe: sharedProbeCheck(state),
      state_matches_server: stateMatchesServer(state, server),
      mcp_registration: mcp.summary.status,
    },
  } satisfies DiagnosticsData
}

export function processStatus(pid: number) {
  try {
    process.kill(pid, 0)
    return 'running'
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'EPERM'
    ) {
      return 'running'
    }
    return 'not running'
  }
}

export function sharedProbeVisible(
  platform: string,
  state: DaemonState | null,
) {
  return (
    platform === 'darwin' ||
    !!state?.shared_probe_requested ||
    !!state?.shared_probe_pid ||
    !!state?.shared_probe_warning
  )
}

function readDaemonState() {
  let filePath = path.join(os.homedir(), '.skilltrace/daemon.json')
  if (!fs.existsSync(filePath)) return null

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as DaemonState
  } catch {
    return null
  }
}

function sharedProbeCheck(state: DaemonState | null) {
  if (!state) {
    return {
      label: 'missing',
      tone: 'warning',
    } satisfies MetricCheck
  }

  if (!state.shared_probe_requested) {
    return {
      label: 'not configured',
      tone: 'neutral',
    } satisfies MetricCheck
  }

  if (state.shared_probe_warning) {
    return {
      label: 'warning',
      tone: 'warning',
    } satisfies MetricCheck
  }

  if (!state.shared_probe_pid) {
    return {
      label: 'missing',
      tone: 'warning',
    } satisfies MetricCheck
  }

  let status = processStatus(state.shared_probe_pid)

  return {
    label: status,
    tone: status === 'running' ? 'success' : 'warning',
  } satisfies MetricCheck
}

function stateMatchesServer(state: DaemonState | null, server: string) {
  if (!state) return false
  if (state.server === server) return true

  let stateUrl = parseUrl(state.server)
  let currentUrl = parseUrl(server)
  if (!stateUrl || !currentUrl) return false

  return (
    stateUrl.protocol === currentUrl.protocol &&
    stateUrl.port === currentUrl.port &&
    loopbackEquivalent(stateUrl.hostname, currentUrl.hostname)
  )
}

function parseUrl(value: string) {
  try {
    return new URL(value)
  } catch {
    return null
  }
}

function loopbackEquivalent(left: string, right: string) {
  if (left === right) return true
  let loopbacks = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1'])
  return loopbacks.has(left) && loopbacks.has(right)
}

function defaultServerUrl() {
  let port =
    process.env.PORT || (process.env.SKILLTRACE_DEV === '1' ? '5777' : '7555')
  let host = process.env.HOST || '127.0.0.1'
  let displayHost = host === '0.0.0.0' ? '127.0.0.1' : host

  return `http://${displayHost}:${port}`
}

async function readMcpStatuses(mode: string): Promise<McpStatusReport> {
  let clients = await Promise.all([
    readCodexMcpStatus(mode),
    readClaudeMcpStatus(mode),
    readGeminiMcpStatus(mode),
  ])

  return {
    clients,
    summary: summarizeMcpStatuses(clients),
  }
}

function summarizeMcpStatuses(clients: McpClientStatus[]) {
  let installed = clients.filter((client) => client.cli_installed)
  let ok = installed.filter((client) => client.status === 'ok')
  let warnings = installed.filter((client) => client.status === 'warning')
  let timeouts = installed.filter((client) => client.status === 'timeout')

  if (warnings.length > 0) {
    return {
      status: 'warning',
      label: `${ok.length}/${installed.length} ok`,
      tone: 'warning',
    } satisfies McpSummary
  }

  if (installed.length === 0) {
    return {
      status: 'missing',
      label: 'no CLI found',
      tone: 'neutral',
    } satisfies McpSummary
  }

  if (timeouts.length > 0) {
    return {
      status: 'timeout',
      label: `${ok.length}/${installed.length} ok, ${timeouts.length} timeout`,
      tone: 'neutral',
    } satisfies McpSummary
  }

  return {
    status: 'ok',
    label: `${ok.length}/${installed.length} ok`,
    tone: ok.length > 0 ? 'success' : 'neutral',
  } satisfies McpSummary
}

async function readCodexMcpStatus(mode: string) {
  let expectedCommands = expectedMcpCommands(mode)
  let result = await runMcpCheck('codex', ['mcp', 'get', 'skilltrace'])
  let base = mcpStatusBase('codex', 'Codex', expectedCommands, result)

  if (result.error) {
    if (result.timed_out) {
      return {
        ...base,
        status: 'timeout',
        message: 'MCP registration check timed out; run the check manually',
        cli_installed: true,
      } satisfies McpClientStatus
    }

    return {
      ...base,
      status: result.error.message.includes('ENOENT') ? 'missing' : 'warning',
      message: result.error.message,
      cli_installed: result.error.message.includes('ENOENT') ? false : true,
    } satisfies McpClientStatus
  }

  if (result.status !== 0) {
    return {
      ...base,
      status: 'warning',
      message: 'skilltrace MCP server is not registered',
      cli_installed: true,
    } satisfies McpClientStatus
  }

  let command = parseMcpValue(result.output, 'command')
  let args = parseMcpValue(result.output, 'args')
  let matches = command
    ? expectedCommands.includes(command) && args === 'mcp'
    : false
  let wrapperWarning = devWrapperWarning(mode, command)

  return {
    ...base,
    status: matches && !wrapperWarning ? 'ok' : 'warning',
    message: wrapperWarning
      ? wrapperWarning
      : matches
        ? 'skilltrace MCP registration matches this mode'
        : 'skilltrace MCP registration does not match this mode',
    cli_installed: true,
    registered: true,
    command,
    args,
  } satisfies McpClientStatus
}

async function readClaudeMcpStatus(mode: string) {
  let expectedCommands = expectedMcpCommands(mode)
  let result = await runMcpCheck('claude', ['mcp', 'get', 'skilltrace'])
  let base = mcpStatusBase('claude', 'Claude Code', expectedCommands, result)

  if (result.error) {
    if (result.timed_out) {
      return {
        ...base,
        status: 'timeout',
        message: 'MCP registration check timed out; run the check manually',
        cli_installed: true,
      } satisfies McpClientStatus
    }

    return {
      ...base,
      status: result.error.message.includes('ENOENT') ? 'missing' : 'warning',
      message: result.error.message,
      cli_installed: result.error.message.includes('ENOENT') ? false : true,
    } satisfies McpClientStatus
  }

  if (result.status !== 0) {
    return {
      ...base,
      status: 'warning',
      message: 'skilltrace MCP server is not registered',
      cli_installed: true,
    } satisfies McpClientStatus
  }

  let command = parseMcpValue(result.output, 'command')
  let args = parseMcpValue(result.output, 'args')
  let matches = command
    ? expectedCommands.includes(command) && args === 'mcp'
    : false
  let wrapperWarning = devWrapperWarning(mode, command)

  return {
    ...base,
    status: matches && !wrapperWarning ? 'ok' : 'warning',
    message: wrapperWarning
      ? wrapperWarning
      : matches
        ? 'skilltrace MCP registration matches this mode'
        : 'skilltrace MCP registration does not match this mode',
    cli_installed: true,
    registered: true,
    command,
    args,
  } satisfies McpClientStatus
}

async function readGeminiMcpStatus(mode: string) {
  let expectedCommands = expectedMcpCommands(mode)
  let result = await runMcpCheck('gemini', ['mcp', 'list'])
  let base = mcpStatusBase('gemini', 'Gemini CLI', expectedCommands, result)

  if (result.error) {
    if (result.timed_out) {
      return {
        ...base,
        status: 'timeout',
        message:
          'MCP registration check timed out; run `gemini mcp list` manually',
        cli_installed: true,
      } satisfies McpClientStatus
    }

    return {
      ...base,
      status: result.error.message.includes('ENOENT') ? 'missing' : 'warning',
      message: result.error.message,
      cli_installed: result.error.message.includes('ENOENT') ? false : true,
    } satisfies McpClientStatus
  }

  if (result.status !== 0) {
    return {
      ...base,
      status: 'warning',
      message: 'could not read Gemini MCP registration',
      cli_installed: true,
    } satisfies McpClientStatus
  }

  let registered = /\bskilltrace\b/i.test(result.output)
  if (!registered) {
    return {
      ...base,
      status: 'warning',
      message: 'skilltrace MCP server is not registered',
      cli_installed: true,
    } satisfies McpClientStatus
  }

  let command =
    parseMcpValue(result.output, 'command') ?? parseGeminiCommand(result.output)
  let args =
    parseMcpValue(result.output, 'args') ?? parseGeminiArgs(result.output)
  let matches =
    ((command ? expectedCommands.includes(command) : false) ||
      expectedCommands.some((item) => result.output.includes(item))) &&
    (args === 'mcp' || /\bmcp\b/.test(result.output))
  let wrapperWarning = devWrapperWarning(mode, command)

  return {
    ...base,
    status: matches && !wrapperWarning ? 'ok' : 'warning',
    message: wrapperWarning
      ? wrapperWarning
      : matches
        ? 'skilltrace MCP registration appears to match this mode'
        : 'skilltrace MCP registration could not be confirmed for this mode',
    cli_installed: true,
    registered: true,
    command,
    args,
  } satisfies McpClientStatus
}

function runMcpCheck(command: string, args: string[]): Promise<McpCheckResult> {
  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    let child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill('SIGTERM')
      resolve({
        error: new Error(`Command timed out after ${MCP_CHECK_TIMEOUT_MS}ms`),
        status: null,
        timed_out: true,
        output: mcpCheckOutput(stderr, stdout),
        check_command: [command, ...args].join(' '),
      })
    }, MCP_CHECK_TIMEOUT_MS)

    child.stdout?.setEncoding('utf8')
    child.stderr?.setEncoding('utf8')
    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.stderr?.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        error,
        status: null,
        output: mcpCheckOutput(stderr, stdout),
        check_command: [command, ...args].join(' '),
      })
    })
    child.on('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({
        status: code,
        output: mcpCheckOutput(stderr, stdout),
        check_command: [command, ...args].join(' '),
      })
    })
  })
}

function mcpCheckOutput(stderr: string, stdout: string) {
  return [stderr, stdout].filter(Boolean).join('\n').trim()
}

function expectedMcpCommands(mode: string) {
  return mode === 'dev' ? ['skilltrace-dev'] : ['skilltrace']
}

function devWrapperWarning(mode: string, command: string | null) {
  if (mode !== 'dev' || !command) return null
  if (command !== 'skilltrace-dev') return null

  let filePath = path.join(os.homedir(), '.skilltrace/bin', command)
  if (!fs.existsSync(filePath)) {
    return `${command} wrapper is missing; run pnpm skilltrace:install`
  }

  let content = fs.readFileSync(filePath, 'utf8')
  if (!isCurrentDevWrapper(content)) {
    return `${command} wrapper looks stale; run pnpm skilltrace:install`
  }

  return null
}

function isCurrentDevWrapper(content: string) {
  return (
    content.includes('# Generated by SkillTrace.') &&
    content.includes('SKILLTRACE_TARGET_ROOT="$(pwd -P') &&
    content.includes(process.cwd()) &&
    content.includes('scripts/traceskill.ts')
  )
}

function mcpStatusBase(
  key: string,
  name: string,
  expectedCommands: string[],
  result: McpCheckResult,
) {
  return {
    key,
    name,
    status: 'warning',
    message: 'not checked',
    cli_installed: false,
    registered: false,
    expected_command: expectedCommands.join(' or '),
    command: null,
    args: null,
    output: result.output,
    check_command: result.check_command,
  } satisfies McpClientStatus
}

export type DiagnosticsData = {
  daemon: DaemonState | null
  server: string
  session: TraceSession | null
  mcp: McpStatusReport
  process: ProcessInfo
  checks: Checks
}

export type DaemonState = {
  pid: number
  server: string
  bind_host?: string
  bind_port?: string
  ui_urls?: string[]
  log_path: string
  started_at: string
  shared_probe_requested?: boolean
  shared_probe_pid?: number
  shared_probe_log_path?: string
  shared_probe_platform?: string
  shared_probe_warning?: string
  shared_probe_blocks_run_probe?: boolean
}

export type TraceSession = {
  run_id: string
  target_root: string
  started_at: string
  probe_pid?: number
  probe_log_path?: string
  probe_kind?: string
}

export type ProcessInfo = {
  pid: number
  platform: string
  node: string
  mode: string
  port: string
  host: string
}

export type Checks = {
  daemon_pid: string
  shared_probe_pid: string
  shared_probe: MetricCheck
  state_matches_server: boolean
  mcp_registration: string
}

export type MetricCheck = {
  label: string
  tone: 'neutral' | 'success' | 'warning'
}

export type McpStatusReport = {
  clients: McpClientStatus[]
  summary: McpSummary
}

export type McpSummary = {
  status: 'ok' | 'warning' | 'missing' | 'timeout'
  label: string
  tone: 'neutral' | 'success' | 'warning'
}

export type McpClientStatus = {
  key: string
  name: string
  status: 'ok' | 'warning' | 'missing' | 'timeout'
  message: string
  cli_installed: boolean
  registered: boolean
  expected_command: string
  command: string | null
  args: string | null
  output: string
  check_command: string
}

type McpCheckResult = {
  error?: Error
  status: number | null
  timed_out?: boolean
  output: string
  check_command: string
}
