import { SectionSummaryHeader } from './run-detail-ui'

export function ProviderHistoryPanel({
  events,
  summary,
}: ProviderHistoryPanelProps) {
  let operations = events.filter(
    (event) => event.event_type === 'execution_operation_observed',
  )
  let reads = events.filter((event) =>
    ['skill_file_read', 'skill_reference_read'].includes(event.event_type),
  )

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <SectionSummaryHeader
        className="mb-4"
        summary={panelSummary(summary)}
        title="Recorded execution context"
      />

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <SummaryRow label="Status" value={displayValue(summary.status)} />
        <SummaryRow label="Provider" value={displayValue(summary.provider)} />
        <SummaryRow
          label="Model"
          value={displayValue(summary.provider_model)}
        />
        <SummaryRow
          label="Client"
          value={displayValue(summary.provider_client_version)}
        />
        <SummaryRow
          label="Match"
          value={displayValue(summary.match_confidence)}
        />
        <SummaryRow
          label="Completeness"
          value={displayValue(summary.completeness)}
        />
      </dl>

      {reads.length > 0 ? (
        <section className="mt-5 border-t border-base-300 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-base-content/70">
            Provider-recorded reads
          </h3>
          <ul className="space-y-2">
            {reads.map((event) => (
              <li
                className="flex min-w-0 items-baseline justify-between gap-3 text-sm"
                key={event.id}
              >
                <span className="min-w-0 truncate font-mono text-xs">
                  {event.skill_path || event.skill_name || event.event_type}
                </span>
                <span className="shrink-0 text-xs text-base-content/50">
                  {event.event_type === 'skill_file_read'
                    ? 'skill'
                    : 'reference'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {operations.length > 0 ? (
        <section className="mt-5 border-t border-base-300 pt-4">
          <h3 className="mb-2 text-sm font-semibold text-base-content/70">
            Verification operations
          </h3>
          <ul className="space-y-2">
            {operations.map((event) => (
              <li
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 text-sm"
                key={event.id}
              >
                <span className="truncate font-medium">
                  {displayValue(event.payload?.operation_kind)}
                </span>
                <span className={outcomeClass(event.payload?.outcome)}>
                  {operationOutcome(event)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  )
}

function SummaryRow({ label, value }: SummaryRowProps) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-base-content/50">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-xs" title={value}>
        {value}
      </dd>
    </div>
  )
}

function panelSummary(summary: Record<string, any>) {
  let provider = displayValue(summary.provider)
  let status = displayValue(summary.status)
  return `${capitalize(provider)} · ${status}`
}

function operationOutcome(event: any) {
  let outcome = displayValue(event.payload?.outcome)
  let exitCode = event.payload?.exit_code
  return typeof exitCode === 'number'
    ? `${outcome} · exit ${exitCode}`
    : outcome
}

function outcomeClass(outcome: unknown) {
  if (outcome === 'success') return 'text-xs font-semibold text-success'
  if (outcome === 'failed') return 'text-xs font-semibold text-error'
  return 'text-xs font-semibold text-base-content/60'
}

function displayValue(value: unknown) {
  return typeof value === 'string' && value ? value.replaceAll('_', ' ') : '—'
}

function capitalize(value: string) {
  if (!value) return value
  return `${value[0].toUpperCase()}${value.slice(1)}`
}

type ProviderHistoryPanelProps = {
  events: any[]
  summary: Record<string, any>
}

type SummaryRowProps = {
  label: string
  value: string
}
