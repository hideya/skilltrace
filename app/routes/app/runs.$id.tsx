import { ChevronLeftIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Form, Link, redirect, useRevalidator } from 'react-router'
import { notFoundError } from '~/lib/.server/errors'
import { clearRunEvents, getRunTimeline } from '~/models/.server/trace'

// Remote/auth mode reference:
// import { requireUser } from '~/.server/auth/middlewares'

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
  useAutoRefresh(run.status === 'active')

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pt-10 pb-40">
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
                Run timeline
              </div>
            </div>

            <h1 className="text-4xl font-bold text-balance break-words">
              {title}
            </h1>
            {run.description ? (
              <p className="text-base-content/70">{run.description}</p>
            ) : null}
          </div>
        </div>

        {/* <Form method="post">
          <button className="btn btn-outline" type="submit">
            Start new attempt
          </button>
        </Form> */}
      </header>

      <section className="grid grid-cols-3 gap-4 md:grid-cols-[2fr_2fr_2fr_1fr_1fr_1fr]">
        <Metric label="Mode" value={traceModeLabel(timeline.trace_mode)} />
        <Metric label="Status" value={statusLabel(timeline.status)} />
        <Metric label="Result" value={resultLabel(timeline.result)} />
        <Metric label="Events" value={timeline.events.length} />
        <Metric label="Passive" value={timeline.passive_events.length} />
        <Metric label="Semantic" value={timeline.semantic_events.length} />
      </section>

      <RunContextPanel context={timeline.context} />

      <ConsistencyPanel
        rows={timeline.consistency_matrix}
        traceMode={timeline.trace_mode}
      />

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
          <div className="join gap-2">
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
  let fileSections = reflectionFileSections(value)
  let entries = Object.entries(omitReflectionFileSections(value)).filter(
    ([_, item]) => hasValue(item),
  )

  if (entries.length === 0 && fileSections.length === 0) {
    return (
      <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
        Empty reflection.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {fileSections.length > 0 ? (
        <div className="space-y-3 rounded-box border border-base-300 bg-base-100 p-3">
          <h3 className="text-sm font-semibold text-base-content/70">
            Reflected file usage
          </h3>
          <div className="space-y-3">
            {fileSections.map((section) => (
              <ReflectionFileSection
                items={section.items}
                key={section.key}
                title={section.title}
              />
            ))}
          </div>
        </div>
      ) : null}
      {entries.map(([key, item]) => (
        <ReflectionSection item={item} key={key} name={reflectionLabel(key)} />
      ))}
    </div>
  )
}

function ReflectionFileSection({ title, items }: ReflectionFileSectionProps) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold text-base-content/60">{title}</h4>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li
            className="rounded bg-base-200 px-2 py-1 font-mono text-xs break-words"
            key={`${item}-${index}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
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

function ConsistencyPanel({ rows, traceMode }: ConsistencyPanelProps) {
  let description = consistencyDescription(traceMode)

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Consistency</h2>
          <p className="text-sm text-base-content/60">
            {rows.length} file{rows.length === 1 ? '' : 's'} · {description}
          </p>
        </div>
      </div>

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="text-center">Kind</th>
                <th>File</th>
                <th className="text-center">Passive</th>
                <th className="text-center">Semantic</th>
                <th className="text-center">Reflection</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className={consistencyRowClass(row)}
                  key={`${row.kind}-${row.file}`}
                >
                  <td className="text-center">
                    <span className="badge badge-outline badge-sm">
                      {row.kind}
                    </span>
                  </td>
                  <td
                    className="max-w-[28rem] font-mono text-xs break-words"
                    title={row.file}
                  >
                    {displayRunFilePath(row.file)}
                  </td>
                  <td className="text-center">
                    <ConsistencyDot
                      active={row.passive}
                      expected={row.passive_expected}
                      tone="passive"
                    />
                  </td>
                  <td className="text-center">
                    <ConsistencyDot
                      active={row.semantic}
                      expected={row.semantic_expected}
                      tone="semantic"
                    />
                  </td>
                  <td className="text-center">
                    <ConsistencyDot
                      active={row.reflection}
                      expected={row.reflection_expected}
                      tone="semantic"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
          No keyed skill events to check yet.
        </div>
      )}
    </section>
  )
}

function ConsistencyDot({
  active,
  expected = true,
  tone,
}: ConsistencyDotProps) {
  if (!expected) {
    return (
      <span
        aria-label="Not expected in this mode"
        className="inline-block size-3 rounded-full border border-dashed border-base-300"
        title="Not expected in this mode"
      />
    )
  }

  let activeClass = tone === 'semantic' ? 'bg-indigo-500' : 'bg-teal-500'
  let className = active ? activeClass : 'bg-base-300'

  return (
    <span
      aria-label={active ? 'Observed' : 'Missing'}
      className={`inline-block size-3 rounded-full ${className}`}
      title={active ? 'Observed' : 'Missing'}
    />
  )
}

function consistencyDescription(mode?: string) {
  if (mode === 'passive_only') return 'checking passive observations'
  if (mode === 'passive_reflection') {
    return 'checking passive observations and reflection'
  }
  return 'checking passive, semantic, and reflection evidence'
}

function consistencyRowClass(row: any) {
  if (row.status === 'error') return 'bg-error/20'
  if (row.status === 'warning') return 'bg-warning/20'
  return ''
}

function displayRunFilePath(filePath: string) {
  let normalized = filePath.replaceAll('\\', '/')
  let parts = normalized.split('/').filter(Boolean)
  let skillIndex = parts.indexOf('.skills')

  if (skillIndex >= 0) {
    return parts.slice(skillIndex).join('/')
  }

  return filePath
}

function traceModeLabel(mode?: string) {
  if (mode === 'passive_reflection') return 'passive + reflection'
  if (mode === 'passive_only') return 'passive only'
  if (mode === 'full') return 'full'
  return 'unknown'
}

function statusLabel(status?: string) {
  if (status === 'active') return 'active'
  if (status === 'finished') return 'finished'
  if (status === 'interrupted') return 'interrupted'
  return status ?? 'unknown'
}

function resultLabel(result?: string) {
  if (result === 'pass') return 'pass'
  if (result === 'warning') return 'warning'
  if (result === 'incomplete') return 'incomplete'
  if (result === 'running') return 'running'
  return result ?? 'unknown'
}

function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
      <p className="text-left text-xs tracking-[0.2em] text-base-content/50 uppercase">
        {label}
      </p>
      <p className="mt-2 truncate text-right text-2xl font-bold">{value}</p>
    </div>
  )
}

function Timeline({ events }: TimelineProps) {
  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-5">
        <div>
          <h2 className="text-2xl font-bold">Timeline</h2>
          <p className="text-sm text-base-content/60">
            {events.length} event
            {events.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>

      {events.length > 0 ? (
        <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-0 before:left-3 before:w-px before:bg-base-300">
          {events.map((event) => (
            <li className="relative pl-9" key={event.id}>
              <span
                className={`absolute rounded-full ring-4 ring-base-100 ${eventDotSizeClass(
                  event,
                )} ${eventDotClass(event)}`}
              />
              <TimelineItem event={event} />
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

function TimelineItem({ event }: TimelineItemProps) {
  let name = fileNameForEvent(event)
  let isSemantic = isSemanticEvent(event)
  let warning = eventWarning(event)

  return (
    <details className="group rounded-box border border-base-300 bg-base-100">
      <summary className="grid cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 marker:hidden">
        <div className="flex min-w-0 flex-col items-baseline gap-2">
          {name ? (
            <div className="flex items-baseline gap-2">
              {name || isSemantic || warning ? (
                <span
                  className={`font-mono text-sm font-semibold ${eventFileNameClass(
                    event,
                  )}`}
                >
                  {name}
                </span>
              ) : null}
              {isSemantic ? (
                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                  {event.skill_name ? (
                    <span className="badge truncate badge-outline border-indigo-500 badge-sm text-indigo-600">
                      skill: {event.skill_name}
                    </span>
                  ) : null}
                </div>
              ) : null}
              {warning ? (
                <span className="badge badge-sm badge-warning" title={warning}>
                  warning
                </span>
              ) : null}
            </div>
          ) : null}
          <div className={`truncate ${eventTitleClass(event)}`}>
            {event.event_type}
          </div>
        </div>
        <span className="font-mono text-xs text-base-content/50">
          {formatTime(event.timestamp)}
        </span>
      </summary>

      <div className="border-t border-base-300 p-4">
        <EventCard event={event} />
      </div>
    </details>
  )
}

function EventCard({ event }: EventCardProps) {
  return (
    <article className="space-y-4">
      <dl className="grid gap-2 text-sm">
        <div className="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)]">
          <dt className="text-base-content/50">Time</dt>
          <dd className="min-w-0 font-mono text-xs break-words">
            {formatDate(event.timestamp)}
          </dd>
        </div>
      </dl>
      <SkillMeta event={event} />
      <JsonBlock value={event.payload} />
    </article>
  )
}

function SkillMeta({ event }: SkillMetaProps) {
  let rows = [
    ['Reference', referencePathForEvent(event)],
    ['Version', event.skill_version],
    ['Path', event.skill_path],
    ['Hash', event.skill_file_hash],
  ].filter(([_, value]) => value)

  if (rows.length === 0) return null

  return (
    <dl className="grid gap-2 text-sm">
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

function isPassiveEvent(event: any) {
  return event.source === 'passive_file_harness'
}

function isSemanticEvent(event: any) {
  return event.source === 'mcp_semantic_logger'
}

function eventDotClass(event: any) {
  if (isSemanticEvent(event)) return 'bg-indigo-500'
  if (isPassiveEvent(event)) return 'bg-teal-500'
  return 'bg-base-content'
}

function eventDotSizeClass(event: any) {
  if (isSemanticEvent(event)) return 'top-4.5 left-1 size-4'
  if (isPassiveEvent(event)) return 'top-5 left-1.5 size-3'
  return 'top-5.5 left-2 size-2'
}

function eventTitleClass(event: any) {
  if (isSemanticEvent(event)) return 'font-semibold text-sm'
  if (isPassiveReadEvent(event)) return 'font-semibold text-sm'
  return 'font-normal'
}

function eventFileNameClass(event: any) {
  if (isSemanticEvent(event)) return 'text-indigo-600'
  if (isPassiveEvent(event)) return 'text-teal-600'
  return 'text-base-content/60'
}

function isPassiveReadEvent(event: any) {
  return (
    isPassiveEvent(event) &&
    ['skill_file_read', 'skill_reference_read'].includes(event.event_type)
  )
}

function eventWarning(event: any) {
  let warnings = event.payload?.instrumentation?.warnings
  if (Array.isArray(warnings) && warnings.length > 0) {
    return warnings.join('\n')
  }

  let status = event.payload?.instrumentation?.status
  if (status === 'pending_injection') return null
  if (status && status !== 'ready') {
    return `Instrumentation status: ${status}`
  }

  return null
}

function fileNameForEvent(event: any) {
  let filePath =
    referencePathForEvent(event) ||
    event.payload?.path ||
    event.payload?.file_path ||
    event.skill_path ||
    event.payload?.skill_path

  if (!filePath || typeof filePath !== 'string') return null

  return filePath.split(/[\\/]/).filter(Boolean).at(-1) || null
}

function referencePathForEvent(event: any) {
  if (event.event_type !== 'skill_reference_read') return null

  let referencePath =
    event.payload?.data?.reference_path || event.payload?.reference_path

  if (!referencePath || typeof referencePath !== 'string') return null
  return referencePath
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
    skills_read: 'Skills read',
    references_read: 'References read',
    files_believed_to_influence_work: 'Files believed to influence work',
    file_usage_uncertainties: 'File usage uncertainties',
    skills_skipped: 'Skills skipped',
    decision_notes: 'Decision notes',
    instrumentation_notes: 'Instrumentation notes',
    uncertainty: 'Uncertainty',
    next_steps: 'Next steps',
  }

  return labels[key] ?? key.split('_').filter(Boolean).map(capitalize).join(' ')
}

function reflectionFileSections(value: Record<string, any>) {
  return REFLECTION_FILE_FIELDS.map((field) => ({
    key: field.key,
    title: field.title,
    items: stringList(value[field.key]),
  })).filter((section) => section.items.length > 0)
}

function omitReflectionFileSections(value: Record<string, any>) {
  let next = { ...value }
  for (let field of REFLECTION_FILE_FIELDS) {
    delete next[field.key]
  }
  return next
}

function stringList(value: any) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.trim())
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

function formatTime(value?: Date | string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString()
}

function useAutoRefresh(enabled: boolean) {
  let revalidator = useRevalidator()

  useEffect(() => {
    if (!enabled) return

    let refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (revalidator.state !== 'idle') return
      revalidator.revalidate()
    }
    let interval = window.setInterval(refresh, RUN_REFRESH_MS)

    return () => window.clearInterval(interval)
  }, [enabled, revalidator])
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
  rows: any[]
  traceMode?: string
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

type ReflectionFileSectionProps = {
  title: string
  items: string[]
}

type ReflectionValueProps = {
  item: any
}

type ReflectionMode = (typeof reflectionModes)[number]

type ConsistencyDotProps = {
  active: boolean
  expected?: boolean
  tone: 'passive' | 'semantic'
}

type TimelineProps = {
  events: any[]
}

type TimelineItemProps = {
  event: any
}

type EventCardProps = {
  event: any
}

type SkillMetaProps = {
  event: any
}

type JsonBlockProps = {
  value: Record<string, any> | null
}

const RUN_REFRESH_MS = 3000
const REFLECTION_FILE_FIELDS = [
  { key: 'skills_read', title: 'Skills read' },
  { key: 'references_read', title: 'References read' },
  {
    key: 'files_believed_to_influence_work',
    title: 'Files believed to influence work',
  },
  { key: 'file_usage_uncertainties', title: 'File usage uncertainties' },
] as const
