import { Form, Link } from 'react-router'
import { appName } from '~/config/app-name'
import { listRunSummaries } from '~/models/.server/trace'

// Remote/auth mode reference:
// import { requireUser } from '~/.server/auth/middlewares'

export async function loader() {
  // Remote/auth mode reference:
  // requireUser(context)
  let summaries = await listRunSummaries()

  return { summaries }
}

export default function Page({ loaderData }: PageProps) {
  let { summaries } = loaderData

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="space-y-3">
        <p className="badge rounded-full badge-outline">{appName}</p>
        <div className="space-y-1">
          <h1 className="text-4xl font-bold text-balance">Runs</h1>
          <p className="text-base-content/70">
            {summaries.length} observed run
            {summaries.length === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      {summaries.length > 0 ? (
        <section className="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Status</th>
                  <th>Result</th>
                  <th>Model</th>
                  <th>Events</th>
                  <th>Sources</th>
                  <th>Last event</th>
                  <th>Attempt</th>
                </tr>
              </thead>
              <tbody>
                {summaries.map((summary) => (
                  <RunRow key={summary.run.id} summary={summary} />
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <section className="rounded-box border border-dashed border-base-300 bg-base-100 p-8 text-center text-base-content/60">
          No runs recorded yet.
        </section>
      )}
    </main>
  )
}

function RunRow({ summary }: RunRowProps) {
  let run = summary.run
  let label = run.name || run.public_id

  return (
    <tr>
      <td>
        <Link
          className="link link-hover font-medium"
          to={`/app/runs/${run.public_id}`}
        >
          {label}
        </Link>
        {run.description ? (
          <div className="mt-1 max-w-md truncate text-xs text-base-content/60">
            {run.description}
          </div>
        ) : null}
      </td>
      <td>
        <span className="badge badge-neutral badge-outline">
          {run.status}
        </span>
      </td>
      <td>
        <ResultBadge result={summary.result} />
      </td>
      <td>
        <ModelCell context={summary.context} />
      </td>
      <td>{summary.event_count}</td>
      <td>
        <SourceList sources={summary.sources} />
      </td>
      <td>
        <div className="space-y-1">
          <div className="font-medium">
            {summary.last_event_type || 'No events'}
          </div>
          <div className="text-xs text-base-content/60">
            {formatDate(summary.last_event_at)}
          </div>
        </div>
      </td>
      <td>
        <Form action={`/app/runs/${run.public_id}`} method="post">
          <button className="btn btn-xs btn-outline" type="submit">
            Start new attempt
          </button>
        </Form>
      </td>
    </tr>
  )
}

function ResultBadge({ result }: ResultBadgeProps) {
  let className =
    result === 'pass'
      ? 'badge-success'
      : result === 'warning'
        ? 'badge-warning'
        : result === 'incomplete'
          ? 'badge-info'
          : 'badge-ghost'

  return <span className={`badge ${className}`}>{result}</span>
}

function ModelCell({ context }: ModelCellProps) {
  let model = context?.model
  if (!model || typeof model !== 'string') {
    return <span className="text-base-content/50">—</span>
  }

  return <span className="font-mono text-xs">{model}</span>
}

function SourceList({ sources }: SourceListProps) {
  if (sources.length === 0) {
    return <span className="text-base-content/50">None</span>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {sources.map((source) => (
        <span className="badge badge-ghost" key={source}>
          {source}
        </span>
      ))}
    </div>
  )
}

function formatDate(value?: Date | string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

type PageProps = {
  loaderData: {
    summaries: any[]
  }
}

type RunRowProps = {
  summary: any
}

type ResultBadgeProps = {
  result: 'pass' | 'warning' | 'incomplete' | 'unknown'
}

type ModelCellProps = {
  context?: Record<string, any> | null
}

type SourceListProps = {
  sources: string[]
}
