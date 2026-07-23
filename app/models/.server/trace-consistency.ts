import { skillDirectoryKey } from '~/lib/skill-path'
import { normalizeTraceMode, type TraceMode } from '~/lib/trace-mode'

export function traceConsistencyMatrix(
  events: TraceEventLike[],
  options: ConsistencyOptions = {},
) {
  let traceMode = normalizeTraceMode(options.traceMode)
  let expected = expectedSources(traceMode)
  let reflection = latestReflection(events)
  let rows: ConsistencyMatrixDraftRow[] = []
  let providerContextPaths: string[] = []

  for (let event of events) {
    if (event.source === 'passive_file_harness') {
      if (event.event_type === 'skill_file_read') {
        upsertMatrixRow(rows, 'Skill', observedPath(event), 'passive')
      } else if (event.event_type === 'skill_reference_read') {
        upsertMatrixRow(rows, 'Reference', observedPath(event), 'passive')
      }
    }

    if (event.source === 'mcp_semantic_logger') {
      if (event.event_type === 'skill_use_started') {
        upsertMatrixRow(
          rows,
          'Skill',
          semanticSkillPath(event),
          'semantic_started',
        )
      } else if (event.event_type === 'skill_use_finished') {
        upsertMatrixRow(
          rows,
          'Skill',
          semanticSkillPath(event),
          'semantic_finished',
        )
      } else if (event.event_type === 'skill_reference_read') {
        upsertMatrixRow(
          rows,
          'Reference',
          semanticReferencePath(event),
          'semantic',
        )
      }
    }

    if (event.source === 'provider_history') {
      if (event.event_type === 'skill_file_read') {
        upsertMatrixRow(rows, 'Skill', observedPath(event), 'provider')
      } else if (event.event_type === 'skill_reference_read') {
        upsertMatrixRow(rows, 'Reference', observedPath(event), 'provider')
      } else if (isProviderContextRead(event)) {
        providerContextPaths.push(...stringList(event.artifact_refs))
      }
    }
  }

  for (let file of stringList(reflection?.skills_read)) {
    upsertMatrixRow(rows, 'Skill', file, 'reflection')
  }

  for (let file of stringList(reflection?.references_read)) {
    upsertMatrixRow(rows, 'Reference', file, 'reflection')
  }

  for (let file of providerContextPaths) {
    markProviderContext(rows, file)
  }

  return rows
    .map((row) => finalizeMatrixRow(row, expected, rows))
    .toSorted((left, right) => {
      let kind = kindOrder(left.kind) - kindOrder(right.kind)
      return kind || left.file.localeCompare(right.file)
    })
}

export function summarizeConsistencyMatrix(rows: ConsistencyMatrixRow[]) {
  let judgedRows = rows.filter((row) => row.status !== 'provider_only')
  if (judgedRows.length === 0) return 'unknown'
  if (
    judgedRows.some(
      (row) => row.status !== 'pass' && row.status !== 'discovered',
    )
  ) {
    return 'warning'
  }
  return 'pass'
}

function latestReflection(events: TraceEventLike[]) {
  return events
    .filter((event) => event.event_type === 'run_reflection_declared')
    .toSorted(
      (a, b) =>
        new Date(b.timestamp ?? 0).getTime() -
        new Date(a.timestamp ?? 0).getTime(),
    )[0]?.payload?.data
}

function observedPath(event: TraceEventLike) {
  return observedPathCandidates(event)[0]
}

function observedPathCandidates(event: TraceEventLike) {
  return [
    event.skill_path,
    event.payload?.file_path,
    event.payload?.path,
    event.payload?.skill_path,
  ].filter((value): value is string => typeof value === 'string' && !!value)
}

function semanticSkillPath(event: TraceEventLike) {
  return (
    event.skill_path ||
    event.payload?.data?.skill_path ||
    event.payload?.skill_path ||
    event.skill_name ||
    null
  )
}

function semanticReferencePath(event: TraceEventLike) {
  return (
    event.payload?.data?.reference_path ||
    event.payload?.reference_path ||
    event.payload?.file_path ||
    null
  )
}

function pathsMatch(left: string, right: string) {
  if (left === right) return true
  return left.endsWith(`/${right}`) || right.endsWith(`/${left}`)
}

function normalizePath(value: string) {
  return value
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .toLowerCase()
}

function stringList(value: any) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.trim())
}

function upsertMatrixRow(
  rows: ConsistencyMatrixDraftRow[],
  kind: ConsistencyFileKind,
  file: string | null | undefined,
  source: ConsistencyMatrixSource,
) {
  if (!file) return
  if (isInstrumentationPath(file)) return

  let row = rows.find(
    (item) =>
      item.kind === kind &&
      pathsMatch(normalizePath(item.file), normalizePath(file)),
  )

  if (!row) {
    row = {
      kind,
      file,
      passive: false,
      semantic: false,
      semantic_started: false,
      semantic_finished: false,
      reflection: false,
      provider: false,
      provider_context: false,
    }
    rows.push(row)
  }

  if (source !== 'provider') row.file = displayFile(row.file, file)
  if (source === 'semantic_started') {
    row.semantic_started = true
  } else if (source === 'semantic_finished') {
    row.semantic_finished = true
  } else {
    row[source] = true
  }
}

function isProviderContextRead(event: TraceEventLike) {
  return (
    event.event_type === 'execution_operation_observed' &&
    event.payload?.operation_kind === 'file_read' &&
    event.payload?.evidence_status === 'context_only'
  )
}

function markProviderContext(
  rows: ConsistencyMatrixDraftRow[],
  file: string,
) {
  let normalizedFile = normalizePath(file)

  for (let row of rows) {
    if (pathsMatch(normalizePath(row.file), normalizedFile)) {
      row.provider_context = true
    }
  }
}

function displayFile(current: string, next: string) {
  if (pathLooksAbsolute(next) && !pathLooksAbsolute(current)) return next
  if (
    next.length > current.length &&
    pathLooksAbsolute(next) === pathLooksAbsolute(current)
  ) {
    return next
  }
  return current
}

function pathLooksAbsolute(value: string) {
  return value.startsWith('/') || /^[a-z]:\//i.test(value)
}

function isInstrumentationPath(value: string) {
  return normalizePath(value).endsWith('.skilltrace/instrumentation.md')
}

function isSkillEntrypointPath(value: string) {
  return normalizePath(value).split('/').at(-1) === 'skill.md'
}

function isDiscoveredMatrixRow(
  row: ConsistencyMatrixDraftRow,
  rows: ConsistencyMatrixDraftRow[],
) {
  if (row.kind !== 'Skill') return false
  if (!row.passive || row.semantic_started || row.semantic_finished)
    return false
  if (row.reflection || !isSkillEntrypointPath(row.file)) return false

  let key = skillDirectoryKey(row.file)
  if (!key) return true

  return !rows.some(
    (item) => item.kind === 'Reference' && skillDirectoryKey(item.file) === key,
  )
}

function matrixIssueCount(
  row: ConsistencyMatrixDraftRow,
  expected: ConsistencyMatrixExpectedSources,
) {
  return [
    expected.passive && !row.passive,
    expected.semantic && semanticState(row) !== 'complete',
    expected.reflection && !row.reflection,
  ].filter(Boolean).length
}

function matrixStatus(
  row: ConsistencyMatrixDraftRow,
  expected: ConsistencyMatrixExpectedSources,
) {
  let issues = matrixIssueCount(row, expected)
  if (issues === 0) return 'pass'
  if (issues === 1) return 'warning'
  return 'error'
}

function finalizeMatrixRow(
  row: ConsistencyMatrixDraftRow,
  expected: ConsistencyMatrixExpectedSources,
  rows: ConsistencyMatrixDraftRow[],
): ConsistencyMatrixRow {
  let isProviderOnly = providerOnlyMatrixRow(row)
  let isDiscovered = isDiscoveredMatrixRow(row, rows)
  let rowExpected = isProviderOnly
    ? { passive: false, semantic: false, reflection: false }
    : isDiscovered
      ? { passive: true, semantic: false, reflection: false }
      : expected
  let next = {
    ...row,
    semantic: semanticState(row) === 'complete',
    semantic_state: semanticState(row),
    passive_expected: rowExpected.passive,
    semantic_expected: rowExpected.semantic,
    reflection_expected: rowExpected.reflection,
  }

  return {
    ...next,
    issue_count:
      isProviderOnly || isDiscovered ? 0 : matrixIssueCount(next, rowExpected),
    status: isProviderOnly
      ? 'provider_only'
      : isDiscovered
        ? 'discovered'
        : matrixStatus(next, rowExpected),
  }
}

function providerOnlyMatrixRow(row: ConsistencyMatrixDraftRow) {
  return (
    row.provider &&
    !row.passive &&
    !row.semantic &&
    !row.semantic_started &&
    !row.semantic_finished &&
    !row.reflection
  )
}

function semanticState(row: ConsistencyMatrixDraftRow): SemanticState {
  if (row.kind === 'Reference') return row.semantic ? 'complete' : 'missing'
  if (row.semantic_started && row.semantic_finished) return 'complete'
  if (row.semantic_started || row.semantic_finished) return 'partial'
  return 'missing'
}

function expectedSources(traceMode: TraceMode) {
  return {
    passive: true,
    semantic: traceMode === 'full',
    reflection: traceMode === 'full' || traceMode === 'passive_reflection',
  } satisfies ConsistencyMatrixExpectedSources
}

function kindOrder(kind: ConsistencyFileKind) {
  return kind === 'Skill' ? 0 : 1
}

export type ConsistencyMatrixRow = ConsistencyMatrixDraftRow & {
  semantic_state: SemanticState
  passive_expected: boolean
  semantic_expected: boolean
  reflection_expected: boolean
  issue_count: number
  status: 'pass' | 'warning' | 'error' | 'discovered' | 'provider_only'
}

type ConsistencyMatrixDraftRow = {
  kind: ConsistencyFileKind
  file: string
  passive: boolean
  semantic: boolean
  semantic_started: boolean
  semantic_finished: boolean
  reflection: boolean
  provider: boolean
  provider_context: boolean
}

type ConsistencyFileKind = 'Skill' | 'Reference'
type ConsistencyMatrixSource =
  | 'passive'
  | 'semantic'
  | 'semantic_started'
  | 'semantic_finished'
  | 'reflection'
  | 'provider'

type ConsistencyMatrixExpectedSources = Record<
  'passive' | 'semantic' | 'reflection',
  boolean
>
type SemanticState = 'complete' | 'partial' | 'missing'

type ConsistencyOptions = {
  traceMode?: string
}

export type TraceEventLike = {
  source: string
  event_type: string
  timestamp?: Date | string
  skill_name?: string | null
  skill_path?: string | null
  artifact_refs?: string[] | null
  payload?: Record<string, any> | null
}
