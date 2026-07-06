import { AnimatedDisclosure } from '~/ui/animated-disclosure'
import {
  CompactDisclosureHeader,
  JsonBlock,
  SectionSummaryHeader,
} from './run-detail-ui'

export function RunContextPanel({
  context,
  environment,
}: RunContextPanelProps) {
  let rows: ContextRow[] = [
    ['Agent', context?.agent],
    ['Model', context?.model],
    ['Client', context?.client],
    ['Working directory', context?.cwd],
    ['Task', context?.task_summary],
    ['Agent notes', context?.notes],
  ].filter((row): row is ContextRow => !!row[1])
  let extra = extraContext(context)
  let environmentRows = executionEnvironmentRows(environment)
  let hasContext = rows.length > 0 || Object.keys(extra).length > 0
  let hasEnvironment = environmentRows.length > 0

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <SectionSummaryHeader
        className="mb-4"
        summary="Agent-declared and SkillTrace-collected metadata"
        title="Run context"
      />

      {hasContext || hasEnvironment ? (
        <div className="space-y-4">
          {rows.length > 0 ? <ContextRows rows={rows} /> : null}

          {Object.keys(extra).length > 0 ? <JsonBlock value={extra} /> : null}

          {hasEnvironment ? (
            <AnimatedDisclosure
              childrenClassName="pt-3"
              className="border-t border-base-300 pt-4"
              header={
                <CompactDisclosureHeader
                  subsection
                  summary={executionEnvironmentSummary(environment)}
                  title="SkillTrace environment"
                />
              }
              headerClassName="flex w-full cursor-pointer items-center justify-between gap-4 text-left"
            >
              <ContextRows rows={environmentRows} />
            </AnimatedDisclosure>
          ) : null}
        </div>
      ) : (
        <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
          No run context declared.
        </div>
      )}
    </section>
  )
}

function ContextRows({ rows }: ContextRowsProps) {
  return (
    <dl className="grid gap-x-6 gap-y-3 text-sm lg:grid-cols-2">
      {rows.map(([label, value]) => (
        <div
          className="grid gap-1 sm:grid-cols-[7rem_minmax(0,1fr)]"
          key={label}
        >
          <dt className="text-base-content/50">{label}</dt>
          <dd className="min-w-0 break-words">{String(value)}</dd>
        </div>
      ))}
    </dl>
  )
}

function extraContext(context?: Record<string, any> | null) {
  if (!context) return {}

  let { agent, model, client, cwd, task_summary, notes, ...extra } = context
  return extra
}

function executionEnvironmentRows(
  environment?: Record<string, any> | null,
): ContextRow[] {
  if (!environment) return []

  return [
    ['SkillTrace', environment.skilltrace_version],
    ['Mode', environment.skilltrace_mode],
    ['Command', environment.skilltrace_command],
    ['Platform', environment.platform],
    ['Architecture', environment.arch],
    ['OS release', environment.os_release],
    ['Node', environment.node],
    ['Probe backend', environment.probe_backend],
    ['Probe mode', environment.probe_mode],
  ].filter((row): row is ContextRow => !!row[1])
}

function executionEnvironmentSummary(environment?: Record<string, any> | null) {
  if (!environment) return 'not recorded'

  let version = environment.skilltrace_version || 'unknown'
  let mode = environment.skilltrace_mode || 'unknown'
  let platform = environment.platform || 'unknown'
  let backend = environment.probe_backend || 'unknown'

  return `${version} / ${mode} / ${platform} / ${backend}`
}

type RunContextPanelProps = {
  context?: Record<string, any> | null
  environment?: Record<string, any> | null
}

type ContextRowsProps = {
  rows: ContextRow[]
}

type ContextRow = [string, unknown]
