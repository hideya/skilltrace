import { Link } from 'react-router'
import { requireUser } from '~/.server/auth/middlewares'
import { notFoundError } from '~/lib/.server/errors'
import { getRunTimeline } from '~/models/.server/trace'

export async function loader({ context, params }) {
  requireUser(context)
  if (!params.id) throw notFoundError()

  let timeline = await getRunTimeline(params.id)
  return { timeline }
}

export default function Page({ loaderData }: PageProps) {
  let { timeline } = loaderData
  let run = timeline.run
  let title = run.name || run.public_id

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="space-y-4">
        <Link className="link link-hover text-sm" to="/app/runs">
          Back to runs
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="badge rounded-full badge-outline">Run timeline</p>
            <h1 className="break-words text-4xl font-bold text-balance">
              {title}
            </h1>
            {run.description ? (
              <p className="text-base-content/70">{run.description}</p>
            ) : null}
          </div>

          <div className="rounded-box border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
            <p className="text-xs uppercase tracking-[0.2em] text-base-content/50">
              Events
            </p>
            <p className="text-3xl font-bold">{timeline.events.length}</p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Status" value={run.status} />
        <Metric label="Passive" value={timeline.passive_events.length} />
        <Metric label="Semantic" value={timeline.semantic_events.length} />
      </section>

      <ConsistencyPanel results={timeline.consistency} />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Timeline events={timeline.events} />

        <div className="space-y-6">
          <EventPanel
            title="Passive skill access"
            empty="No passive events recorded."
            events={timeline.passive_events}
          />
          <EventPanel
            title="Semantic declarations"
            empty="No semantic events recorded."
            events={timeline.semantic_events}
          />
        </div>
      </section>
    </main>
  )
}

function ConsistencyPanel({ results }: ConsistencyPanelProps) {
  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Consistency</h2>
          <p className="text-sm text-base-content/60">
            {results.length} check{results.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {results.length > 0 ? (
        <div className="grid gap-3">
          {results.map((result, index) => (
            <div
              className="rounded-box border border-base-300 bg-base-100 p-4"
              key={`${result.skill}-${result.title}-${index}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{result.title}</span>
                    <ConsistencyBadge status={result.status} />
                  </div>
                  <p className="text-sm text-base-content/70">
                    {result.message}
                  </p>
                </div>
                <span className="badge badge-outline">{result.skill}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
          No keyed skill events to check yet.
        </div>
      )}
    </section>
  )
}

function ConsistencyBadge({ status }: ConsistencyBadgeProps) {
  let className =
    status === 'pass'
      ? 'badge-success'
      : status === 'warning'
        ? 'badge-warning'
        : 'badge-info'

  return <span className={`badge ${className}`}>{status}</span>
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
      <p className="text-xs uppercase tracking-[0.2em] text-base-content/50">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  )
}

function Timeline({ events }: TimelineProps) {
  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Timeline</h2>
          <p className="text-sm text-base-content/60">
            {events.length} event{events.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {events.length > 0 ? (
        <ol className="relative space-y-4 before:absolute before:bottom-0 before:left-3 before:top-2 before:w-px before:bg-base-300">
          {events.map((event) => (
            <li className="relative pl-9" key={event.id}>
              <span className="absolute left-1.5 top-2 size-3 rounded-full bg-primary ring-4 ring-base-100" />
              <EventCard event={event} />
            </li>
          ))}
        </ol>
      ) : (
        <div className="rounded-box border border-dashed border-base-300 p-6 text-center text-base-content/60">
          No events recorded.
        </div>
      )}
    </section>
  )
}

function EventPanel({ title, empty, events }: EventPanelProps) {
  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="text-sm text-base-content/60">
          {events.length} event{events.length === 1 ? '' : 's'}
        </p>
      </div>

      {events.length > 0 ? (
        <div className="space-y-3">
          {events.map((event) => (
            <EventCard event={event} compact key={event.id} />
          ))}
        </div>
      ) : (
        <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
          {empty}
        </div>
      )}
    </section>
  )
}

function EventCard({ event, compact = false }: EventCardProps) {
  return (
    <article className="rounded-box border border-base-300 bg-base-100 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{event.event_type}</span>
            <span className="badge badge-ghost">{event.source}</span>
          </div>
          <p className="text-xs text-base-content/60">
            {formatDate(event.timestamp)}
          </p>
        </div>

        {event.skill_name ? (
          <span className="badge badge-outline">{event.skill_name}</span>
        ) : null}
      </div>

      <SkillMeta event={event} />

      {!compact || event.payload ? (
        <JsonBlock value={event.payload} />
      ) : null}
    </article>
  )
}

function SkillMeta({ event }: SkillMetaProps) {
  let rows = [
    ['Version', event.skill_version],
    ['Path', event.skill_path],
    ['Hash', event.skill_file_hash],
  ].filter(([_, value]) => value)

  if (rows.length === 0) return null

  return (
    <dl className="mt-4 grid gap-2 text-sm">
      {rows.map(([label, value]) => (
        <div className="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)]" key={label}>
          <dt className="text-base-content/50">{label}</dt>
          <dd className="min-w-0 break-words font-mono text-xs">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function JsonBlock({ value }: JsonBlockProps) {
  if (!value || Object.keys(value).length === 0) return null

  return (
    <pre className="mt-4 max-h-80 overflow-auto rounded-box bg-base-200 p-3 text-xs leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function formatDate(value?: Date | string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

type PageProps = {
  loaderData: {
    timeline: any
  }
}

type MetricProps = {
  label: string
  value: any
}

type ConsistencyPanelProps = {
  results: any[]
}

type ConsistencyBadgeProps = {
  status: 'pass' | 'warning' | 'incomplete'
}

type TimelineProps = {
  events: any[]
}

type EventPanelProps = {
  title: string
  empty: string
  events: any[]
}

type EventCardProps = {
  event: any
  compact?: boolean
}

type SkillMetaProps = {
  event: any
}

type JsonBlockProps = {
  value: Record<string, any> | null
}
