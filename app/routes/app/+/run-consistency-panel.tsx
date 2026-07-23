import { InfoIcon, MinusIcon } from 'lucide-react'
import { skillPathFromRoot } from '~/lib/skill-path'
import { SectionSummaryHeader } from './run-detail-ui'

export function ConsistencyPanel({
  isFinal = true,
  providerHistory,
  rows,
  traceMode,
}: ConsistencyPanelProps) {
  let description = consistencyDescription(traceMode)

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <SectionSummaryHeader
        className="mb-4"
        summary={`${rows.length} file${rows.length === 1 ? '' : 's'} · ${description}`}
        title="Consistency"
      />

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="text-center">Kind</th>
                <th>File</th>
                <th className="text-center">Status</th>
                <th className="text-center">Passive</th>
                <th className="text-center">Semantic</th>
                <th className="text-center">Reflection</th>
                <th className="text-center">
                  <span className="inline-flex items-center gap-1">
                    Provider
                    <span
                      aria-label="Advisory provider evidence"
                      className="tooltip tooltip-bottom tooltip-end inline-flex cursor-help items-center font-normal outline-none before:w-48 before:whitespace-normal focus-visible:ring-2 focus-visible:ring-primary"
                      data-tip="Advisory only. Does not affect consistency status."
                      role="note"
                      tabIndex={0}
                    >
                      <InfoIcon
                        aria-hidden="true"
                        className="size-3 text-base-content/40"
                      />
                    </span>
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className={consistencyRowClass(row, isFinal)}
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
                    <ConsistencyStatusBadge
                      isFinal={isFinal}
                      status={row.status}
                    />
                  </td>
                  <td className="text-center">
                    <ConsistencyDot
                      active={row.passive}
                      expected={row.passive_expected}
                      subdued={row.status === 'discovered'}
                      tone="passive"
                    />
                  </td>
                  <td className="text-center">
                    <ConsistencyDot
                      active={row.semantic}
                      expected={row.semantic_expected}
                      state={row.semantic_state}
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
                  <td className="text-center">
                    <ProviderConsistencyDot
                      active={row.provider}
                      summary={providerHistory}
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

function ConsistencyStatusBadge({
  isFinal,
  status,
}: ConsistencyStatusBadgeProps) {
  if (!isFinal && ['warning', 'error'].includes(status)) {
    return (
      <span className="badge badge-sm badge-outline text-base-content/60">
        {status}
      </span>
    )
  }

  let className =
    status === 'pass'
      ? 'badge-success'
      : status === 'discovered' || status === 'provider_only'
        ? 'badge-outline text-base-content/60'
        : status === 'error'
          ? 'badge-error'
          : 'badge-warning'

  let label = status === 'provider_only' ? 'not evaluated' : status
  return <span className={`badge badge-sm ${className}`}>{label}</span>
}

function ConsistencyDot({
  active,
  expected = true,
  state,
  subdued = false,
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

  let activeClass = tone === 'semantic' ? 'bg-indigo-400' : 'bg-teal-400'
  let isPartial = tone === 'semantic' && state === 'partial'
  let opacityClass = active && subdued ? 'opacity-50' : ''
  let className = active
    ? activeClass
    : isPartial
      ? 'bg-indigo-400/50'
      : 'bg-base-300'
  let label = active
    ? subdued
      ? 'Discovered passively'
      : 'Observed'
    : isPartial
      ? 'Started, waiting for finish'
      : 'Missing'

  return (
    <span
      aria-label={label}
      className={`inline-block size-3 rounded-full ${className} ${opacityClass}`}
      title={label}
    />
  )
}

function ProviderConsistencyDot({
  active,
  summary,
}: ProviderConsistencyDotProps) {
  if (active) {
    return (
      <span
        aria-label="Observed in provider history"
        className="inline-block size-3 rounded-full bg-amber-400"
        title="Observed in provider history; advisory only"
      />
    )
  }

  if (summary?.status === 'collected') {
    return (
      <span
        aria-label="Not observed in provider history"
        className="inline-block size-3 rounded-full border border-base-content/30"
        title="Not observed in collected provider history; advisory only"
      />
    )
  }

  let label = providerUnavailableLabel(summary?.status)

  return (
    <span
      aria-label={label}
      className="inline-flex size-3 items-center justify-center text-xs leading-none text-base-content/40"
      title={label}
    >
      <MinusIcon aria-hidden="true" className="size-3" />
    </span>
  )
}

function providerUnavailableLabel(status?: string) {
  if (status === 'possibly_incomplete') {
    return 'Not established; provider collection may be incomplete'
  }
  if (status === 'unavailable') return 'Provider history unavailable'
  if (status === 'ambiguous') return 'Provider history match was ambiguous'
  if (status === 'unsupported_format') {
    return 'Provider history format was unsupported'
  }
  if (status === 'failed') return 'Provider history collection failed'
  return 'Provider history was not collected'
}

function consistencyDescription(mode?: string) {
  if (mode === 'passive_only') return 'checking passive observations'
  if (mode === 'passive_reflection') {
    return 'checking passive observations and reflection'
  }
  return 'checking passive, semantic, and reflection evidence'
}

function consistencyRowClass(row: any, isFinal: boolean) {
  if (!isFinal) return ''
  if (row.status === 'error') return 'bg-error/20'
  if (row.status === 'warning') return 'bg-warning/20'
  return ''
}

function displayRunFilePath(filePath: string) {
  return skillPathFromRoot(filePath, true) ?? filePath
}

type ConsistencyPanelProps = {
  isFinal?: boolean
  providerHistory?: Record<string, any> | null
  rows: any[]
  traceMode?: string
}

type ConsistencyDotProps = {
  active: boolean
  expected?: boolean
  state?: 'complete' | 'partial' | 'missing'
  subdued?: boolean
  tone: 'passive' | 'semantic'
}

type ProviderConsistencyDotProps = {
  active: boolean
  summary?: Record<string, any> | null
}

type ConsistencyStatusBadgeProps = {
  isFinal: boolean
  status: 'pass' | 'warning' | 'error' | 'discovered' | 'provider_only'
}
