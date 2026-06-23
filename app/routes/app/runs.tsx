import { useEffect, useState } from 'react'
import { Form, Link, redirect } from 'react-router'
import { appName } from '~/config/app-name'
import { payloadFromRequest } from '~/lib/data/payload'
import { deleteRunRecords, listRunSummaries } from '~/models/.server/trace'

// Remote/auth mode reference:
// import { requireUser } from '~/.server/auth/middlewares'

export async function loader() {
  // Remote/auth mode reference:
  // requireUser(context)
  let summaries = await listRunSummaries()

  return { summaries }
}

export async function action({ request }) {
  let payload = await payloadFromRequest(request)
  if (payload.intent !== 'delete') return redirect('/app/runs')

  let ids = Array.isArray(payload.run_ids)
    ? payload.run_ids
    : payload.run_ids
      ? [payload.run_ids]
      : []

  await deleteRunRecords(ids.filter((id) => typeof id === 'string'))
  return redirect('/app/runs')
}

export default function Page({ loaderData }: PageProps) {
  let { summaries } = loaderData
  let [isEditing, setIsEditing] = useState(false)
  let [expandedKeys, setExpandedKeys] = useState<string[]>([])
  let groups = groupSummaries(summaries)

  useEffect(() => {
    setExpandedKeys(readExpandedRunGroups())
  }, [])

  function handleGroupToggle(key: string, isOpen: boolean) {
    setExpandedKeys((current) => {
      let next = isOpen
        ? [...new Set([...current, key])]
        : current.filter((item) => item !== key)

      saveExpandedRunGroups(next)
      return next
    })
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-3">
          <p className="badge rounded-full badge-outline">{appName}</p>
          <div className="space-y-1">
            <h1 className="text-4xl font-bold text-balance">Runs</h1>
            <p className="text-base-content/70">
              {summaries.length} observed run
              {summaries.length === 1 ? '' : 's'} in {groups.length} group
              {groups.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {summaries.length > 0 ? (
          <button
            className={`btn btn-sm ${isEditing ? 'btn-neutral' : 'btn-outline'}`}
            onClick={() => setIsEditing(!isEditing)}
            type="button"
          >
            {isEditing ? 'Done' : 'Edit'}
          </button>
        ) : null}
      </header>

      {summaries.length > 0 ? (
        <section className="space-y-4">
          <Form
            id="delete-runs-form"
            method="post"
            onSubmit={(event) => {
              if (!confirm('Delete selected finished runs?'))
                event.preventDefault()
            }}
          >
            <input name="intent" type="hidden" value="delete" />
          </Form>

          {isEditing ? (
            <div className="flex items-center justify-end gap-2">
              <button
                className="btn btn-sm btn-error"
                form="delete-runs-form"
                type="submit"
              >
                Delete selected
              </button>
            </div>
          ) : null}

          {groups.map((group) => (
            <RunGroup
              group={group}
              isEditing={isEditing}
              isOpen={isEditing || expandedKeys.includes(group.key)}
              key={group.key}
              onToggle={handleGroupToggle}
            />
          ))}
        </section>
      ) : (
        <section className="rounded-box border border-dashed border-base-300 bg-base-100 p-8 text-center text-base-content/60">
          No runs recorded yet.
        </section>
      )}
    </main>
  )
}

function RunGroup({ group, isEditing, isOpen, onToggle }: RunGroupProps) {
  return (
    <details
      className="overflow-hidden rounded-box border border-base-300 bg-base-100 shadow-sm"
      onToggle={(event) => {
        if (!isEditing) onToggle(group.key, event.currentTarget.open)
      }}
      open={isOpen}
    >
      <summary className="flex cursor-pointer items-center justify-between gap-4 bg-base-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="font-semibold break-words">{group.label}</h2>
          <p className="text-xs text-base-content/60">
            {group.summaries.length} run
            {group.summaries.length === 1 ? '' : 's'} · {group.targetRoot}
          </p>
        </div>
        <span className="badge badge-outline">{group.latestStatus}</span>
      </summary>

      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {isEditing ? <th>Select</th> : null}
              <th>Run</th>
              <th className="text-center">Status</th>
              <th className="text-center">Result</th>
              <th className="text-center">Model</th>
              <th className="text-center">Client</th>
              <th>Events</th>
              {/* <th>Sources</th> */}
              {/* <th>Last event</th> */}
              {/* <th>Attempt</th> */}
            </tr>
          </thead>
          <tbody>
            {group.summaries.map((summary) => (
              <RunRow
                isEditing={isEditing}
                key={summary.run.id}
                summary={summary}
              />
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function RunRow({ summary, isEditing }: RunRowProps) {
  let run = summary.run
  let label = run.name || run.public_id

  return (
    <tr>
      {isEditing ? (
        <td>
          <input
            className="checkbox checkbox-sm"
            disabled={run.status === 'active'}
            form="delete-runs-form"
            name="run_ids"
            type="checkbox"
            value={run.public_id}
          />
        </td>
      ) : null}
      <td>
        <Link
          className="link font-medium link-hover"
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
      <td className="text-center">
        <span className="badge badge-outline badge-neutral">{run.status}</span>
      </td>
      <td className="text-center">
        <ResultBadge result={summary.result} />
      </td>
      <td className="text-center">
        <ModelCell context={summary.context} />
      </td>
      <td className="text-center">
        <ClientCell context={summary.context} />
      </td>
      <td className="text-right">{summary.event_count}</td>
      {/* <td>
        <SourceList sources={summary.sources} />
      </td> */}
      {/* <td>
        <div className="space-y-1">
          <div className="font-medium">
            {summary.last_event_type || 'No events'}
          </div>
          <div className="text-xs text-base-content/60">
            {formatDate(summary.last_event_at)}
          </div>
        </div>
      </td> */}
      {/* <td>
        <Form action={`/app/runs/${run.public_id}`} method="post">
          <button className="btn btn-outline btn-xs" type="submit">
            Start new attempt
          </button>
        </Form>
      </td> */}
    </tr>
  )
}

function groupSummaries(summaries: any[]) {
  let groups = new Map<string, RunGroup>()

  for (let summary of summaries) {
    let run = summary.run
    let targetRoot = run.bag?.target_root || run.description || 'unknown target'
    let targetName =
      run.bag?.target_name || targetRoot.split(/[\\/]/).at(-1) || 'repo'
    let pathHash =
      run.bag?.path_hash || pathHashFromRunId(run.public_id) || 'unknown'
    let key = `${targetName}-${pathHash}`
    let group = groups.get(key)

    if (!group) {
      group = {
        key,
        label: key,
        targetRoot,
        latestStatus: run.status,
        summaries: [],
      }
      groups.set(key, group)
    }

    group.summaries.push(summary)
  }

  return [...groups.values()]
}

function pathHashFromRunId(publicId: string) {
  let match = publicId.match(
    /-([A-Za-z0-9_-]{6})-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/,
  )
  return match?.[1]
}

function readExpandedRunGroups() {
  if (typeof window === 'undefined') return []

  let value = window.sessionStorage.getItem(EXPANDED_RUN_GROUPS_KEY)
  if (!value) return []

  try {
    let parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === 'string')
      : []
  } catch {
    return []
  }
}

function saveExpandedRunGroups(keys: string[]) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(EXPANDED_RUN_GROUPS_KEY, JSON.stringify(keys))
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

function ClientCell({ context }: ClientCellProps) {
  let client = context?.client
  if (!client || typeof client !== 'string') {
    return <span className="text-base-content/50">—</span>
  }

  return <span className="text-xs">{client}</span>
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
  isEditing: boolean
}

type RunGroupProps = {
  group: RunGroup
  isEditing: boolean
  isOpen: boolean
  onToggle: (key: string, isOpen: boolean) => void
}

type RunGroup = {
  key: string
  label: string
  targetRoot: string
  latestStatus: string
  summaries: any[]
}

type ResultBadgeProps = {
  result: 'pass' | 'warning' | 'incomplete' | 'unknown'
}

type ModelCellProps = {
  context?: Record<string, any> | null
}

type ClientCellProps = {
  context?: Record<string, any> | null
}

type SourceListProps = {
  sources: string[]
}

const EXPANDED_RUN_GROUPS_KEY = 'skilltrace.expandedRunGroups'
