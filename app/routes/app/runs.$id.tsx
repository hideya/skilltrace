import { useState } from 'react'
import { Form, Link, redirect } from 'react-router'
import { notFoundError } from '~/lib/.server/errors'
import { clearRunEvents, getRunTimeline } from '~/models/.server/trace'

// Remote/auth mode reference:
// import { requireUser } from '~/.server/auth/middlewares'

const timelineFilters = [
  { value: 'semantic', label: 'Semantic' },
  { value: 'passive', label: 'Passive' },
  { value: 'all', label: 'All' },
] as const

const reflectionModes = ['pretty', 'raw'] as const

export async function loader({ params }) {
  // Remote/auth mode reference:
  // requireUser(context)
  if (!params.id) throw notFoundError()

  let timeline = await getRunTimeline(params.id)
  return { timeline }
}

export async function action({ params }) {
  // Remote/auth mode reference:
  // requireUser(context)
  if (!params.id) throw notFoundError()

  await clearRunEvents(params.id)

  return redirect(`/app/runs/${params.id}`)
}

export default function Page({ loaderData }: PageProps) {
  let { timeline } = loaderData
  let run = timeline.run
  let title = run.name || run.public_id

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="space-y-4">
        <Link className="link text-sm link-hover" to="/app/runs">
          Back to runs
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="badge rounded-full badge-outline">Run timeline</p>
            <h1 className="text-4xl font-bold text-balance break-words">
              {title}
            </h1>
            {run.description ? (
              <p className="text-base-content/70">{run.description}</p>
            ) : null}
          </div>

          <div className="rounded-box border border-base-300 bg-base-100 px-4 py-3 shadow-sm">
            <p className="text-xs tracking-[0.2em] text-base-content/50 uppercase">
              Events
            </p>
            <p className="text-3xl font-bold">{timeline.events.length}</p>
          </div>
        </div>

        <Form method="post">
          <button className="btn btn-outline" type="submit">
            Start new attempt
          </button>
        </Form>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        <Metric label="Status" value={run.status} />
        <Metric label="Passive" value={timeline.passive_events.length} />
        <Metric label="Semantic" value={timeline.semantic_events.length} />
      </section>

      <RunContextPanel context={timeline.context} />

      <ConsistencyPanel results={timeline.consistency} />

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Timeline events={timeline.events} />

        <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
          <RunReflectionPanel reflection={timeline.reflection} />
        </aside>
      </section>
    </main>
  )
}

function RunReflectionPanel({ reflection }: RunReflectionPanelProps) {
  let [mode, setMode] = useState<ReflectionMode>('pretty')

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Run reflection</h2>
          <p className="text-sm text-base-content/60">
            Declared post-run diagnostic summary
          </p>
        </div>
        {reflection ? (
          <div className="join">
            {reflectionModes.map((option) => (
              <button
                aria-pressed={mode === option}
                className={`btn join-item btn-xs ${
                  mode === option ? 'btn-primary' : 'btn-outline'
                }`}
                key={option}
                onClick={() => setMode(option)}
                type="button"
              >
                {capitalize(option)}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {reflection ? (
        mode === 'pretty' ? (
          <ReflectionPretty value={reflection} />
        ) : (
          <JsonBlock value={reflection} />
        )
      ) : (
        <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
          No run reflection declared.
        </div>
      )}
    </section>
  )
}

function ReflectionPretty({ value }: ReflectionPrettyProps) {
  let entries = Object.entries(value).filter(([_, item]) => hasValue(item))

  if (entries.length === 0) {
    return (
      <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
        Empty reflection.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {entries.map(([key, item]) => (
        <ReflectionSection
          item={item}
          key={key}
          name={reflectionLabel(key)}
        />
      ))}
    </div>
  )
}

function ReflectionSection({ name, item }: ReflectionSectionProps) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-base-content/70">{name}</h3>
      <ReflectionValue item={item} />
    </section>
  )
}

function ReflectionValue({ item }: ReflectionValueProps) {
  if (Array.isArray(item)) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {item.map((entry, index) => (
          <li className="break-words" key={index}>
            <ReflectionValue item={entry} />
          </li>
        ))}
      </ul>
    )
  }

  if (item && typeof item === 'object') {
    return (
      <div className="space-y-3 rounded-box bg-base-200 p-3">
        {Object.entries(item).map(([key, value]) => (
          <div className="space-y-1" key={key}>
            <h4 className="text-xs font-semibold text-base-content/60">
              {reflectionLabel(key)}
            </h4>
            <ReflectionValue item={value} />
          </div>
        ))}
      </div>
    )
  }

  return <p className="text-sm leading-relaxed break-words">{String(item)}</p>
}

function RunContextPanel({ context }: RunContextPanelProps) {
  let rows = [
    ['Agent', context?.agent],
    ['Model', context?.model],
    ['Client', context?.client],
    ['Working directory', context?.cwd],
    ['Task', context?.task_summary],
    ['Notes', context?.notes],
  ].filter(([_, value]) => value)
  let extra = extraContext(context)

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Run context</h2>
          <p className="text-sm text-base-content/60">
            Declared execution metadata
          </p>
        </div>
      </div>

      {rows.length > 0 || Object.keys(extra).length > 0 ? (
        <div className="space-y-4">
          {rows.length > 0 ? (
            <dl className="grid gap-2 text-sm">
              {rows.map(([label, value]) => (
                <div
                  className="grid gap-1 sm:grid-cols-[9rem_minmax(0,1fr)]"
                  key={label}
                >
                  <dt className="text-base-content/50">{label}</dt>
                  <dd className="min-w-0 break-words">{String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {Object.keys(extra).length > 0 ? <JsonBlock value={extra} /> : null}
        </div>
      ) : (
        <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
          No run context declared.
        </div>
      )}
    </section>
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
                <span className="badge badge-outline">
                  skill: {result.skill}
                </span>
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
      <p className="text-xs tracking-[0.2em] text-base-content/50 uppercase">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  )
}

function Timeline({ events }: TimelineProps) {
  let [filter, setFilter] = useState<TimelineFilter>('semantic')
  let filteredEvents = events.filter((event) =>
    matchesTimelineFilter(event, filter),
  )
  let counts = getTimelineCounts(events)

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Timeline</h2>
          <p className="text-sm text-base-content/60">
            {filteredEvents.length} of {events.length} event
            {events.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="join gap-2">
          {timelineFilters.map((option) => (
            <button
              aria-pressed={filter === option.value}
              className={`btn join-item btn-sm ${
                filter === option.value ? 'btn-primary' : 'btn-outline'
              }`}
              key={option.value}
              onClick={() => setFilter(option.value)}
              type="button"
            >
              {option.label}
              <span className="badge badge-sm">{counts[option.value]}</span>
            </button>
          ))}
        </div>
      </div>

      {events.length > 0 ? (
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-0 before:left-3 before:w-px before:bg-base-300">
          {events.map((event) => {
            let isMatch = matchesTimelineFilter(event, filter)

            return (
              <li
                className={`relative pl-9 ${isMatch ? '' : 'min-h-6'}`}
                key={event.id}
              >
                <span
                  className={`absolute top-2 left-1.5 size-3 rounded-full ring-4 ring-base-100 ${eventDotClass(
                    event,
                  )} ${isMatch ? '' : 'opacity-40'}`}
                />
                {isMatch ? (
                  <EventCard event={event} />
                ) : (
                  <p className="pt-0.5 font-mono text-xs text-base-content/40">
                    {mutedEventLabel(event)}
                  </p>
                )}
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="rounded-box border border-dashed border-base-300 p-6 text-center text-base-content/60">
          No events recorded.
        </div>
      )}

      {events.length > 0 && filteredEvents.length === 0 ? (
        <div className="mt-4 rounded-box border border-dashed border-base-300 p-4 text-center text-sm text-base-content/60">
          No {filter} events in this run.
        </div>
      ) : null}
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
            <span className={`badge ${sourceBadgeClass(event)}`}>
              {event.source}
            </span>
          </div>
          <p className="text-xs text-base-content/60">
            {formatDate(event.timestamp)}
          </p>
        </div>

        {event.skill_name ? (
          <span className="badge badge-outline whitespace-nowrap">
            skill: {event.skill_name}
          </span>
        ) : null}
      </div>

      <SkillMeta event={event} />

      {!compact || event.payload ? <JsonBlock value={event.payload} /> : null}
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
        <div
          className="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)]"
          key={label}
        >
          <dt className="text-base-content/50">{label}</dt>
          <dd className="min-w-0 font-mono text-xs break-words">{value}</dd>
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

function getTimelineCounts(events: any[]) {
  let passive = events.filter(isPassiveEvent).length
  let semantic = events.filter(isSemanticEvent).length

  return {
    all: events.length,
    passive,
    semantic,
  }
}

function matchesTimelineFilter(event: any, filter: TimelineFilter) {
  if (filter === 'all') return true
  if (filter === 'passive') return isPassiveEvent(event)
  return isSemanticEvent(event)
}

function isPassiveEvent(event: any) {
  return event.source === 'passive_file_harness'
}

function isSemanticEvent(event: any) {
  return event.source === 'mcp_semantic_logger'
}

function sourceBadgeClass(event: any) {
  if (isSemanticEvent(event)) return 'badge-info badge-outline'
  if (isPassiveEvent(event)) return 'badge-primary badge-outline'
  return 'badge-ghost'
}

function eventDotClass(event: any) {
  if (isSemanticEvent(event)) return 'bg-info'
  if (isPassiveEvent(event)) return 'bg-primary'
  return 'bg-base-content'
}

function mutedEventLabel(event: any) {
  let name = fileNameForEvent(event)
  if (!name) return event.event_type
  return `${event.event_type} ${name}`
}

function fileNameForEvent(event: any) {
  let filePath =
    event.payload?.path ||
    event.payload?.file_path ||
    event.skill_path ||
    event.payload?.skill_path

  if (!filePath || typeof filePath !== 'string') return null

  return filePath.split(/[\\/]/).filter(Boolean).at(-1) || null
}

function extraContext(context?: Record<string, any> | null) {
  if (!context) return {}

  let { agent, model, client, cwd, task_summary, notes, ...extra } = context
  return extra
}

function reflectionLabel(key: string) {
  let labels: Record<string, string> = {
    task_outcome: 'Task outcome',
    summary: 'Summary',
    skills_used: 'Skills used',
    skills_skipped: 'Skills skipped',
    decision_notes: 'Decision notes',
    instrumentation_notes: 'Instrumentation notes',
    uncertainty: 'Uncertainty',
    next_steps: 'Next steps',
  }

  return labels[key] ?? key
    .split('_')
    .filter(Boolean)
    .map(capitalize)
    .join(' ')
}

function hasValue(value: any) {
  if (value === null || value === undefined || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function capitalize(value: string) {
  if (!value) return value
  return `${value[0].toUpperCase()}${value.slice(1)}`
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

type RunContextPanelProps = {
  context?: Record<string, any> | null
}

type RunReflectionPanelProps = {
  reflection?: Record<string, any> | null
}

type ReflectionPrettyProps = {
  value: Record<string, any>
}

type ReflectionSectionProps = {
  name: string
  item: any
}

type ReflectionValueProps = {
  item: any
}

type ReflectionMode = (typeof reflectionModes)[number]

type ConsistencyBadgeProps = {
  status: 'pass' | 'warning' | 'incomplete'
}

type TimelineProps = {
  events: any[]
}

type TimelineFilter = (typeof timelineFilters)[number]['value']

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
