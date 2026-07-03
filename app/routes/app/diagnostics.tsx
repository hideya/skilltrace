import { getDiagnosticsData } from './+/diagnostics-data.server'
import { AnimatedDisclosure } from '~/ui/animated-disclosure'

export async function loader() {
  return await getDiagnosticsData()
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
        <Metric label="MCP" tone={mcp.summary.tone} value={mcp.summary.label} />
        <Metric
          label="Active Session"
          tone={session ? 'running' : 'neutral'}
          value={session ? session.target_root : 'no active session'}
        />
      </section>

      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Panel
          description="State written by skilltrace daemon start."
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
      <div className="space-y-3">
        {mcp.clients.map((client) => (
          <AnimatedDisclosure
            childrenClassName="space-y-3 border-t border-base-300 p-3"
            className="rounded-box border border-base-300"
            header={
              <>
                <div className="min-w-0">
                  <h3 className="font-normal">{client.name}</h3>
                  {/* <p className="truncate text-xs text-base-content/60">
                    {client.message}
                  </p> */}
                </div>
                <span className={`badge badge-sm ${mcpStatusBadge(client)}`}>
                  {client.status}
                </span>
              </>
            }
            headerClassName="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-3 text-left"
            key={client.key}
          >
            <p className="text-sm font-semibold text-base-content/70">
              {client.message}
            </p>
            <KeyValues
              rows={[
                ['Check', client.check_command],
                [
                  'Expected',
                  `${client.expected_command} ${client.expected_args}`,
                ],
                ['CLI installed', client.cli_installed ? 'yes' : 'no'],
                ['Registered', client.registered ? 'yes' : 'no'],
                ['Command', client.command ?? 'unknown'],
                ['Args', client.args ?? 'unknown'],
              ]}
            />
            {client.output ? (
              <AnimatedDisclosure
                childrenClassName="border-t border-base-300"
                className="rounded-box border border-base-300"
                header="Output"
                headerClassName="w-full cursor-pointer px-3 py-2 text-left text-sm font-medium"
              >
                <pre className="max-h-48 overflow-auto bg-base-200 p-3 text-xs whitespace-pre-wrap">
                  {client.output}
                </pre>
              </AnimatedDisclosure>
            ) : null}
          </AnimatedDisclosure>
        ))}
      </div>
    </Panel>
  )
}

function mcpStatusBadge(client: McpClientStatus) {
  if (client.status === 'ok') return 'badge-success'
  if (client.status === 'missing' || client.status === 'timeout') {
    return 'badge-outline'
  }
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

function processStatus(pid: number) {
  if (typeof process === 'undefined' || typeof process.kill !== 'function') {
    return pid ? 'attached' : 'missing'
  }

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

function sharedProbeVisible(platform: string, state: any) {
  return (
    platform === 'darwin' ||
    !!state?.shared_probe_requested ||
    !!state?.shared_probe_pid ||
    !!state?.shared_probe_warning
  )
}

function formatDate(value?: string) {
  if (!value) return 'unknown'
  return new Date(value).toLocaleString()
}

type PageProps = {
  loaderData: any
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

type McpStatusReport = {
  clients: McpClientStatus[]
  summary: {
    status: string
    label: string
    tone: string
  }
}

type McpClientStatus = {
  key: string
  name: string
  status: string
  message: string
  cli_installed: boolean
  registered: boolean
  expected_command: string
  expected_args: string
  command: string | null
  args: string | null
  output: string
  check_command: string
}
