import { ChevronLeftIcon } from 'lucide-react'
import { Link } from 'react-router'
import { traceModeLabel } from '~/lib/trace-mode'
import { getModeComparisonForRuns } from '~/models/.server/trace'
import { AgentLogDot } from './+/agent-log-dot'

// Remote/auth mode reference:
// import { requireUser } from '~/.server/auth/middlewares'

export async function loader({ request }) {
  // Remote/auth mode reference:
  // requireUser(context)
  let url = new URL(request.url)
  let runIds = (url.searchParams.get('runs') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  let comparison = await getModeComparisonForRuns(runIds)
  return { comparison }
}

export default function Page({ loaderData }: PageProps) {
  let { comparison } = loaderData
  let hasDifferences = comparison.rows.some((row) => row.status === 'different')

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 pt-10 pb-40">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-row items-center gap-2">
              <Link
                className="link rounded-full bg-primary text-white link-hover"
                to="/app/runs"
              >
                <ChevronLeftIcon className="size-10" />
              </Link>
              <div className="badge rounded-full badge-outline">
                Compare Modes
              </div>
            </div>

            <h1 className="page-title break-words">
              {comparison.group_label}
            </h1>
            {comparison.target_root ? (
              <p className="font-mono text-xs break-all text-base-content/60">
                {comparison.target_root}
              </p>
            ) : null}
          </div>
          {comparison.is_valid ? (
            <span
              className={`badge badge-lg ${hasDifferences ? 'badge-warning' : 'badge-success'}`}
            >
              {hasDifferences ? 'Different' : 'Aligned'}
            </span>
          ) : (
            <span className="badge badge-lg badge-warning">Not applicable</span>
          )}
        </div>
      </header>

      {comparison.is_valid ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {comparison.runs.map((run) => (
              <RunCard item={run} key={run.trace_mode} />
            ))}
          </section>

          <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="section-title">Cross-mode files</h2>
                <p className="text-sm text-base-content/60">
                  Selected successful runs, compared by normalized skill and
                  reference files, with advisory Agent log observations.
                </p>
              </div>
              <p className="text-sm text-base-content/60">
                {comparison.rows.length} file
                {comparison.rows.length === 1 ? '' : 's'}
              </p>
            </div>

            {comparison.rows.length > 0 ? (
              <ComparisonTable comparison={comparison} />
            ) : (
              <div className="rounded-box border border-dashed border-base-300 p-6 text-center text-base-content/60">
                No comparable files found.
              </div>
            )}
          </section>
        </>
      ) : (
        <InvalidSelection reasons={comparison.invalid_reasons} />
      )}
    </main>
  )
}

function ComparisonTable({ comparison }: ComparisonTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>File</th>
            <th className="text-center">Kind</th>
            {comparison.modes.map((mode) => (
              <th className="text-center" key={mode}>
                {traceModeLabel(mode)}
              </th>
            ))}
            <th className="text-center">Result</th>
          </tr>
        </thead>
        <tbody>
          {comparison.rows.map((row) => (
            <tr className={rowClass(row)} key={`${row.kind}:${row.file}`}>
              <td className="min-w-72 font-mono text-xs break-words">
                {row.file}
              </td>
              <td className="text-center">
                <span className="badge badge-outline">{row.kind}</span>
              </td>
              {comparison.modes.map((mode) => (
                <td className="text-center" key={mode}>
                  <ModeCell cell={row.modes[mode]} mode={mode} />
                </td>
              ))}
              <td className="text-center">
                <span
                  className={`badge ${row.status === 'aligned' ? 'badge-success' : 'badge-warning'}`}
                >
                  {row.status === 'aligned' ? 'Aligned' : 'Different'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function InvalidSelection({ reasons }: InvalidSelectionProps) {
  return (
    <section className="rounded-box border border-warning/40 bg-warning/10 p-6">
      <h2 className="section-title">Selection not applicable</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-sm">
        {reasons.length > 0 ? (
          reasons.map((reason) => <li key={reason}>{reason}</li>)
        ) : (
          <li>Select at least two successful runs with different modes.</li>
        )}
      </ul>
      <Link className="btn mt-5 btn-outline btn-sm" to="/app/runs">
        Back to runs
      </Link>
    </section>
  )
}

function RunCard({ item }: RunCardProps) {
  let run = item.run

  return (
    <Link
      className="block rounded-box border border-base-300 bg-base-100 p-4 shadow-sm transition-colors hover:bg-base-200/70 focus:ring-2 focus:ring-primary focus:outline-none"
      reloadDocument
      to={`/app/runs/${run.public_id}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="badge badge-outline">
          {traceModeLabel(item.trace_mode)}
        </span>
        <span className={`badge ${resultBadgeClass(item.trace_mode)}`}>
          {item.trace_mode === 'passive_only' ? 'Captured' : 'Pass'}
        </span>
      </div>
      <div className="font-mono text-sm font-semibold break-words">
        {run.name || run.public_id}
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-base-content/50">Events</dt>
          <dd className="font-mono">{item.event_count}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-base-content/50">Started</dt>
          <dd className="font-mono text-xs">{formatTime(item.started_at)}</dd>
        </div>
      </dl>
    </Link>
  )
}

function ModeCell({ cell, mode }: ModeCellProps) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      {cell?.present ? (
        <>
          <EvidenceDot active={cell.passive} label="Passive" tone="passive" />
          {mode === 'full' ? (
            <EvidenceDot
              active={cell.semantic}
              label="Semantic"
              tone="semantic"
            />
          ) : null}
          {mode !== 'passive_only' ? (
            <EvidenceDot
              active={cell.reflection}
              label="Reflection"
              tone="semantic"
            />
          ) : null}
        </>
      ) : (
        <span className="text-base-content/40">missing</span>
      )}
      <AgentLogDot
        active={cell?.provider}
        context={cell?.provider_context}
        status={cell?.provider_status}
      />
    </div>
  )
}

function EvidenceDot({ active, label, tone }: EvidenceDotProps) {
  let className = active
    ? tone === 'semantic'
      ? 'bg-indigo-500'
      : 'bg-teal-500'
    : 'bg-base-300'

  return (
    <span
      aria-label={`${label}: ${active ? 'present' : 'missing'}`}
      className={`inline-block size-3 rounded-full ${className}`}
      title={`${label}: ${active ? 'present' : 'missing'}`}
    />
  )
}

function resultBadgeClass(mode: string) {
  if (mode === 'passive_only') {
    return 'badge-outline border-teal-500 text-teal-600'
  }

  return 'badge-success'
}

function rowClass(row: any) {
  if (row.status === 'different') return 'bg-warning/20'
  return ''
}

function formatTime(value?: string | Date | null) {
  if (!value) return '-'

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

type PageProps = {
  loaderData: {
    comparison: any
  }
}

type ComparisonTableProps = {
  comparison: any
}

type InvalidSelectionProps = {
  reasons: string[]
}

type RunCardProps = {
  item: any
}

type ModeCellProps = {
  cell?: {
    present: boolean
    passive: boolean
    semantic: boolean
    reflection: boolean
    provider: boolean
    provider_context: boolean
    provider_status?: string
  }
  mode: string
}

type EvidenceDotProps = {
  active: boolean
  label: string
  tone: 'passive' | 'semantic'
}
