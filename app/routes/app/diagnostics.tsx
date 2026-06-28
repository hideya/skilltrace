import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { getTraceSession } from '~/models/.server/trace-session'

export async function loader() {
  let state = readDaemonState()
  let server = process.env.SKILLTRACE_SERVER || defaultServerUrl()
  let session = getTraceSession() ?? null
  let mode = process.env.SKILLTRACE_DEV === '1' ? 'dev' : 'package'
  let mcp = readCodexMcpStatus(mode)

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
      state_matches_server: state?.server === server,
      mcp_registration: mcp.status,
    },
  }
}

export default function Page({ loaderData }: PageProps) {
  let { daemon, server, session, process, checks, mcp } = loaderData

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="space-y-3">
        <p className="badge rounded-full badge-outline">Diagnostics</p>
        <div className="space-y-1">
          <h1 className="text-4xl font-bold text-balance">Daemon Status</h1>
          <p className="text-base-content/70">
            Read-only view of the local SkillTrace runtime.
          </p>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-4">
        <Metric
          label="Server"
          tone={checks.state_matches_server ? 'success' : 'warning'}
          value={server}
        />
        <Metric
          label="Daemon"
          tone={checks.daemon_pid === 'running' ? 'success' : 'warning'}
          value={checks.daemon_pid}
        />
        <Metric
          label="Mode"
          tone={process.mode === 'dev' ? 'warning' : 'neutral'}
          value={process.mode}
        />
        <Metric
          label="Codex MCP"
          tone={checks.mcp_registration === 'ok' ? 'success' : 'warning'}
          value={checks.mcp_registration}
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Panel
          description="State written by traceskill daemon start."
          title="Daemon"
        >
          {daemon ? (
            <KeyValues
              rows={[
                ['PID', `${daemon.pid} ${checks.daemon_pid}`],
                ['Server', daemon.server],
                ['Bind', `${daemon.bind_host ?? '?'}:${daemon.bind_port ?? '?'}`],
                ['Started', formatDate(daemon.started_at)],
                ['Log', daemon.log_path],
                ['State matches this UI', checks.state_matches_server ? 'yes' : 'no'],
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

        <Panel
          description="Daemon-owned passive probe status."
          title="Shared Probe"
        >
          {daemon?.shared_probe_requested ? (
            <KeyValues
              rows={[
                ['Requested', 'yes'],
                ['PID', daemon.shared_probe_pid
                  ? `${daemon.shared_probe_pid} ${checks.shared_probe_pid}`
                  : 'missing'],
                ['Platform', daemon.shared_probe_platform ?? 'unknown'],
                ['Log', daemon.shared_probe_log_path ?? 'none'],
                ['Warning', daemon.shared_probe_warning ?? 'none'],
              ]}
            />
          ) : (
            <EmptyState>Shared probe is not configured for this daemon.</EmptyState>
          )}
        </Panel>

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
                ['Probe', session.probe_pid
                  ? `${session.probe_pid} ${processStatus(session.probe_pid)}`
                  : 'not attached'],
                ['Probe kind', session.probe_kind ?? 'run'],
                ['Probe log', session.probe_log_path ?? 'none'],
              ]}
            />
          ) : (
            <EmptyState>No active SkillTrace session.</EmptyState>
          )}
        </Panel>

        <Panel
          description="Read-only check of codex mcp get skilltrace."
          title="Codex MCP"
        >
          <KeyValues
            rows={[
              ['Status', mcp.message],
              ['Expected', `${mcp.expected_command} mcp`],
              ['Codex installed', mcp.codex_installed ? 'yes' : 'no'],
              ['Registered', mcp.registered ? 'yes' : 'no'],
              ['Command', mcp.command ?? 'unknown'],
              ['Args', mcp.args ?? 'unknown'],
            ]}
          />
          {mcp.output ? (
            <pre className="mt-4 max-h-48 overflow-auto rounded-box bg-base-200 p-3 text-xs whitespace-pre-wrap">
              {mcp.output}
            </pre>
          ) : null}
        </Panel>
      </section>
    </main>
  )
}

function Metric({ label, value, tone = 'neutral' }: MetricProps) {
  let toneClass = tone === 'success'
    ? 'badge-success'
    : tone === 'warning'
      ? 'badge-warning'
      : 'badge-outline'

  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs tracking-[0.2em] text-base-content/50 uppercase">
          {label}
        </p>
        <span className={`badge badge-sm ${toneClass}`}>{tone}</span>
      </div>
      <p className="font-mono text-sm break-words">{value}</p>
    </div>
  )
}

function Panel({ title, description, children }: PanelProps) {
  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-4 space-y-1">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="text-sm text-base-content/60">{description}</p>
      </div>
      {children}
    </section>
  )
}

function KeyValues({ rows }: KeyValuesProps) {
  return (
    <dl className="grid gap-3 text-sm">
      {rows.map(([label, value]) => (
        <div className="grid gap-1 sm:grid-cols-[8rem_minmax(0,1fr)]" key={label}>
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

function defaultServerUrl() {
  let port = process.env.PORT || (process.env.SKILLTRACE_DEV === '1' ? '5777' : '7555')
  let host = process.env.HOST || '127.0.0.1'
  let displayHost = host === '0.0.0.0' ? '127.0.0.1' : host

  return `http://${displayHost}:${port}`
}

function readCodexMcpStatus(mode: string) {
  let expectedCommand = mode === 'dev' ? 'traceskill-dev' : 'traceskill'
  let result = spawnSync('codex', ['mcp', 'get', 'skilltrace'], {
    encoding: 'utf8',
    timeout: 3000,
  })
  let output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()

  if (result.error) {
    return {
      status: 'warning',
      message: result.error.message,
      codex_installed: result.error.message.includes('ENOENT') ? false : true,
      registered: false,
      expected_command: expectedCommand,
      command: null,
      args: null,
      output,
    } satisfies CodexMcpStatus
  }

  if (result.status !== 0) {
    return {
      status: 'warning',
      message: 'skilltrace MCP server is not registered',
      codex_installed: true,
      registered: false,
      expected_command: expectedCommand,
      command: null,
      args: null,
      output,
    } satisfies CodexMcpStatus
  }

  let command = parseCodexMcpValue(output, 'command')
  let args = parseCodexMcpValue(output, 'args')
  let matches = command === expectedCommand && args === 'mcp'

  return {
    status: matches ? 'ok' : 'warning',
    message: matches
      ? 'skilltrace MCP registration matches this mode'
      : 'skilltrace MCP registration does not match this mode',
    codex_installed: true,
    registered: true,
    expected_command: expectedCommand,
    command,
    args,
    output,
  } satisfies CodexMcpStatus
}

function parseCodexMcpValue(output: string, key: string) {
  let prefix = `${key}:`
  let line = output
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix))

  return line?.slice(prefix.length).trim() || null
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
    mcp: CodexMcpStatus
    process: ProcessInfo
    checks: Checks
  }
}

type MetricProps = {
  label: string
  value: string
  tone?: 'neutral' | 'success' | 'warning'
}

type PanelProps = {
  title: string
  description: string
  children: any
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
  state_matches_server: boolean
  mcp_registration: string
}

type CodexMcpStatus = {
  status: 'ok' | 'warning'
  message: string
  codex_installed: boolean
  registered: boolean
  expected_command: string
  command: string | null
  args: string | null
  output: string
}
