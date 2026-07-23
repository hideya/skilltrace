import { withProviderExecutionIdentity } from '~/lib/provider-history'
import { AnimatedDisclosure } from '~/ui/animated-disclosure'
import {
  CompactDisclosureHeader,
  JsonBlock,
  SectionSummaryHeader,
} from './run-detail-ui'

export function RunContextPanel({
  context,
  environment,
  providerHistory,
}: RunContextPanelProps) {
  let displayContext = withProviderExecutionIdentity(context, providerHistory)
  let rows: ContextRow[] = [
    ['Agent', displayContext?.agent],
    ['Model', displayContext?.model],
    ['Client', displayContext?.client],
    ['Working directory', displayContext?.cwd],
    ['Task', displayContext?.task_summary],
    ['Agent notes', displayContext?.notes],
  ].filter((row): row is ContextRow => !!row[1])
  let extra = extraContext(context)
  let environmentRows = executionEnvironmentRows(environment)
  let providerRows = providerEnvironmentRows(providerHistory)
  let hasContext = rows.length > 0 || Object.keys(extra).length > 0
  let hasEnvironment = environmentRows.length > 0
  let hasProvider = providerRows.length > 0

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <SectionSummaryHeader
        className="mb-4"
        summary="Metadata from agent declarations, agent execution logs, and SkillTrace"
        title="Run context"
      />

      {hasContext || hasProvider || hasEnvironment ? (
        <div className="space-y-4">
          {rows.length > 0 ? <ContextRows rows={rows} /> : null}

          {Object.keys(extra).length > 0 ? <JsonBlock value={extra} /> : null}

          {hasProvider ? (
            <AnimatedDisclosure
              childrenClassName="pt-3"
              className="border-t border-base-300 pt-4"
              header={
                <CompactDisclosureHeader
                  subsection
                  summary={providerEnvironmentSummary(providerHistory)}
                  title="Recorded agent configuration"
                />
              }
              headerClassName="flex w-full cursor-pointer items-center justify-between gap-4 text-left"
            >
              <ContextRows rows={providerRows} />
            </AnimatedDisclosure>
          ) : null}

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

function providerEnvironmentRows(
  history?: Record<string, any> | null,
): ContextRow[] {
  if (!history?.provider_session_id && !history?.provider_environment) return []
  let environment = providerEnvironment(history)
  let changedFields = Array.isArray(environment.changed_fields)
    ? environment.changed_fields
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.replaceAll('_', ' '))
        .join(', ')
    : undefined
  let multiAgent = [
    environment.multi_agent_mode,
    environment.multi_agent_version,
  ]
    .filter(Boolean)
    .join(' / ')

  return [
    ['Agent', environment.provider || history.provider],
    ['Model', environment.model || history.provider_model],
    ['Client', environment.client],
    [
      'Client version',
      environment.client_version || history.provider_client_version,
    ],
    ['Model provider', environment.model_provider],
    ['Source', environment.source],
    ['Working directory', environment.working_directory],
    ['Approval policy', environment.approval_policy],
    ['Permission mode', environment.permission_mode],
    ['Sandbox', environment.sandbox],
    ['Permission profile', environment.permission_profile],
    ['Filesystem policy', environment.file_system_policy],
    ['Network', providerNetwork(environment)],
    ['Reasoning effort', environment.reasoning_effort],
    ['Personality', environment.personality],
    ['Collaboration mode', environment.collaboration_mode],
    ['Multi-agent mode', multiAgent],
    ['Effective date', environment.effective_date],
    ['Timezone', environment.timezone],
    ['Workspace', workspaceScopeLabel(environment.workspace_scope)],
    ['Changed settings', changedFields],
  ].filter((row): row is ContextRow => presentValue(row[1]))
}

function providerEnvironmentSummary(history?: Record<string, any> | null) {
  let environment = providerEnvironment(history)
  let provider = environment.provider || history?.provider
  let version = environment.client_version || history?.provider_client_version
  let model = environment.model || history?.provider_model
  let client = [capitalize(provider), version].filter(Boolean).join(' ')
  let network = providerNetwork(environment)

  return [
    client,
    model,
    environment.sandbox,
    network ? `network ${network}` : undefined,
  ]
    .filter(Boolean)
    .join(' / ')
}

function providerEnvironment(history?: Record<string, any> | null) {
  let value = history?.provider_environment
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {}
}

function providerNetwork(environment: Record<string, any>) {
  if (environment.network_access === true) return 'enabled'
  if (environment.network_access === false) return 'disabled'
  return environment.network_policy
}

function workspaceScopeLabel(value: unknown) {
  if (value === 'target_root') return 'target root'
  if (value === 'includes_target') return 'includes target root'
  if (value === 'outside_target') return 'outside target root'
  return undefined
}

function presentValue(value: unknown) {
  return value !== undefined && value !== null && value !== ''
}

function capitalize(value: unknown) {
  if (typeof value !== 'string' || !value) return value
  return `${value[0].toUpperCase()}${value.slice(1)}`
}

type RunContextPanelProps = {
  context?: Record<string, any> | null
  environment?: Record<string, any> | null
  providerHistory?: Record<string, any> | null
}

type ContextRowsProps = {
  rows: ContextRow[]
}

type ContextRow = [string, unknown]
