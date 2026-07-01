import { type KeyboardEvent, useEffect, useState } from 'react'
import { Form, redirect, useRevalidator } from 'react-router'
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
  let [compareGroupKey, setCompareGroupKey] = useState<string | null>(null)
  let [selectedRunIds, setSelectedRunIds] = useState<Record<string, string>>({})
  let [expandedKeys, setExpandedKeys] = useState<string[]>([])
  let groups = groupSummaries(summaries)
  let hasRunningRun = summaries.some((summary) => summary.result === 'running')
  useAutoRefresh(hasRunningRun)

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

  function startCompare(group: RunGroup) {
    let selected = defaultCompareSelection(group)
    setIsEditing(false)
    setCompareGroupKey(group.key)
    setSelectedRunIds(selected)
    setExpandedKeys((current) => {
      let next = [...new Set([...current, group.key])]
      saveExpandedRunGroups(next)
      return next
    })
  }

  function cancelCompare() {
    setCompareGroupKey(null)
    setSelectedRunIds({})
  }

  function selectRun(summary: any) {
    setSelectedRunIds((current) => ({
      ...current,
      [summary.trace_mode]: summary.run.public_id,
    }))
  }

  function compareSelectedHref() {
    let runIds = Object.values(selectedRunIds).filter(Boolean)
    return `/app/runs/compare?runs=${encodeURIComponent(runIds.join(','))}`
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 pt-10 pb-40">
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
        <div className="flex flex-row gap-4">
          {isEditing ? (
            <div className="flex items-center justify-end gap-2">
              <button
                className="btn bg-pink-500 text-white btn-sm"
                form="delete-runs-form"
                type="submit"
              >
                Delete selected
              </button>
            </div>
          ) : null}

          {summaries.length > 0 ? (
            <button
              className={`btn w-24 btn-sm ${isEditing ? 'btn-neutral' : 'btn-outline'}`}
              onClick={() => {
                cancelCompare()
                setIsEditing(!isEditing)
              }}
              type="button"
            >
              {isEditing ? 'Done' : 'Edit'}
            </button>
          ) : null}
        </div>
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

          {groups.map((group) => (
            <RunGroup
              compareHref={compareSelectedHref()}
              compareSelection={selectedRunIds}
              isComparing={compareGroupKey === group.key}
              group={group}
              isEditing={isEditing}
              isOpen={
                isEditing ||
                compareGroupKey === group.key ||
                expandedKeys.includes(group.key)
              }
              key={group.key}
              onCancelCompare={cancelCompare}
              onSelectRun={selectRun}
              onStartCompare={startCompare}
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

function RunGroup({
  compareHref,
  compareSelection,
  group,
  isComparing,
  isEditing,
  isOpen,
  onCancelCompare,
  onSelectRun,
  onStartCompare,
  onToggle,
}: RunGroupProps) {
  let selectedCount = Object.values(compareSelection).filter(Boolean).length
  let canCompareSelected = isComparing && selectedCount >= 2

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
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={group.latestStatus} />
          {isComparing ? (
            <>
              <button
                className="btn btn-outline btn-sm"
                onClick={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onCancelCompare()
                }}
                type="button"
              >
                Cancel
              </button>
              <a
                aria-disabled={!canCompareSelected}
                className={`btn bg-sky-500 text-white btn-sm ${canCompareSelected ? '' : 'btn-disabled'}`}
                href={canCompareSelected ? compareHref : undefined}
                onClick={(event) => event.stopPropagation()}
              >
                Compare Selected
              </a>
            </>
          ) : canCompareModes(group) && !isEditing ? (
            <button
              className="btn bg-sky-400 btn-sm"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onStartCompare(group)
              }}
              type="button"
            >
              Compare Modes
            </button>
          ) : null}
        </div>
      </summary>

      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              {isEditing ? <th>Select</th> : null}
              {isComparing ? <th className="text-center">Compare</th> : null}
              <th>Run</th>
              <th className="text-center">Mode</th>
              <th className="text-center">Status</th>
              <th className="text-center">Result</th>
              <th className="text-center">Model</th>
              <th className="text-center">Client</th>
              <th>Events</th>
            </tr>
          </thead>
          <tbody>
            {group.summaries.map((summary) => (
              <RunRow
                compareSelection={compareSelection}
                isComparing={isComparing}
                isEditing={isEditing}
                key={summary.run.id}
                onSelectRun={onSelectRun}
                summary={summary}
              />
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

function RunRow({
  compareSelection,
  isComparing,
  isEditing,
  onSelectRun,
  summary,
}: RunRowProps) {
  let run = summary.run
  let label = run.name || run.public_id
  let href = `/app/runs/${run.public_id}`
  let compareEligible = isCompareEligible(summary)
  let isSelected = compareSelection[summary.trace_mode] === run.public_id

  function navigateToRun() {
    if (isEditing || isComparing) return
    window.location.assign(href)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTableRowElement>) {
    if (isEditing || isComparing) return
    if (event.key !== 'Enter' && event.key !== ' ') return

    event.preventDefault()
    navigateToRun()
  }

  return (
    <tr
      className={
        isEditing || isComparing ? '' : 'cursor-pointer hover:bg-base-200/70'
      }
      onClick={navigateToRun}
      onKeyDown={handleKeyDown}
      role={isEditing || isComparing ? undefined : 'link'}
      tabIndex={isEditing || isComparing ? undefined : 0}
    >
      {isEditing ? (
        <td>
          <input
            className="checkbox checkbox-sm"
            disabled={summary.status === 'active'}
            form="delete-runs-form"
            name="run_ids"
            type="checkbox"
            value={run.public_id}
          />
        </td>
      ) : null}
      {isComparing ? (
        <td className="text-center">
          <input
            aria-label={`Select ${run.public_id} for comparison`}
            checked={isSelected}
            className="radio radio-sm"
            disabled={!compareEligible}
            name={`compare-${summary.trace_mode}`}
            onChange={() => onSelectRun(summary)}
            type="radio"
          />
        </td>
      ) : null}
      <td className="max-w-64">
        <span className="inline-block max-w-64 font-medium">
          <RunLabel label={label} />
        </span>
        {run.description ? (
          <div className="mt-1 max-w-md truncate text-xs text-base-content/60">
            {run.description}
          </div>
        ) : null}
      </td>
      <td className="text-center">
        <ModeBadge mode={summary.trace_mode} />
      </td>
      <td className="text-center">
        <StatusBadge status={summary.status ?? run.status} />
      </td>
      <td className="text-center">
        <ResultBadge result={summary.result} mode={summary.trace_mode} />
      </td>
      <td className="text-center">
        <ModelCell context={summary.context} />
      </td>
      <td className="text-center">
        <ClientCell context={summary.context} />
      </td>
      <td className="text-right">{summary.event_count}</td>
    </tr>
  )
}

function groupSummaries(summaries: any[]) {
  let groups = new Map<string, RunGroup>()

  for (let summary of summaries) {
    let run = summary.run
    let targetRoot = run.bag?.target_root || run.description || 'unknown target'
    let key = groupKeyForRun(run)
    let group = groups.get(key)

    if (!group) {
      group = {
        key,
        label: key,
        targetRoot,
        latestStatus: summary.status ?? run.status,
        summaries: [],
      }
      groups.set(key, group)
    }

    group.summaries.push(summary)
  }

  return [...groups.values()]
}

function groupKeyForRun(run: any) {
  let targetRoot = run.bag?.target_root || run.description || 'unknown target'
  let targetName =
    run.bag?.target_name || targetRoot.split(/[\\/]/).at(-1) || 'repo'
  let pathHash =
    run.bag?.path_hash || pathHashFromRunId(run.public_id) || 'unknown'

  return `${targetName}-${pathHash}`
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

function canCompareModes(group: RunGroup) {
  let modes = new Set(
    group.summaries
      .filter((summary) => isCompareEligible(summary))
      .map((summary) => summary.trace_mode)
      .filter((mode) => mode !== 'unknown'),
  )

  return modes.size >= 2
}

function defaultCompareSelection(group: RunGroup) {
  let selected: Record<string, string> = {}

  for (let mode of TRACE_MODES) {
    let summary = group.summaries.find(
      (item) => item.trace_mode === mode && isCompareEligible(item),
    )
    if (summary) selected[mode] = summary.run.public_id
  }

  return selected
}

function isCompareEligible(summary: any) {
  return (
    summary.status === 'finished' &&
    summary.result === 'pass' &&
    TRACE_MODES.includes(summary.trace_mode)
  )
}

function saveExpandedRunGroups(keys: string[]) {
  if (typeof window === 'undefined') return
  window.sessionStorage.setItem(EXPANDED_RUN_GROUPS_KEY, JSON.stringify(keys))
}

function ResultBadge({ result, mode }: ResultBadgeProps) {
  let className =
    result === 'running'
      ? 'badge-info'
      : result === 'pass'
        ? mode === 'passive_only'
          ? 'badge-outline border-teal-500 text-teal-600'
          : 'badge-success'
        : result === 'warning'
          ? 'badge-warning'
          : result === 'incomplete'
            ? 'badge-warning'
            : 'badge-ghost'

  return (
    <span className={`badge ${className}`}>{resultLabel(result, mode)}</span>
  )
}

function StatusBadge({ status }: StatusBadgeProps) {
  let className =
    status === 'interrupted'
      ? 'badge-warning'
      : status === 'finished'
        ? 'badge-success'
        : status === 'active'
          ? 'badge-info'
          : 'badge-outline badge-neutral'

  return <span className={`badge ${className}`}>{statusLabel(status)}</span>
}

function ModeBadge({ mode }: ModeBadgeProps) {
  return (
    <span className="badge badge-outline whitespace-nowrap">
      {traceModeLabel(mode)}
    </span>
  )
}

function RunLabel({ label }: RunLabelProps) {
  let parts = splitRunLabel(label)
  if (!parts) return <span className="break-words">{label}</span>

  return (
    <span className="flex flex-col gap-2 text-xs leading-tight">
      <span>{parts.stem}</span>
      <span className="font-mono text-sm font-bold">{parts.timestamp}</span>
    </span>
  )
}

function resultLabel(result: ResultState, mode?: string) {
  if (result === 'pass' && mode === 'passive_only') return 'Captured'
  if (result === 'pass') return 'Pass'
  if (result === 'warning') return 'Warning'
  if (result === 'incomplete') return 'Incomplete'
  if (result === 'running') return 'Running'
  return 'Unknown'
}

function splitRunLabel(label: string) {
  let match = label.match(/^(.*-)(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2})$/)
  if (!match) return null

  return {
    stem: match[1],
    timestamp: match[2],
  }
}

function statusLabel(status: string) {
  if (status === 'active') return 'Active'
  if (status === 'finished') return 'Finished'
  if (status === 'interrupted') return 'Interrupted'
  return status
}

function traceModeLabel(mode?: string) {
  if (mode === 'passive_reflection') return 'p + reflection'
  if (mode === 'passive_only') return 'passive only'
  if (mode === 'full') return 'full'
  return 'unknown'
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
    summaries: any[]
  }
}

type RunRowProps = {
  summary: any
  isEditing: boolean
  isComparing: boolean
  compareSelection: Record<string, string>
  onSelectRun: (summary: any) => void
}

type RunGroupProps = {
  compareHref: string
  compareSelection: Record<string, string>
  group: RunGroup
  isComparing: boolean
  isEditing: boolean
  isOpen: boolean
  onCancelCompare: () => void
  onSelectRun: (summary: any) => void
  onStartCompare: (group: RunGroup) => void
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
  result: ResultState
  mode?: string
}

type StatusBadgeProps = {
  status: string
}

type ModeBadgeProps = {
  mode?: string
}

type RunLabelProps = {
  label: string
}

type ResultState = 'pass' | 'warning' | 'incomplete' | 'running' | 'unknown'

type ModelCellProps = {
  context?: Record<string, any> | null
}

type ClientCellProps = {
  context?: Record<string, any> | null
}

const EXPANDED_RUN_GROUPS_KEY = 'skilltrace.expandedRunGroups'
const RUN_REFRESH_MS = 3000
const TRACE_MODES = ['full', 'passive_reflection', 'passive_only']
