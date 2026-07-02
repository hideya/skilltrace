import { ChevronLeftIcon } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Form, redirect, useNavigate, useRevalidator } from 'react-router'
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

            <h1 className="page-title tracking-wider break-words">{title}</h1>
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

      <RunContextPanel context={timeline.context} />
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

function RunReflectionPanel({ reflection }: RunReflectionPanelProps) {
  let [mode, setMode] = useState<ReflectionMode>('pretty')

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Run reflection</h2>
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
          <div className="min-h-0 flex-1">
            <JsonBlock className="h-full max-h-none" flush value={reflection} />
          </div>
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
    ['Agent notes', context?.notes],
  ].filter(([_, value]) => value)
  let extra = extraContext(context)

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Run context</h2>
          <p className="text-sm text-base-content/60">
            Declared execution metadata
          </p>
        </div>
      </div>

      {rows.length > 0 || Object.keys(extra).length > 0 ? (
        <div className="space-y-4">
          {rows.length > 0 ? (
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
        <SnapshotStat label="HEAD" value={shortHash(snapshot.head)} />
        <SnapshotStat label="Branch" value={snapshot.branch || 'detached'} />
        <SnapshotStat
          label="State"
          value={snapshot.dirty ? 'dirty' : 'clean'}
        />
        <SnapshotStat label="Changed" value={files.length} />
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
        <details className="mt-4 rounded-box border border-base-300">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
            {files.length} Changed file{files.length === 1 ? '' : 's'}
          </summary>
          <ul className="border-t border-base-300 p-4">
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
        </details>
      ) : null}

      {untracked.length > 0 ? (
        <details className="mt-4 rounded-box border border-base-300">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
            Untracked instruction files
          </summary>
          <div className="space-y-4 border-t border-base-300 p-4">
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
          </div>
        </details>
      ) : null}

      <InstructionFileDialog
        diff={snapshot.instruction_diff}
        file={selectedFile}
        onClose={() => setSelectedFile(null)}
      />
    </CompactDetailsPanel>
  )
}

function CompactDetailsPanel({
  children,
  summary,
  title,
}: CompactDetailsPanelProps) {
  return (
    <details className="rounded-box border border-base-300 bg-base-100 shadow-sm">
      <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4">
        <div className="min-w-0">
          <h2 className="section-title">{title}</h2>
          <p className="truncate text-sm text-base-content/60">{summary}</p>
        </div>
        <span className="badge badge-outline">details</span>
      </summary>
      <div className="border-t border-base-300 p-5">{children}</div>
    </details>
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
              <SurfaceStat
                label="Instruction profile"
                value={instructionProfileLabel(profile.selected)}
              />
              <SurfaceStat
                label="Requested"
                value={profile.requested || 'auto'}
              />
              <SurfaceStat label="Reason" value={profile.reason || 'unknown'} />
            </div>
          ) : null}

          {infoWarnings.length > 0 ? (
            <div className="alert text-sm alert-info">
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

function SurfaceStat({ label, value }: SurfaceStatProps) {
  return (
    <div className="rounded-box bg-base-200 p-3">
      <p className="text-xs tracking-[0.16em] text-base-content/50 uppercase">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm font-semibold">{value}</p>
    </div>
  )
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
            <h3 className="text-xl font-bold">Instruction file content</h3>
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
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="section-title">Consistency</h2>
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

function PanelHeader({ description, title }: PanelHeaderProps) {
  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="section-title">{title}</h2>
        <p className="text-sm text-base-content/60">{description}</p>
      </div>
    </div>
  )
}

function EmptyPanel({ children }: EmptyPanelProps) {
  return (
    <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
      {children}
    </div>
  )
}

function SnapshotStat({ label, value }: SnapshotStatProps) {
  return (
    <div className="rounded-box bg-base-200 p-3">
      <p className="text-xs tracking-[0.16em] text-base-content/50 uppercase">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm font-semibold">{value}</p>
    </div>
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

function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
      <p className="text-left text-xs tracking-[0.2em] text-base-content/50 uppercase">
        {label}
      </p>
      <p className="mt-2 truncate text-right text-1.5xl font-bold">{value}</p>
    </div>
  )
}

function Timeline({ events }: TimelineProps) {
  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-5">
        <div>
          <h2 className="section-title">Timeline</h2>
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
  let process = observedProcessForEvent(event)

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

function JsonBlock({ className = '', flush = false, value }: JsonBlockProps) {
  if (!value || Object.keys(value).length === 0) return null

  return (
    <pre
      className={`${flush ? '' : 'mt-4'} max-h-80 overflow-auto rounded-box bg-base-200 p-3 text-xs leading-relaxed ${className}`}
    >
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
  if (isSemanticEvent(event)) return 'bg-indigo-400'
  if (isPassiveEvent(event)) return 'bg-teal-400'
  return 'bg-base-content'
}

function eventDotSizeClass(event: any) {
  if (isSemanticEvent(event)) return 'top-4.5 left-1.25 size-3.5'
  if (isPassiveEvent(event)) return 'top-4.75 left-1.5 size-3'
  return 'top-5.5 left-2 size-2'
}

function eventTitleClass(event: any) {
  if (isSemanticEvent(event)) return 'font-semibold text-sm'
  if (isPassiveReadEvent(event)) return 'font-semibold text-sm'
  return 'font-normal'
}

function eventFileNameClass(event: any) {
  if (isSemanticEvent(event)) return 'text-indigo-500'
  if (isPassiveEvent(event)) return 'text-teal-500'
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

function observedProcessForEvent(event: any) {
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

type RunSnapshotPanelProps = {
  snapshot?: RunSnapshot | null
}

type InstructionSurfacesPanelProps = {
  profile?: SelectedInstructionProfile | null
  report?: InstructionSurfaceReport | null
}

type CompactDetailsPanelProps = {
  children: ReactNode
  summary: string
  title: string
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

type SurfaceStatProps = {
  label: string
  value: any
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

type PanelHeaderProps = {
  title: string
  description: string
}

type EmptyPanelProps = {
  children: any
}

type SnapshotStatProps = {
  label: string
  value: any
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
  state?: 'complete' | 'partial' | 'missing'
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
  className?: string
  flush?: boolean
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
