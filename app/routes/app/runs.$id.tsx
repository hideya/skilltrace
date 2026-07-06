import { ChevronLeftIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Form, redirect, useNavigate, useRevalidator } from 'react-router'
import { notFoundError } from '~/lib/.server/errors'
import { clearRunEvents, getRunTimeline } from '~/models/.server/trace'
import { AnimatedDisclosure } from '~/ui/animated-disclosure'
import {
  CompactDetailsPanel,
  EmptyPanel,
  Metric,
  SectionSummaryHeader,
  StatTile,
} from './+/run-detail-ui'
import { RunContextPanel } from './+/run-context-panel'
import { RunReflectionPanel } from './+/run-reflection-panel'
import { Timeline } from './+/run-timeline-panel'

// Remote/auth mode reference:
// import { requireUser } from '~/.server/auth/middlewares'

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
  let note = runNote(run)
  useAutoRefresh(run.status === 'active')

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 pt-10 pb-40">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="mb-2 min-w-0 space-y-2">
            <div className="flex flex-row items-center gap-2">
              <BackButton />
              <div className="badge rounded-full badge-outline">
                Run timeline
              </div>
            </div>

            <h1 className="page-title tracking-wide break-words">{title}</h1>
            {run.description ? (
              <p className="font-mono text-base-content/70">
                {run.description}
              </p>
            ) : null}
            {note ? (
              <p className="font-medium tracking-wider text-info">{note}</p>
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
        <Metric
          label="Result"
          value={resultLabel(timeline.result, timeline.trace_mode)}
        />
        <Metric label="Events" value={timeline.events.length} />
        <Metric label="Passive" value={timeline.passive_events.length} />
        <Metric label="Semantic" value={timeline.semantic_events.length} />
      </section>

      <RunContextPanel
        context={timeline.context}
        environment={timeline.execution_environment}
      />
      <RunSnapshotPanel snapshot={timeline.git_snapshot} />
      {timeline.instruction_surfaces ? (
        <InstructionSurfacesPanel
          profile={timeline.instruction_profile}
          report={timeline.instruction_surfaces}
        />
      ) : null}

      <ConsistencyPanel
        rows={timeline.consistency_matrix}
        traceMode={timeline.trace_mode}
      />

      <section className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Timeline events={timeline.events} />

        <aside className="flex min-h-0 flex-col lg:self-stretch">
          <RunReflectionPanel reflection={timeline.reflection} />
        </aside>
      </section>
    </main>
  )
}

function runNote(run: any) {
  let note = run.bag?.note
  return typeof note === 'string' && note.trim() ? note.trim() : ''
}

function BackButton() {
  let navigate = useNavigate()

  function goBack() {
    let referrer = document.referrer ? new URL(document.referrer) : null
    let hasLocalReferrer = referrer?.origin === window.location.origin
    let hasRouterHistory = Number(window.history.state?.idx) > 0

    if (hasLocalReferrer || hasRouterHistory) {
      navigate(-1)
      return
    }

    navigate('/app/runs')
  }

  return (
    <button
      aria-label="Back"
      className="link rounded-full bg-primary text-white link-hover"
      onClick={goBack}
      type="button"
    >
      <ChevronLeftIcon className="size-10" />
    </button>
  )
}

function RunSnapshotPanel({ snapshot }: RunSnapshotPanelProps) {
  let [selectedFile, setSelectedFile] =
    useState<RunSnapshotInstructionFile | null>(null)

  if (!snapshot) {
    return (
      <CompactDetailsPanel summary="not recorded" title="Run snapshot">
        <EmptyPanel>No Git snapshot recorded.</EmptyPanel>
      </CompactDetailsPanel>
    )
  }

  if (!snapshot.available) {
    return (
      <CompactDetailsPanel
        summary={snapshot.reason || 'not in Git worktree'}
        title="Run snapshot"
      >
        <EmptyPanel>
          {snapshot.reason || 'Target was not inside a Git worktree.'}
        </EmptyPanel>
      </CompactDetailsPanel>
    )
  }

  let files = Array.isArray(snapshot.files) ? snapshot.files : []
  let untracked = Array.isArray(snapshot.untracked_instruction_files)
    ? snapshot.untracked_instruction_files
    : []
  let instructionContents = Array.isArray(snapshot.instruction_file_contents)
    ? snapshot.instruction_file_contents
    : []

  return (
    <CompactDetailsPanel
      summary={runSnapshotSummary(snapshot, files.length)}
      title="Run snapshot"
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <StatTile label="HEAD" value={shortHash(snapshot.head)} />
        <StatTile label="Branch" value={snapshot.branch || 'detached'} />
        <StatTile
          label="State"
          value={snapshot.dirty ? 'dirty' : 'clean'}
        />
        <StatTile label="Changed" value={files.length} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {untracked.length > 0 ? (
          <span className="badge badge-outline">
            {untracked.length} untracked instruction file
            {untracked.length === 1 ? '' : 's'}
          </span>
        ) : null}
        {snapshot.instruction_diff_truncated ? (
          <span className="badge badge-warning">diff truncated</span>
        ) : null}
      </div>

      {files.length > 0 ? (
        <AnimatedDisclosure
          childrenClassName="border-t border-base-300 p-4"
          className="mt-4 rounded-box border border-base-300"
          header={`${files.length} Changed file${files.length === 1 ? '' : 's'}`}
          headerClassName="w-full cursor-pointer px-4 py-3 text-left text-sm font-semibold"
        >
          <ul>
            {files.map((file) => {
              let instructionFile = instructionContents.find(
                (item) => item.path === file.path,
              )

              return (
                <SnapshotFileRow
                  file={file}
                  instructionFile={instructionFile}
                  key={`${file.status}:${file.path}:${file.previous_path ?? ''}`}
                  onSelect={setSelectedFile}
                />
              )
            })}
          </ul>
        </AnimatedDisclosure>
      ) : null}

      {untracked.length > 0 ? (
        <AnimatedDisclosure
          childrenClassName="space-y-4 border-t border-base-300 p-4"
          className="mt-4 rounded-box border border-base-300"
          header="Untracked instruction files"
          headerClassName="w-full cursor-pointer px-4 py-3 text-left text-sm font-semibold"
        >
          {untracked.map((file) => (
            <section className="space-y-2" key={file.path}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-mono text-xs font-semibold break-words">
                  {file.path}
                </h3>
                {file.truncated ? (
                  <span className="badge badge-xs badge-warning">
                    truncated
                  </span>
                ) : null}
              </div>
              <pre className="max-h-72 overflow-auto rounded-box bg-base-200 p-3 text-xs leading-relaxed">
                {file.content}
              </pre>
            </section>
          ))}
        </AnimatedDisclosure>
      ) : null}

      <InstructionFileDialog
        diff={snapshot.instruction_diff}
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
      />
    </CompactDetailsPanel>
  )
}

function InstructionSurfacesPanel({
  profile,
  report,
}: InstructionSurfacesPanelProps) {
  let surfaces = Array.isArray(report?.surfaces) ? report.surfaces : []
  let aliasGroups = Array.isArray(report?.alias_groups)
    ? report.alias_groups
    : []
  let warnings = Array.isArray(profile?.warnings) ? profile.warnings : []
  let infoWarnings = warnings.filter(isInstructionProfileDefaultWarning)
  let warningWarnings = warnings.filter(
    (warning) => !isInstructionProfileDefaultWarning(warning),
  )

  return (
    <CompactDetailsPanel
      summary={instructionSurfaceSummary(profile, surfaces)}
      title="Instruction surfaces"
    >
      {surfaces.length > 0 ? (
        <div className="space-y-4">
          {profile ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile
                label="Instruction profile"
                value={instructionProfileLabel(profile.selected)}
              />
              <StatTile
                label="Requested"
                value={profile.requested || 'auto'}
              />
              <StatTile label="Reason" value={profile.reason || 'unknown'} />
            </div>
          ) : null}

          {infoWarnings.length > 0 ? (
            <div className="p-1 text-sm font-semibold text-info">
              <ul className="list-disc pl-5">
                {infoWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {warningWarnings.length > 0 ? (
            <div className="alert text-sm alert-warning">
              <ul className="list-disc pl-5">
                {warningWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Instruction profile</th>
                  <th>Kind</th>
                  <th>Logical path</th>
                  <th>Resolved path</th>
                  <th>Symlink</th>
                </tr>
              </thead>
              <tbody>
                {surfaces.map((surface, index) => {
                  let resolvedPath =
                    surface.resolved_path ?? surface.realpath_error ?? 'unknown'

                  return (
                    <tr
                      key={`${surface.instruction_profile}:${surface.logical_path}:${index}`}
                    >
                      <td>
                        <span className="badge badge-outline badge-sm">
                          {instructionProfileLabel(surface.instruction_profile)}
                        </span>
                      </td>
                      <td>{surfaceKindLabel(surface.kind)}</td>
                      <td className="font-mono text-xs break-words">
                        {surface.logical_path}
                      </td>
                      <td className="font-mono text-xs break-words text-base-content/60">
                        {resolvedPath}
                      </td>
                      <td>{surface.is_symlink ? 'yes' : 'no'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {aliasGroups.length > 0 ? (
            <div className="rounded-box border border-base-300 bg-base-200 p-3">
              <h3 className="text-sm font-semibold text-base-content/70">
                Shared resolved targets
              </h3>
              <ul className="mt-2 space-y-2">
                {aliasGroups.map((group, index) => (
                  <li
                    className="text-sm"
                    key={`${group.resolved_path}:${index}`}
                  >
                    <div className="font-mono text-xs break-words">
                      {group.logical_paths.join(' -> ')}
                    </div>
                    <div className="mt-1 font-mono text-xs break-words text-base-content/50">
                      {group.resolved_path}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyPanel>No instruction surfaces detected.</EmptyPanel>
      )}
    </CompactDetailsPanel>
  )
}

function isInstructionProfileDefaultWarning(warning: string) {
  return warning.startsWith('Multiple instruction profiles were detected')
}

function runSnapshotSummary(snapshot: RunSnapshot, changedCount: number) {
  let parts = [
    shortHash(snapshot.head),
    snapshot.branch || 'detached',
    snapshot.dirty ? 'dirty' : 'clean',
  ]

  if (changedCount > 0) {
    parts.push(`${changedCount} changed`)
  }

  return parts.filter(Boolean).join(' / ')
}

function instructionSurfaceSummary(
  profile?: SelectedInstructionProfile | null,
  surfaces: InstructionSurface[] = [],
) {
  let profileLabel = instructionProfileLabel(profile?.selected)
  let requested = profile?.requested || 'auto'
  let suffix = surfaces.length === 0 ? ' / no surfaces' : ''

  return `${profileLabel} / ${requested}${suffix}`
}

function SnapshotFileRow({
  file,
  instructionFile,
  onSelect,
}: SnapshotFileRowProps) {
  let label = file.target_relative_path ?? file.path
  let className =
    'grid w-full gap-2 py-1 text-left text-xs sm:grid-cols-[4rem_minmax(0,1fr)]'

  if (instructionFile) {
    return (
      <li className="rounded bg-info/10">
        <button
          className={`${className} cursor-pointer px-2 hover:bg-info/20`}
          onClick={() => onSelect(instructionFile)}
          type="button"
        >
          <span className="font-mono text-info">{file.status}</span>
          <span className="font-mono font-semibold break-words text-info">
            {file.previous_path ? `${file.previous_path} -> ` : null}
            {label}
          </span>
        </button>
      </li>
    )
  }

  return (
    <li className={className}>
      <span className="font-mono text-base-content/50">{file.status}</span>
      <span className="font-mono break-words">
        {file.previous_path ? `${file.previous_path} -> ` : null}
        {label}
      </span>
    </li>
  )
}

function InstructionFileDialog({
  diff,
  file,
  onClose,
}: InstructionFileDialogProps) {
  if (!file) return null

  let changedLines = changedLinesForFile(diff, file.path)
  let lines = file.content ? file.content.split('\n') : ['(empty file)']

  return (
    <dialog className="modal-open modal">
      <div className="modal-box max-w-5xl">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-xl font-semibold">Instruction file content</h3>
            <p className="mt-1 font-mono text-xs break-words text-base-content/60">
              {file.target_relative_path ?? file.path}
            </p>
          </div>
          <button
            className="btn btn-outline btn-sm"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
        {file.truncated ? (
          <div className="mb-4 alert alert-warning">
            Captured content was truncated.
          </div>
        ) : null}
        <div className="max-h-[70vh] overflow-auto rounded-box bg-base-200 py-4 text-xs leading-relaxed">
          {lines.map((line, index) => (
            <div
              className={`grid grid-cols-[4rem_minmax(0,1fr)] gap-3 px-4 ${
                changedLines.has(index + 1) ? 'bg-warning/20' : ''
              }`}
              key={index}
            >
              <span className="text-right font-mono text-base-content/40 select-none">
                {index + 1}
              </span>
              <span className="font-mono whitespace-pre-wrap">
                {line || ' '}
              </span>
            </div>
          ))}
        </div>
      </div>
      <button className="modal-backdrop" onClick={onClose} type="button">
        close
      </button>
    </dialog>
  )
}

function changedLinesForFile(diff: string | undefined, filePath: string) {
  let changedLines = new Set<number>()
  if (!diff) return changedLines

  let inFile = false
  let newLine = 0

  for (let line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      inFile = diffHeaderMatchesFile(line, filePath)
      newLine = 0
      continue
    }

    if (!inFile) continue

    let hunk = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/)
    if (hunk) {
      newLine = Number(hunk[1])
      continue
    }

    if (newLine === 0) continue
    if (line.startsWith('+++') || line.startsWith('---')) continue

    if (line.startsWith('+')) {
      changedLines.add(newLine)
      newLine += 1
      continue
    }

    if (line.startsWith('-')) continue

    newLine += 1
  }

  return changedLines
}

function diffHeaderMatchesFile(line: string, filePath: string) {
  let normalized = filePath.replaceAll('\\', '/')
  return (
    line.includes(` b/${normalized}`) ||
    line.endsWith(` b/${normalized}`) ||
    line.includes(` a/${normalized} `)
  )
}

function ConsistencyPanel({ rows, traceMode }: ConsistencyPanelProps) {
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
  state,
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
  let className = active
    ? activeClass
    : isPartial
      ? 'bg-indigo-400/50'
      : 'bg-base-300'
  let label = active
    ? 'Observed'
    : isPartial
      ? 'Started, waiting for finish'
      : 'Missing'

  return (
    <span
      aria-label={label}
      className={`inline-block size-3 rounded-full ${className}`}
      title={label}
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

function instructionProfileLabel(profile?: string) {
  if (profile === 'agents_md') return 'AGENTS.md'
  if (profile === 'claude_code') return 'Claude Code'
  return profile || 'unknown'
}

function surfaceKindLabel(kind?: string) {
  if (kind === 'instruction_file') return 'Instruction'
  if (kind === 'skill_root') return 'Skill root'
  return kind || 'unknown'
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

function resultLabel(result?: string, mode?: string) {
  if (result === 'pass' && mode === 'passive_only') return 'captured'
  if (result === 'pass') return 'pass'
  if (result === 'warning') return 'warning'
  if (result === 'incomplete') return 'incomplete'
  if (result === 'running') return 'running'
  return result ?? 'unknown'
}

function shortHash(value?: string | null) {
  if (!value) return 'unknown'
  return value.slice(0, 8)
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

type ConsistencyPanelProps = {
  rows: any[]
  traceMode?: string
}

type RunSnapshotPanelProps = {
  snapshot?: RunSnapshot | null
}

type InstructionSurfacesPanelProps = {
  profile?: SelectedInstructionProfile | null
  report?: InstructionSurfaceReport | null
}

type SelectedInstructionProfile = {
  selected?: string
  requested?: string
  reason?: string
  warnings?: string[]
}

type InstructionSurfaceReport = {
  surfaces?: InstructionSurface[]
  alias_groups?: InstructionSurfaceAliasGroup[]
}

type InstructionSurface = {
  instruction_profile?: string
  kind?: string
  logical_path?: string
  resolved_path?: string
  realpath_error?: string
  is_symlink?: boolean
}

type InstructionSurfaceAliasGroup = {
  resolved_path?: string
  logical_paths: string[]
}

type RunSnapshot = {
  available?: boolean
  reason?: string
  root?: string
  head?: string | null
  branch?: string | null
  dirty?: boolean
  files?: RunSnapshotFile[]
  instruction_files?: string[]
  instruction_diff?: string
  instruction_diff_truncated?: boolean
  instruction_file_contents?: RunSnapshotInstructionFile[]
  untracked_instruction_files?: RunSnapshotUntrackedFile[]
}

type RunSnapshotFile = {
  path: string
  status: string
  previous_path?: string
  target_relative_path?: string
}

type RunSnapshotInstructionFile = {
  path: string
  target_relative_path?: string
  status: string
  content: string
  truncated?: boolean
}

type RunSnapshotUntrackedFile = {
  path: string
  content: string
  truncated?: boolean
}

type SnapshotFileRowProps = {
  file: RunSnapshotFile
  instructionFile?: RunSnapshotInstructionFile
  onSelect: (file: RunSnapshotInstructionFile) => void
}

type InstructionFileDialogProps = {
  diff?: string
  file: RunSnapshotInstructionFile | null
  onClose: () => void
}

type ConsistencyDotProps = {
  active: boolean
  expected?: boolean
  state?: 'complete' | 'partial' | 'missing'
  tone: 'passive' | 'semantic'
}

const RUN_REFRESH_MS = 3000
