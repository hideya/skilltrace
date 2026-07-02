import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getTraceSession } from '~/models/.server/trace-session'

const MCP_CHECK_TIMEOUT_MS = 8000

export async function loader() {
  let state = readDaemonState()
  let server = process.env.SKILLTRACE_SERVER || defaultServerUrl()
  let session = getTraceSession() ?? null
  let mode = process.env.SKILLTRACE_DEV === '1' ? 'dev' : 'package'
  let mcp = readMcpStatuses(mode)

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
  }
}

export default function Page({ loaderData }: PageProps) {
  let { daemon, server, session, process, checks, mcp } = loaderData
  let showSharedProbe = sharedProbeVisible(process.platform, daemon)

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pt-10 pb-40">
      <header className="space-y-3">
        <p className="badge rounded-full badge-outline">Diagnostics</p>
        <div className="space-y-1">
          <h1 className="page-title">Daemon Status</h1>
          <p className="text-base-content/70">
            Read-only view of the local SkillTrace runtime.
          </p>
        </div>
      </header>

      <section
        className={`grid gap-4 ${
          showSharedProbe
            ? 'sm:grid-cols-2 lg:grid-cols-5'
            : 'sm:grid-cols-2 lg:grid-cols-4'
        }`}
      >
        <Metric
          label="Daemon"
          tone={checks.daemon_pid === 'running' ? 'success' : 'warning'}
          value={daemon?.server ?? 'No daemon state.'}
        />
        <Metric
          label="Server"
          tone={checks.state_matches_server ? 'success' : 'warning'}
          value={checks.state_matches_server ? 'running' : 'mismatch'}
        />
        {showSharedProbe ? (
          <Metric
            label="Shared Probe"
            tone={checks.shared_probe.tone}
            value={checks.shared_probe.label}
          />
        ) : null}
        <Metric
          label="MCP"
          tone={mcp.summary.tone}
          value={mcp.summary.label}
        />
        <Metric
          label="Active Session"
          tone={session ? 'running' : 'neutral'}
          value={session ? session.target_root : 'no active session'}
        />
      </section>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Panel
          description="State written by traceskill daemon start."
          title="Daemon"
        >
          {daemon ? (
            <KeyValues
              rows={[
                ['PID', `${daemon.pid} ${checks.daemon_pid}`],
                ['Server', daemon.server],
                [
                  'Bind',
                  `${daemon.bind_host ?? '?'}:${daemon.bind_port ?? '?'}`,
                ],
                ['Started', formatDate(daemon.started_at)],
                ['Log', daemon.log_path],
                [
                  'State matches this UI',
                  checks.state_matches_server ? 'yes' : 'no',
                ],
              ]}
            />
          ) : (
            <EmptyState>No daemon state file found.</EmptyState>
          )}
        </Panel>

        <Panel
          description="Server process currently rendering this page."
          title="Server Process"
        >
          <KeyValues
            rows={[
              ['PID', String(process.pid)],
              ['Mode', process.mode],
              ['Host', process.host],
              ['Port', process.port],
              ['Platform', process.platform],
              ['Node', process.node],
            ]}
          />
        </Panel>

        {showSharedProbe ? (
          <Panel
            description="Daemon-owned passive probe status."
            title="Shared Probe"
          >
            {daemon?.shared_probe_requested ? (
              <KeyValues
                rows={[
                  ['Requested', 'yes'],
                  [
                    'PID',
                    daemon.shared_probe_pid
                      ? `${daemon.shared_probe_pid} ${checks.shared_probe_pid}`
                      : 'missing',
                  ],
                  ['Platform', daemon.shared_probe_platform ?? 'unknown'],
                  ['Log', daemon.shared_probe_log_path ?? 'none'],
                  ['Warning', daemon.shared_probe_warning ?? 'none'],
                ]}
              />
            ) : (
              <EmptyState>
                Shared probe is not configured for this daemon.
              </EmptyState>
            )}
          </Panel>
        ) : null}

        <McpRegistrationPanel mcp={mcp} />

        <Panel
          description="One active run can be attached at a time."
          title="Active Session"
        >
          {session ? (
            <KeyValues
              rows={[
                ['Run', session.run_id],
                ['Repo', session.target_root],
                ['Started', formatDate(session.started_at)],
                [
                  'Probe',
                  session.probe_pid
                    ? `${session.probe_pid} ${processStatus(session.probe_pid)}`
                    : 'not attached',
                ],
                ['Probe kind', session.probe_kind ?? 'run'],
                ['Probe log', session.probe_log_path ?? 'none'],
              ]}
            />
          ) : (
            <EmptyState>No active SkillTrace session.</EmptyState>
          )}
        </Panel>
      </section>
    </main>
  )
}

function Metric({ label, value, tone = 'neutral' }: MetricProps) {
  let toneClass =
    tone === 'success'
      ? 'badge-success'
      : tone === 'warning'
        ? 'badge-warning'
        : tone === 'running'
          ? 'badge-info'
          : 'badge-outline'

  return (
    <div className="flex flex-col justify-center rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="md: mb-3 flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
        <div className="text-xs tracking-[0.2em] text-base-content/50 uppercase">
          {label}
        </div>
        <div className={`badge badge-sm ${toneClass}`}>{tone}</div>
      </div>
      <div className="font-mono text-sm break-words">{value}</div>
    </div>
  )
}

function Panel({ title, description, children }: PanelProps) {
  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-4 space-y-1">
        <h2 className="section-title">{title}</h2>
        <p className="text-sm text-base-content/60">{description}</p>
      </div>
      {children}
    </section>
  )
}

function McpRegistrationPanel({ mcp }: McpRegistrationPanelProps) {
  return (
    <Panel
      description="Read-only checks of local command-line MCP registration."
      title="MCP Registration"
    >
      <div className="space-y-5">
        {mcp.clients.map((client) => (
          <section className="space-y-3" key={client.key}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{client.name}</h3>
              <span className={`badge badge-sm ${mcpStatusBadge(client)}`}>
                {client.status}
              </span>
            </div>
            <KeyValues
              rows={[
                ['Status', client.message],
                ['Check', client.check_command],
                ['Expected', `${client.expected_command} mcp`],
                ['CLI installed', client.cli_installed ? 'yes' : 'no'],
                ['Registered', client.registered ? 'yes' : 'no'],
                ['Command', client.command ?? 'unknown'],
                ['Args', client.args ?? 'unknown'],
              ]}
            />
            {client.output ? (
              <details className="rounded-box border border-base-300">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold">
                  Output
                </summary>
                <pre className="max-h-48 overflow-auto border-t border-base-300 bg-base-200 p-3 text-xs whitespace-pre-wrap">
                  {client.output}
                </pre>
              </details>
            ) : null}
          </section>
        ))}
      </div>
    </Panel>
  )
}

function mcpStatusBadge(client: McpClientStatus) {
  if (client.status === 'ok') return 'badge-success'
  if (client.status === 'missing') return 'badge-outline'
  return 'badge-warning'
}

function KeyValues({ rows }: KeyValuesProps) {
  return (
    <dl className="grid gap-3 text-sm">
      {rows.map(([label, value]) => (
        <div
          className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]"
          key={label}
        >
          <dt className="text-base-content/50">{label}</dt>
          <dd className="min-w-0 font-mono text-xs break-words">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function EmptyState({ children }: EmptyStateProps) {
  return (
    <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
      {children}
    </div>
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

function processStatus(pid: number) {
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

function sharedProbeVisible(platform: string, state: DaemonState | null) {
  return (
    platform === 'darwin' ||
    !!state?.shared_probe_requested ||
    !!state?.shared_probe_pid ||
    !!state?.shared_probe_warning
  )
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

function readMcpStatuses(mode: string): McpStatusReport {
  let clients = [
    readCodexMcpStatus(mode),
    readClaudeMcpStatus(mode),
    readGeminiMcpStatus(mode),
  ]

  return {
    clients,
    summary: summarizeMcpStatuses(clients),
  }
}

function summarizeMcpStatuses(clients: McpClientStatus[]) {
  let installed = clients.filter((client) => client.cli_installed)
  let ok = installed.filter((client) => client.status === 'ok')
  let warnings = installed.filter((client) => client.status === 'warning')

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

  return {
    status: 'ok',
    label: `${ok.length}/${installed.length} ok`,
    tone: ok.length > 0 ? 'success' : 'neutral',
  } satisfies McpSummary
}

function readCodexMcpStatus(mode: string) {
  let expectedCommand = mode === 'dev' ? 'traceskill-dev' : 'traceskill'
  let result = runMcpCheck('codex', ['mcp', 'get', 'skilltrace'])
  let base = mcpStatusBase('codex', 'Codex', expectedCommand, result)

  if (result.error) {
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
  let matches = command === expectedCommand && args === 'mcp'

  return {
    ...base,
    status: matches ? 'ok' : 'warning',
    message: matches
      ? 'skilltrace MCP registration matches this mode'
      : 'skilltrace MCP registration does not match this mode',
    cli_installed: true,
    registered: true,
    command,
    args,
  } satisfies McpClientStatus
}

function readClaudeMcpStatus(mode: string) {
  let expectedCommand = mode === 'dev' ? 'traceskill-dev' : 'traceskill'
  let result = runMcpCheck('claude', ['mcp', 'get', 'skilltrace'])
  let base = mcpStatusBase('claude', 'Claude Code', expectedCommand, result)

  if (result.error) {
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
  let matches = command === expectedCommand && args === 'mcp'

  return {
    ...base,
    status: matches ? 'ok' : 'warning',
    message: matches
      ? 'skilltrace MCP registration matches this mode'
      : 'skilltrace MCP registration does not match this mode',
    cli_installed: true,
    registered: true,
    command,
    args,
  } satisfies McpClientStatus
}

function readGeminiMcpStatus(mode: string) {
  let expectedCommand = mode === 'dev' ? 'traceskill-dev' : 'traceskill'
  let result = runMcpCheck('gemini', ['mcp', 'list'])
  let base = mcpStatusBase('gemini', 'Gemini CLI', expectedCommand, result)

  if (result.error) {
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

  let command = parseMcpValue(result.output, 'command') ?? parseGeminiCommand(result.output)
  let args = parseMcpValue(result.output, 'args') ?? parseGeminiArgs(result.output)
  let matches =
    (command === expectedCommand || result.output.includes(expectedCommand)) &&
    (args === 'mcp' || /\bmcp\b/.test(result.output))

  return {
    ...base,
    status: matches ? 'ok' : 'warning',
    message: matches
      ? 'skilltrace MCP registration appears to match this mode'
      : 'skilltrace MCP registration could not be confirmed for this mode',
    cli_installed: true,
    registered: true,
    command,
    args,
  } satisfies McpClientStatus
}

function runMcpCheck(command: string, args: string[]) {
  let result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: MCP_CHECK_TIMEOUT_MS,
  })
  let output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()

  return {
    ...result,
    output,
    check_command: [command, ...args].join(' '),
  }
}

function mcpStatusBase(
  key: string,
  name: string,
  expectedCommand: string,
  result: McpCheckResult,
) {
  return {
    key,
    name,
    status: 'warning',
    message: 'not checked',
    cli_installed: false,
    registered: false,
    expected_command: expectedCommand,
    command: null,
    args: null,
    output: result.output,
    check_command: result.check_command,
  } satisfies McpClientStatus
}

function parseMcpValue(output: string, key: string) {
  let prefix = `${key}:`.toLowerCase()
  let line = output
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith(prefix))

  return line?.slice(prefix.length).trim() || null
}

function parseGeminiCommand(output: string) {
  if (/\btraceskill-dev\b/.test(output)) return 'traceskill-dev'
  if (/\btraceskill\b/.test(output)) return 'traceskill'
  return null
}

function parseGeminiArgs(output: string) {
  return /\bmcp\b/.test(output) ? 'mcp' : null
}

function formatDate(value?: string) {
  if (!value) return 'unknown'
  return new Date(value).toLocaleString()
}

type PageProps = {
  loaderData: {
    daemon: DaemonState | null
    server: string
    session: TraceSession | null
    mcp: McpStatusReport
    process: ProcessInfo
    checks: Checks
  }
}

type MetricProps = {
  label: string
  value: string
  tone?: 'neutral' | 'success' | 'warning' | 'running'
}

type PanelProps = {
  title: string
  description: string
  children: any
}

type McpRegistrationPanelProps = {
  mcp: McpStatusReport
}

type KeyValuesProps = {
  rows: [string, string][]
}

type EmptyStateProps = {
  children: any
}

type DaemonState = {
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

type TraceSession = {
  run_id: string
  target_root: string
  started_at: string
  probe_pid?: number
  probe_log_path?: string
  probe_kind?: string
}

type ProcessInfo = {
  pid: number
  platform: string
  node: string
  mode: string
  port: string
  host: string
}

type Checks = {
  daemon_pid: string
  shared_probe_pid: string
  shared_probe: MetricCheck
  state_matches_server: boolean
  mcp_registration: string
}

type MetricCheck = {
  label: string
  tone: 'neutral' | 'success' | 'warning'
}

type McpStatusReport = {
  clients: McpClientStatus[]
  summary: McpSummary
}

type McpSummary = {
  status: 'ok' | 'warning' | 'missing'
  label: string
  tone: 'neutral' | 'success' | 'warning'
}

type McpClientStatus = {
  key: string
  name: string
  status: 'ok' | 'warning' | 'missing'
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
  output: string
  check_command: string
}
