export function checkTraceConsistency(
  events: TraceEventLike[],
  options: ConsistencyOptions = {},
) {
  let traceMode = normalizeTraceMode(options.traceMode)
  if (traceMode === 'passive_only') return checkPassiveOnlyConsistency(events)
  if (traceMode === 'passive_reflection') {
    return checkPassiveReflectionConsistency(events)
  }

  let groups = groupBySkill(events)
  let results: ConsistencyResult[] = []

  for (let group of groups.values()) {
    let hasPassive = group.events.some(isPassiveSkillRead)
    let hasStarted = group.events.some(isSkillUseStarted)
    let hasFinished = group.events.some(isSkillUseFinished)
    let isDiscovery = isDiscoveredSkillGroup(group, events)
    let skill = group.label

    if (hasPassive && hasStarted && hasFinished) {
      results.push({
        status: 'pass',
        title: 'Observed and declared',
        message: `${skill} was read, started, and finished.`,
        skill,
      })
      continue
    }

    if (hasPassive && !hasStarted) {
      if (isDiscovery) {
        results.push({
          status: 'discovered',
          title: 'Discovered passively',
          message:
            `${skill} was read passively, with no later evidence of material use.`,
          skill,
        })
        continue
      }

      results.push({
        status: 'warning',
        title: 'Read but not declared',
        message: `${skill} was read, but no skill_use_started event was logged.`,
        skill,
      })
    }

    if (!hasPassive && hasStarted) {
      results.push({
        status: 'warning',
        title: 'Declared but not observed',
        message: `${skill} was declared, but no passive skill read was observed.`,
        skill,
      })
    }

    if (hasStarted && !hasFinished) {
      results.push({
        status: 'incomplete',
        title: 'Started but not finished',
        message: `${skill} logged skill_use_started, but no skill_use_finished event was logged.`,
        skill,
      })
    }
  }

  results.push(...checkReflectionFileConsistency(events))

  return results
}

export function traceConsistencyMatrix(
  events: TraceEventLike[],
  options: ConsistencyOptions = {},
) {
  let traceMode = normalizeTraceMode(options.traceMode)
  let expected = expectedSources(traceMode)
  let reflection = latestReflection(events)
  let rows: ConsistencyMatrixDraftRow[] = []

  for (let event of events) {
    if (event.source === 'passive_file_harness') {
      if (event.event_type === 'skill_file_read') {
        upsertMatrixRow(rows, 'Skill', passivePath(event), 'passive')
      } else if (event.event_type === 'skill_reference_read') {
        upsertMatrixRow(rows, 'Reference', passivePath(event), 'passive')
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
  }

  for (let file of stringList(reflection?.skills_read)) {
    upsertMatrixRow(rows, 'Skill', file, 'reflection')
  }

  for (let file of stringList(reflection?.references_read)) {
    upsertMatrixRow(rows, 'Reference', file, 'reflection')
  }

  return rows
    .map((row) => finalizeMatrixRow(row, expected, rows))
    .toSorted((left, right) => {
      let kind = kindOrder(left.kind) - kindOrder(right.kind)
      return kind || left.file.localeCompare(right.file)
    })
}

export function summarizeConsistencyMatrix(rows: ConsistencyMatrixRow[]) {
  if (rows.length === 0) return 'unknown'
  if (rows.some((row) => row.status !== 'pass' && row.status !== 'discovered')) {
    return 'warning'
  }
  return 'pass'
}

function checkPassiveOnlyConsistency(
  events: TraceEventLike[],
): ConsistencyResult[] {
  return passiveObservedPaths(events).map((observed): ConsistencyResult => ({
    status: 'pass',
    title: 'Observed passively',
    message: `${observed} was observed passively.`,
    skill: observed,
  }))
}

function checkPassiveReflectionConsistency(
  events: TraceEventLike[],
): ConsistencyResult[] {
  let reflectionResults = checkReflectionFileConsistency(events)
  if (reflectionResults.length > 0 || latestReflection(events)) {
    return reflectionResults
  }

  if (materialPassiveObservedPaths(events).length === 0) return []

  return [{
    status: 'warning',
    title: 'Reflection missing',
    message: 'Passive reads were observed, but no run reflection was declared.',
    skill: 'run reflection',
  }]
}

function checkReflectionFileConsistency(events: TraceEventLike[]) {
  let reflection = latestReflection(events)
  if (!reflection) return []

  let passivePaths = passiveObservedPaths(events)
  let reflectedPaths = reflectedFilePaths(reflection)
  let results: ConsistencyResult[] = []

  for (let reflected of reflectedPaths) {
    if (pathSetHas(passivePaths, reflected)) {
      results.push({
        status: 'pass',
        title: 'Reflected and observed',
        message: `${reflected} was listed in reflection and observed passively.`,
        skill: reflected,
      })
    } else {
      results.push({
        status: 'warning',
        title: 'Reflected but not observed',
        message: `${reflected} was listed in reflection, but no passive read was observed.`,
        skill: reflected,
      })
    }
  }

  for (let observed of passivePaths) {
    if (pathSetHas(reflectedPaths, observed)) continue
    if (isDiscoveredSkillPath(observed, events)) continue

    results.push({
      status: 'warning',
      title: 'Observed but not reflected',
      message: `${observed} was observed passively, but was not listed in reflection.`,
      skill: observed,
    })
  }

  return results
}

function groupBySkill(events: TraceEventLike[]) {
  let groups = new Map<string, SkillEventGroup>()

  for (let event of events) {
    let key = skillKey(event)
    if (!key) continue

    let group = groups.get(key) ?? {
      label: skillLabel(event),
      events: [],
    }
    group.events.push(event)
    groups.set(key, group)
  }

  return groups
}

function skillKey(event: TraceEventLike) {
  return event.skill_name || event.skill_path || event.skill_file_hash || null
}

function skillLabel(event: TraceEventLike) {
  return event.skill_name || event.skill_path || event.skill_file_hash || 'Skill'
}

function isDiscoveredSkillGroup(
  group: SkillEventGroup,
  events: TraceEventLike[],
) {
  let paths = group.events
    .filter(isPassiveSkillRead)
    .map(passivePath)
    .filter((path): path is string => !!path)

  return (
    paths.length > 0 &&
    paths.every((path) => isDiscoveredSkillPath(path, events))
  )
}

function isPassiveSkillRead(event: TraceEventLike) {
  return (
    event.source === 'passive_file_harness' &&
    ['skill_file_read', 'skill_reference_read'].includes(event.event_type)
  )
}

function isSkillUseStarted(event: TraceEventLike) {
  return (
    event.source === 'mcp_semantic_logger' &&
    event.event_type === 'skill_use_started'
  )
}

function isSkillUseFinished(event: TraceEventLike) {
  return (
    event.source === 'mcp_semantic_logger' &&
    event.event_type === 'skill_use_finished'
  )
}

function latestReflection(events: TraceEventLike[]) {
  return events
    .filter((event) => event.event_type === 'run_reflection_declared')
    .toSorted((a, b) =>
      new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime()
    )[0]?.payload?.data
}

function passiveObservedPaths(events: TraceEventLike[]) {
  let paths = events
    .filter(isPassiveSkillRead)
    .map(passivePath)
    .filter(Boolean)
    .filter((path) => !isInstrumentationPath(path))

  return unique(paths)
}

function materialPassiveObservedPaths(events: TraceEventLike[]) {
  return passiveObservedPaths(events).filter(
    (path) => !isDiscoveredSkillPath(path, events),
  )
}

function passivePath(event: TraceEventLike) {
  return passivePathCandidates(event)[0]
}

function passivePathCandidates(event: TraceEventLike) {
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

function reflectedFilePaths(reflection: Record<string, any>) {
  return unique([
    ...stringList(reflection.skills_read),
    ...stringList(reflection.references_read),
  ].filter((path) => !isInstrumentationPath(path)))
}

function pathSetHas(paths: string[], candidate: string) {
  let normalized = normalizePath(candidate)
  return paths.some((path) => pathsMatch(normalizePath(path), normalized))
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

  let row = rows.find((item) =>
    item.kind === kind &&
    pathsMatch(normalizePath(item.file), normalizePath(file))
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
    }
    rows.push(row)
  }

  row.file = displayFile(row.file, file)
  if (source === 'semantic_started') {
    row.semantic_started = true
  } else if (source === 'semantic_finished') {
    row.semantic_finished = true
  } else {
    row[source] = true
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

function isDiscoveredSkillPath(value: string, events: TraceEventLike[]) {
  if (!isSkillEntrypointPath(value)) return false

  let reflection = latestReflection(events)
  let reflected = reflectedFilePaths(reflection ?? {})
  if (pathSetHas(reflected, value)) return false

  let semanticPaths = events
    .filter((event) => isSkillUseStarted(event) || isSkillUseFinished(event))
    .map(semanticSkillPath)
    .filter((path): path is string => !!path)

  if (pathSetHas(semanticPaths, value)) return false
  return !hasReferenceForSkill(value, events)
}

function hasReferenceForSkill(value: string, events: TraceEventLike[]) {
  let key = skillDirectoryKey(value)
  if (!key) return false

  let reflection = latestReflection(events)
  let referencePaths = [
    ...events
      .filter((event) => event.event_type === 'skill_reference_read')
      .map((event) =>
        event.source === 'mcp_semantic_logger'
          ? semanticReferencePath(event)
          : passivePath(event)
      ),
    ...stringList(reflection?.references_read),
  ].filter((path): path is string => !!path)

  return referencePaths.some((path) => skillDirectoryKey(path) === key)
}

function isDiscoveredMatrixRow(
  row: ConsistencyMatrixDraftRow,
  rows: ConsistencyMatrixDraftRow[],
) {
  if (row.kind !== 'Skill') return false
  if (!row.passive || row.semantic_started || row.semantic_finished) return false
  if (row.reflection || !isSkillEntrypointPath(row.file)) return false

  let key = skillDirectoryKey(row.file)
  if (!key) return true

  return !rows.some((item) =>
    item.kind === 'Reference' && skillDirectoryKey(item.file) === key
  )
}

function skillDirectoryKey(value: string) {
  let parts = normalizePath(value).split('/').filter(Boolean)

  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index] === '.skills' && parts[index + 1]) {
      return parts.slice(index, index + 2).join('/')
    }

    if (
      (parts[index] === '.agents' || parts[index] === '.claude') &&
      parts[index + 1] === 'skills' &&
      parts[index + 2]
    ) {
      return parts.slice(index, index + 3).join('/')
    }
  }

  if (parts.at(-1) === 'skill.md' && parts.length >= 2) {
    return parts.slice(0, -1).join('/')
  }

  let referenceIndex = parts.indexOf('references')
  if (referenceIndex > 0) {
    return parts.slice(0, referenceIndex).join('/')
  }

  return null
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
  let isDiscovered = isDiscoveredMatrixRow(row, rows)
  let rowExpected = isDiscovered
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
    issue_count: isDiscovered ? 0 : matrixIssueCount(next, rowExpected),
    status: isDiscovered ? 'discovered' : matrixStatus(next, rowExpected),
  }
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

function normalizeTraceMode(value?: string): TraceMode {
  if (
    value === 'full' ||
    value === 'passive_reflection' ||
    value === 'passive_only'
  ) {
    return value
  }

  return 'full'
}

function kindOrder(kind: ConsistencyFileKind) {
  return kind === 'Skill' ? 0 : 1
}

function unique(values: string[]) {
  return [...new Set(values)]
}

export type ConsistencyResult = {
  status: 'pass' | 'warning' | 'incomplete' | 'discovered'
  title: string
  message: string
  skill: string
}

export type ConsistencyMatrixRow = ConsistencyMatrixDraftRow & {
  semantic_state: SemanticState
  passive_expected: boolean
  semantic_expected: boolean
  reflection_expected: boolean
  issue_count: number
  status: 'pass' | 'warning' | 'error' | 'discovered'
}

type ConsistencyMatrixDraftRow = {
  kind: ConsistencyFileKind
  file: string
  passive: boolean
  semantic: boolean
  semantic_started: boolean
  semantic_finished: boolean
  reflection: boolean
}

type ConsistencyFileKind = 'Skill' | 'Reference'
type ConsistencyMatrixSource =
  | 'passive'
  | 'semantic'
  | 'semantic_started'
  | 'semantic_finished'
  | 'reflection'

type ConsistencyMatrixExpectedSources = Record<
  'passive' | 'semantic' | 'reflection',
  boolean
>
type SemanticState = 'complete' | 'partial' | 'missing'

type ConsistencyOptions = {
  traceMode?: string
}

type TraceMode = 'full' | 'passive_reflection' | 'passive_only'

type SkillEventGroup = {
  label: string
  events: TraceEventLike[]
}

export type TraceEventLike = {
  source: string
  event_type: string
  timestamp?: Date | string
  skill_name?: string | null
  skill_path?: string | null
  skill_file_hash?: string | null
  payload?: Record<string, any> | null
}
