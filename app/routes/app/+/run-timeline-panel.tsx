import { Fragment, useState } from 'react'
import { skillPathFromRoot } from '~/lib/skill-path'
import { AnimatedDisclosure } from '~/ui/animated-disclosure'
import { JsonBlock, SectionSummaryHeader } from './run-detail-ui'

const timelineModes = ['compact', 'detailed'] as const

export function Timeline({ events }: TimelineProps) {
  let [mode, setMode] = useState<TimelineMode>('compact')
  let compact = mode === 'compact'

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-5 flex min-w-0 items-start justify-between gap-4">
        <SectionSummaryHeader
          summary={`${events.length} event${events.length === 1 ? '' : 's'}`}
          title="Timeline"
        />
        {events.length > 0 ? (
          <div className="join shrink-0 gap-2">
            {timelineModes.map((option) => (
              <button
                aria-pressed={mode === option}
                className={`btn join-item font-normal btn-xs ${
                  mode === option
                    ? 'border-indigo-500 bg-indigo-500 text-white'
                    : 'border-indigo-500 btn-outline text-indigo-600'
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

      {events.length > 0 ? (
        <ol
          className={`relative before:absolute before:top-2 before:bottom-0 before:w-px before:bg-base-300 ${
            compact ? 'space-y-0.5 before:left-2' : 'space-y-4 before:left-3'
          }`}
        >
          {events.map((event) => (
            <li
              className={`relative ${compact ? 'pl-6' : 'pl-9'}`}
              key={event.id}
            >
              <span
                className={`absolute rounded-full ring-base-100 ${
                  compact
                    ? 'top-2.5 left-1 size-2 ring-2'
                    : `ring-4 ${eventDotSizeClass(event)}`
                } ${eventDotClass(event)}`}
              />
              {compact ? (
                <CompactTimelineItem event={event} />
              ) : (
                <TimelineItem event={event} />
              )}
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

function CompactTimelineItem({ event }: TimelineItemProps) {
  let name = primaryLabelForEvent(event)
  let operationKind = operationKindForEvent(event)
  let artifactRefs = artifactRefsForEvent(event)
  let outcome = outcomeForEvent(event)
  let process = name ? null : observedProcessForEvent(event)
  let label = name || event.event_type
  let eventTypeLabel = compactEventTypeForEvent(event, name)
  let fullLabel = [
    label,
    eventTypeLabel,
    operationKind,
    artifactRefs.join(', '),
    outcome,
    process ? `by ${process}` : null,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <AnimatedDisclosure
      childrenClassName="pb-3 pl-1"
      header={
        <>
          <div
            className="flex min-w-0 items-baseline gap-2 overflow-hidden whitespace-nowrap"
            title={fullLabel}
          >
            <span
              className={`text-sm ${
                name
                  ? `shrink-0 font-mono font-semibold ${eventFileNameClass(
                      event,
                    )}`
                  : eventTitleClass(event)
              }`}
            >
              {label}
            </span>
            {eventTypeLabel ? (
              <span
                className={`min-w-0 truncate font-mono text-sm ${eventFileNameClass(
                  event,
                )}`}
              >
                {eventTypeLabel}
              </span>
            ) : null}
            {operationKind ? (
              <span className="shrink-0 font-mono text-sm font-semibold text-amber-500">
                {operationKind}
              </span>
            ) : null}
            {artifactRefs.length > 0 ? (
              <span className="min-w-0 truncate font-mono text-sm text-amber-500">
                {artifactRefs.join(', ')}
              </span>
            ) : null}
            {outcome ? (
              <span className="shrink-0 font-mono text-sm text-amber-500 opacity-70">
                {outcome}
              </span>
            ) : null}
            {process ? (
              <span className="min-w-0 truncate font-mono text-sm text-base-content/50">
                by {process}
              </span>
            ) : null}
          </div>
          <span className="shrink-0 font-mono text-xs text-base-content/50">
            {formatTime(event.timestamp)}
          </span>
        </>
      }
      headerClassName="grid min-h-7 w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 text-left"
    >
      <EventCard event={event} />
    </AnimatedDisclosure>
  )
}

function compactEventTypeForEvent(event: any, primaryLabel: string | null) {
  if (!primaryLabel) return null
  if (event.event_type === 'execution_operation_observed') return null
  return event.event_type
}

function TimelineItem({ event }: TimelineItemProps) {
  let name = primaryLabelForEvent(event)
  let operationKind = operationKindForEvent(event)
  let artifactRefs = artifactRefsForEvent(event)
  let outcome = outcomeForEvent(event)
  let isSemantic = isSemanticEvent(event)
  let warning = eventWarning(event)
  let process = observedProcessForEvent(event)

  return (
    <AnimatedDisclosure
      childrenClassName="border-t border-base-300 p-4"
      className="rounded-box border border-base-300 bg-base-100"
      header={
        <>
          <div className="flex min-w-0 flex-col items-baseline gap-2">
            {name ? (
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                {name || isSemantic || warning ? (
                  <>
                    <span
                      className={`font-mono text-sm ${
                        operationKind
                          ? 'font-normal opacity-70'
                          : 'font-semibold'
                      } ${eventFileNameClass(event)}`}
                    >
                      <PathLabel label={name} />
                    </span>
                    {operationKind ? (
                      <span className="font-mono text-sm font-semibold text-amber-500">
                        {operationKind}
                      </span>
                    ) : null}
                    {artifactRefs.map((artifactRef, index) => (
                      <span
                        className="min-w-0 font-mono text-sm text-amber-500"
                        key={`${artifactRef}-${index}`}
                        title={artifactRef}
                      >
                        <PathLabel label={artifactRef} />
                        {index < artifactRefs.length - 1 ? ',' : null}
                      </span>
                    ))}
                    {outcome ? (
                      <span className="font-mono text-sm text-amber-500 opacity-70">
                        {outcome}
                      </span>
                    ) : null}
                  </>
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
                  <span
                    className="badge badge-sm badge-warning"
                    title={warning}
                  >
                    warning
                  </span>
                ) : null}
              </div>
            ) : null}
            <div className={`min-w-0 truncate ${eventTitleClass(event)}`}>
              {event.event_type}
              {process ? (
                <span className="font-mono font-normal text-base-content/50">
                  {' '}
                  by {process}
                </span>
              ) : null}
            </div>
          </div>
          <span className="font-mono text-xs text-base-content/50">
            {formatTime(event.timestamp)}
          </span>
        </>
      }
      headerClassName="grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left"
    >
      <EventCard event={event} />
    </AnimatedDisclosure>
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

function PathLabel({ label }: PathLabelProps) {
  let parts = label.split('/')

  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={`${part}-${index}`}>
          {index > 0 ? (
            <>
              /
              <wbr />
            </>
          ) : null}
          {part}
        </Fragment>
      ))}
    </>
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

function isPassiveEvent(event: any) {
  return event.source === 'passive_file_harness'
}

function isSemanticEvent(event: any) {
  return event.source === 'mcp_semantic_logger'
}

function isProviderEvent(event: any) {
  return event.source === 'provider_history'
}

function eventDotClass(event: any) {
  if (isSemanticEvent(event)) return 'bg-indigo-400'
  if (isPassiveEvent(event)) return 'bg-teal-400'
  if (isProviderEvent(event)) return 'bg-amber-400'
  return 'bg-base-content'
}

function eventDotSizeClass(event: any) {
  if (isSemanticEvent(event)) return 'top-4.5 left-1.25 size-3.5'
  if (isPassiveEvent(event)) return 'top-4.75 left-1.5 size-3'
  if (isProviderEvent(event)) return 'top-4.75 left-1.5 size-3'
  return 'top-5.5 left-2 size-2'
}

function eventTitleClass(event: any) {
  if (isSemanticEvent(event)) return 'font-semibold text-sm'
  if (isPassiveReadEvent(event)) return 'font-semibold text-sm'
  if (isProviderEvent(event)) return 'font-normal text-sm'
  return 'font-normal'
}

function eventFileNameClass(event: any) {
  if (isSemanticEvent(event)) return 'text-indigo-500'
  if (isPassiveEvent(event)) return 'text-teal-500'
  if (isProviderEvent(event)) return 'text-amber-500'
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

  return compactPathLabel(filePath)
}

function primaryLabelForEvent(event: any) {
  if (
    isProviderEvent(event) &&
    event.event_type === 'execution_operation_observed'
  ) {
    let toolName = event.payload?.tool_name
    if (typeof toolName === 'string' && toolName) return toolName
  }

  return fileNameForEvent(event)
}

function operationKindForEvent(event: any) {
  if (
    !isProviderEvent(event) ||
    event.event_type !== 'execution_operation_observed'
  ) {
    return null
  }

  let operationKind = event.payload?.operation_kind
  if (typeof operationKind !== 'string') return null
  return operationKind.trim() || null
}

function artifactRefsForEvent(event: any) {
  if (
    !isProviderEvent(event) ||
    event.event_type !== 'execution_operation_observed' ||
    !Array.isArray(event.artifact_refs)
  ) {
    return []
  }

  return event.artifact_refs
    .filter((artifactRef: unknown) => typeof artifactRef === 'string')
    .map((artifactRef: string) => artifactRef.trim())
    .filter(Boolean)
}

function outcomeForEvent(event: any) {
  if (
    !isProviderEvent(event) ||
    event.event_type !== 'execution_operation_observed'
  ) {
    return null
  }

  let outcome = event.payload?.outcome
  if (typeof outcome !== 'string') return null

  outcome = outcome.trim()
  if (!outcome || outcome.toLowerCase() === 'unknown') return null
  return outcome
}

export function compactPathLabel(filePath: string) {
  let parts = filePath.split(/[\\/]/).filter(Boolean)
  if (parts.length === 0) return null

  let skillPath = skillPathFromRoot(filePath)
  if (skillPath) return skillPath

  let fileName = parts.at(-1)
  if (fileName === 'SKILL.md' && parts.length >= 2) {
    return `${parts.at(-2)}/SKILL.md`
  }

  return fileName || null
}

function referencePathForEvent(event: any) {
  if (event.event_type !== 'skill_reference_read') return null

  let referencePath =
    event.payload?.data?.reference_path || event.payload?.reference_path

  if (!referencePath || typeof referencePath !== 'string') return null
  return referencePath
}

function observedProcessForEvent(event: any) {
  if (isProviderEvent(event)) {
    let provider = event.payload?.provider
    return typeof provider === 'string' && provider ? provider : null
  }
  if (!isPassiveReadEvent(event)) return null

  let process = event.payload?.observed_process
  if (typeof process === 'string' && process) return process

  let name = event.payload?.observed_process_name
  let pid = event.payload?.observed_process_id
  if (typeof name === 'string' && typeof pid === 'string') {
    return `${name}.${pid}`
  }

  return null
}

function formatDate(value?: Date | string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function formatTime(value?: Date | string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString()
}

function capitalize(value: string) {
  return `${value[0].toUpperCase()}${value.slice(1)}`
}

type TimelineProps = {
  events: any[]
}

type TimelineMode = (typeof timelineModes)[number]

type TimelineItemProps = {
  event: any
}

type PathLabelProps = {
  label: string
}

type EventCardProps = {
  event: any
}

type SkillMetaProps = {
  event: any
}
