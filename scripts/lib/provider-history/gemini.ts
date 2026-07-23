import { createHash } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  shellSkillReads,
  shellVerificationOperations,
} from './shell'
import type {
  CollectionStatus,
  MatchConfidence,
  Outcome,
  ProviderHistoryCollection,
  ProviderHistoryEvent,
} from './types'

const FORMAT = 'gemini_cli_session_jsonl_v1'
const MAX_SOURCE_BYTES = 128 * 1024 * 1024
const MAX_PROJECT_ROOT_BYTES = 4096
const START_TOLERANCE_MS = 2_000
const STOP_TOLERANCE_MS = 1_000

export async function collectGeminiProviderHistory(
  options: CollectGeminiProviderHistoryOptions,
): Promise<ProviderHistoryCollection> {
  let geminiHome = options.geminiHome ?? path.join(os.homedir(), '.gemini')
  let projectsRoot = path.join(geminiHome, 'tmp')
  let startedAt = new Date(options.startedAt)
  let stoppedAt = new Date(options.stoppedAt)

  if (!validDate(startedAt) || !validDate(stoppedAt)) {
    return collectionResult('failed', {
      warnings: ['invalid_run_interval'],
    })
  }
  if (!fs.existsSync(projectsRoot)) return collectionResult('unavailable')

  let candidates = discoverCandidates({
    projectsRoot,
    targetRoot: options.targetRoot,
    runId: options.runId,
    startedAt,
    stoppedAt,
  })
  let match = selectCandidate(candidates)

  if (!match.candidate) {
    return collectionResult(match.status, {
      match_confidence: match.confidence,
      candidate_count: candidates.length,
      warnings: match.warnings,
    })
  }

  let source = await readStableSource(match.candidate.filePath, {
    intervalMs: options.stabilityIntervalMs,
    attempts: options.stabilityAttempts,
  })
  if (!source.text) {
    return collectionResult('failed', {
      match_confidence: match.confidence,
      candidate_count: candidates.length,
      warnings: [source.warning ?? 'source_read_failed'],
    })
  }

  let parsed = parseGeminiProviderHistory(source.text, {
    runId: options.runId,
    targetRoot: options.targetRoot,
    skillRoots: options.skillRoots,
    startedAt: options.startedAt,
    stoppedAt: options.stoppedAt,
    matchConfidence: match.confidence,
  })
  let warnings = [...parsed.warnings]
  if (!source.stable) warnings.push('source_not_stable')
  if (!parsed.supported) {
    return collectionResult('unsupported_format', {
      match_confidence: match.confidence,
      candidate_count: candidates.length,
      source_stable: source.stable,
      warnings,
    })
  }

  let status: CollectionStatus = source.stable
    ? 'collected'
    : 'possibly_incomplete'
  return {
    status,
    events: parsed.events,
    summary: {
      status,
      provider: 'gemini_cli',
      provider_session_id: parsed.sessionId,
      provider_model: parsed.model,
      provider_last_updated: parsed.lastUpdated,
      provider_environment: parsed.providerEnvironment,
      match_confidence: match.confidence,
      completeness: 'stable_at_stop',
      evidence_event_count: parsed.evidenceCount,
      execution_operation_count: parsed.operationCount,
      operation_counts: parsed.operationCounts,
      recognized_record_count: parsed.recognizedRecordCount,
      partially_extracted_record_count: 0,
      unsupported_record_count: parsed.unsupportedRecordCount,
      intentionally_ignored_record_count:
        parsed.intentionallyIgnoredRecordCount,
      extraction_method_counts: {
        direct_envelope: parsed.toolCallRecordCount,
      },
      ignored_circular_call_count: parsed.circularCallCount,
      ignored_unsupported_call_count: parsed.unsupportedCallCount,
      ignored_duplicate_call_count: parsed.duplicateCallCount,
      candidate_count: candidates.length,
      source_stable: source.stable,
      warnings,
    },
  }
}

export function parseGeminiProviderHistory(
  text: string,
  options: ParseGeminiProviderHistoryOptions,
): ParsedGeminiProviderHistory {
  let parsed = parseRows(text)
  let headers = parsed.rows.filter((row) => isSessionHeader(row.value))
  let sessionIds = unique(
    headers
      .map((row) => stringValue(row.value.sessionId))
      .filter(Boolean),
  )

  if (sessionIds.length !== 1) {
    return emptyParsed(
      sessionIds.length === 0
        ? 'missing_provider_session_id'
        : 'multiple_provider_session_ids',
    )
  }

  let start = new Date(options.startedAt).getTime() - START_TOLERANCE_MS
  let stop = new Date(options.stoppedAt).getTime() + STOP_TOLERANCE_MS
  let rows = parsed.rows.filter((row) => {
    if (isSnapshot(row.value)) {
      return within(
        new Date(row.value.$set.lastUpdated ?? '').getTime(),
        start,
        stop,
      )
    }
    return recordWithin(row.value, start, stop)
  })
  let sessionId = sessionIds[0]
  let events: ProviderHistoryEvent[] = []
  let fingerprints = new Set<string>()
  let seenCallIds = new Set<string>()
  let recognizedRecordCount = 0
  let unsupportedRecordCount = 0
  let intentionallyIgnoredRecordCount = 0
  let circularCallCount = 0
  let unsupportedCallCount = 0
  let duplicateCallCount = 0
  let toolCallRecordCount = 0

  for (let row of rows) {
    if (isSnapshot(row.value)) {
      intentionallyIgnoredRecordCount += 1
      continue
    }

    let calls = toolCalls(row).filter((call) =>
      within(callTime(call, row.value), start, stop),
    )
    if (calls.length === 0) continue
    toolCallRecordCount += 1
    let recognized = 0
    let ignored = 0
    let unsupported = 0

    for (let call of calls) {
      if (seenCallIds.has(call.id)) {
        ignored += 1
        duplicateCallCount += 1
        continue
      }
      seenCallIds.add(call.id)

      let result = projectToolCall(call, {
        sessionId,
        cwd: options.targetRoot,
        timestamp:
          timestampValue(call.timestamp) ??
          timestampValue(row.value.timestamp),
        rowIndex: row.index,
        options,
        events,
        fingerprints,
      })
      if (result === 'recognized') recognized += 1
      if (result === 'ignored') ignored += 1
      if (result === 'circular') {
        ignored += 1
        circularCallCount += 1
      }
      if (result === 'unsupported') unsupported += 1
    }

    unsupportedCallCount += unsupported
    if (recognized > 0) recognizedRecordCount += 1
    else if (unsupported > 0) unsupportedRecordCount += 1
    else if (ignored > 0) intentionallyIgnoredRecordCount += 1
  }

  let evidenceCount = events.filter((event) =>
    ['skill_file_read', 'skill_reference_read'].includes(event.event_type),
  ).length
  let operations = events.filter(
    (event) => event.event_type === 'execution_operation_observed',
  )
  let environment = geminiProviderEnvironment(
    rows,
    headers,
    options.targetRoot,
  )

  return {
    supported: true,
    sessionId,
    model: stringValue(environment.model),
    lastUpdated: lastUpdated(parsed.rows),
    providerEnvironment: environment,
    events,
    evidenceCount,
    operationCount: operations.length,
    operationCounts: countOperations(operations),
    recognizedRecordCount,
    unsupportedRecordCount,
    intentionallyIgnoredRecordCount,
    toolCallRecordCount,
    circularCallCount,
    unsupportedCallCount,
    duplicateCallCount,
    warnings: parsed.errorCount > 0 ? ['malformed_records_ignored'] : [],
  }
}

function projectToolCall(
  call: GeminiToolCall,
  context: ProjectionContext,
): ProjectionResult {
  if (isSkillTraceTool(call.name)) return 'circular'
  if (
    ['glob', 'grep_search', 'list_directory', 'update_topic'].includes(
      call.name,
    )
  ) {
    return 'ignored'
  }

  let outcome = toolOutcome(call.status)

  if (call.name === 'activate_skill') {
    let filePath = skillFileForName(
      call.args.name,
      context.options.skillRoots,
    )
    if (!filePath || outcome !== 'success') return 'unsupported'

    addSkillRead(call, context, {
      filePath,
      classifier: 'gemini_activate_skill',
      evidenceKind: 'direct_skill_activation',
      confidence: 'high',
      outcome,
    })
    return 'recognized'
  }

  if (call.name === 'run_shell_command') {
    let command = stringValue(call.args.command)
    if (!command) return 'unsupported'
    let recognized = false
    let reads = shellSkillReads(
      command,
      context.cwd,
      context.options.skillRoots,
    )

    if (outcome === 'success') {
      for (let read of reads) {
        addSkillRead(call, context, {
          filePath: read.absolutePath,
          classifier: read.classifier,
          evidenceKind: 'shell_content_read',
          confidence: 'medium',
          outcome,
        })
        recognized = true
      }
    } else if (reads.length > 0) {
      addOperation(call, context, {
        kind: 'file_read',
        classifier: 'shell_content_read',
        artifactRefs: reads.map((read) =>
          displayPath(read.absolutePath, context.options.targetRoot),
        ),
        outcome,
        classificationConfidence: 'medium',
      })
      recognized = true
    }

    for (let operation of shellVerificationOperations(command)) {
      addOperation(call, context, {
        kind: operation.kind,
        classifier: operation.classifier,
        artifactRefs: [],
        outcome,
        classificationConfidence: 'medium',
      })
      recognized = true
    }

    return recognized ? 'recognized' : 'unsupported'
  }

  if (call.name === 'read_file') {
    let filePath = safePath(call.args.file_path, context.cwd)
    if (!filePath) return 'unsupported'
    let isSkill = context.options.skillRoots.some((root) =>
      withinRoot(filePath, root),
    )
    let isTarget = withinRoot(filePath, context.options.targetRoot)
    if (!isSkill && !isTarget) return 'unsupported'

    let relativePath = displayPath(filePath, context.options.targetRoot)
    if (isSkill && outcome === 'success') {
      addSkillRead(call, context, {
        filePath,
        classifier: 'gemini_read_file',
        evidenceKind: 'direct_file_read',
        confidence: 'high',
        outcome,
      })
      return 'recognized'
    }

    addOperation(call, context, {
      kind: 'file_read',
      classifier: 'gemini_read_file',
      artifactRefs: [relativePath],
      outcome,
      classificationConfidence: 'high',
    })
    return 'recognized'
  }

  if (call.name === 'replace') {
    let filePath = safePath(call.args.file_path, context.cwd)
    if (!filePath || !withinRoot(filePath, context.options.targetRoot)) {
      return 'unsupported'
    }
    addOperation(call, context, {
      kind: 'file_edit',
      classifier: 'gemini_replace',
      artifactRefs: [displayPath(filePath, context.options.targetRoot)],
      outcome,
      classificationConfidence: 'high',
    })
    return 'recognized'
  }

  return 'unsupported'
}

function addSkillRead(
  call: GeminiToolCall,
  context: ProjectionContext,
  read: SkillReadProjection,
) {
  let relativePath = displayPath(read.filePath, context.options.targetRoot)
  let eventType: 'skill_file_read' | 'skill_reference_read' =
    path.basename(read.filePath) === 'SKILL.md'
      ? 'skill_file_read'
      : 'skill_reference_read'
  let fingerprint = sourceFingerprint(
    context.sessionId,
    call.id,
    eventType,
    relativePath,
  )
  if (context.fingerprints.has(fingerprint)) return

  context.fingerprints.add(fingerprint)
  context.events.push({
    event_type: eventType,
    timestamp: context.timestamp,
    skill: {
      name: skillName(read.filePath),
      path: relativePath,
    },
    payload: {
      ...providerPayload(call, context, read.outcome),
      evidence_kind: read.evidenceKind,
      command_classifier: read.classifier,
      confidence: read.confidence,
      source_fingerprint: fingerprint,
    },
  })
}

function addOperation(
  call: GeminiToolCall,
  context: ProjectionContext,
  operation: OperationProjection,
) {
  let fingerprint = sourceFingerprint(
    context.sessionId,
    call.id,
    'execution_operation_observed',
    operation.kind,
    ...operation.artifactRefs,
  )
  if (context.fingerprints.has(fingerprint)) return

  context.fingerprints.add(fingerprint)
  context.events.push({
    event_type: 'execution_operation_observed',
    timestamp: context.timestamp,
    artifact_refs: operation.artifactRefs,
    payload: {
      ...providerPayload(call, context, operation.outcome),
      operation_kind: operation.kind,
      command_classifier: operation.classifier,
      classification_confidence: operation.classificationConfidence,
      evidence_status: 'context_only',
      source_fingerprint: fingerprint,
    },
  })
}

function providerPayload(
  call: GeminiToolCall,
  context: ProjectionContext,
  outcome: Outcome,
) {
  return {
    provider: 'gemini_cli',
    provider_session_id: context.sessionId,
    tool_name: call.name,
    tool_call_id: call.id,
    outcome,
    extraction_method: 'direct_envelope',
    extraction_confidence: 'high',
    match_confidence: context.options.matchConfidence,
    format: FORMAT,
    source_record_index: context.rowIndex,
  }
}

function geminiProviderEnvironment(
  rows: ParsedRow[],
  headers: ParsedRow[],
  targetRoot: string,
) {
  let models = unique(
    rows.map((row) => safeProviderValue(row.value.model)).filter(Boolean),
  )
  let sessionKinds = unique(
    headers.map((row) => safeProviderValue(row.value.kind)).filter(Boolean),
  )
  let changedFields: string[] = []
  if (models.length > 1) changedFields.push('model')
  if (sessionKinds.length > 1) changedFields.push('session_kind')

  return definedRecord({
    provider: 'gemini_cli',
    client: 'Gemini CLI',
    model: models[0],
    working_directory: targetRoot,
    workspace_scope: 'target_root',
    session_kind: sessionKinds[0],
    changed_fields: changedFields.length > 0 ? changedFields : undefined,
  })
}

function discoverCandidates(options: DiscoverCandidatesOptions) {
  let projectDirectories: string[] = []

  for (let entry of safeDirectoryEntries(options.projectsRoot)) {
    if (!entry.isDirectory()) continue
    let directory = path.join(options.projectsRoot, entry.name)
    let projectRoot = readProjectRoot(path.join(directory, '.project_root'))
    if (projectRoot && pathsEqual(projectRoot, options.targetRoot)) {
      projectDirectories.push(directory)
    }
  }

  let candidates: GeminiCandidate[] = []
  for (let directory of projectDirectories) {
    let chats = path.join(directory, 'chats')
    for (let entry of safeDirectoryEntries(chats)) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue

      let filePath = path.join(chats, entry.name)
      let stat: fs.Stats
      try {
        stat = fs.statSync(filePath)
      } catch {
        continue
      }
      if (stat.size > MAX_SOURCE_BYTES) continue

      let text: string
      try {
        text = fs.readFileSync(filePath, 'utf8')
      } catch {
        continue
      }

      let rows = parseRows(text).rows
      let start =
        options.startedAt.getTime() - START_TOLERANCE_MS
      let stop = options.stoppedAt.getTime() + STOP_TOLERANCE_MS
      let matchingRows = rows.filter((row) =>
        recordWithin(row.value, start, stop),
      )
      if (matchingRows.length === 0) continue

      candidates.push({
        filePath,
        hasRunId: matchingRows.some((row) =>
          rowContainsRunId(row, options.runId, start, stop),
        ),
      })
    }
  }

  return candidates
}

function readProjectRoot(filePath: string) {
  try {
    let stat = fs.statSync(filePath)
    if (!stat.isFile() || stat.size > MAX_PROJECT_ROOT_BYTES) return undefined
    let value = fs.readFileSync(filePath, 'utf8').trim()
    return safePath(value, path.dirname(filePath))
  } catch {
    return undefined
  }
}

function safeDirectoryEntries(directory: string) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

function rowContainsRunId(
  row: ParsedRow,
  runId: string,
  start: number,
  stop: number,
) {
  return toolCalls(row).some(
    (call) =>
      within(callTime(call, row.value), start, stop) &&
      isSkillTraceTool(call.name) &&
      call.args.run_id === runId,
  )
}

function selectCandidate(candidates: GeminiCandidate[]): CandidateMatch {
  let runMatches = candidates.filter((candidate) => candidate.hasRunId)
  if (runMatches.length === 1) {
    return {
      status: 'collected',
      confidence: 'high',
      candidate: runMatches[0],
      warnings: [],
    }
  }
  if (runMatches.length > 1) {
    return {
      status: 'ambiguous',
      confidence: 'unknown',
      warnings: ['multiple_run_id_matches'],
    }
  }
  if (candidates.length === 1) {
    return {
      status: 'collected',
      confidence: 'medium',
      candidate: candidates[0],
      warnings: [],
    }
  }
  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      confidence: 'unknown',
      warnings: ['multiple_time_and_project_matches'],
    }
  }

  return {
    status: 'unavailable',
    confidence: 'unknown',
    warnings: [],
  }
}

function toolCalls(row: ParsedRow) {
  if (row.value.type !== 'gemini' || !Array.isArray(row.value.toolCalls)) {
    return []
  }

  return row.value.toolCalls
    .filter(
      (call: unknown): call is Record<string, unknown> =>
        !!call &&
        typeof call === 'object' &&
        typeof (call as Record<string, unknown>).id === 'string' &&
        typeof (call as Record<string, unknown>).name === 'string',
    )
    .map((call: Record<string, unknown>) => ({
      id: String(call.id),
      name: String(call.name),
      status: stringValue(call.status),
      timestamp: timestampValue(call.timestamp),
      args: jsonObject(call.args) ?? {},
    }))
}

async function readStableSource(
  filePath: string,
  options: StabilityOptions = {},
) {
  let intervalMs = options.intervalMs ?? 150
  let attempts = options.attempts ?? 8
  let previous: SourceStat | undefined
  let stableChecks = 0
  let latest: SourceStat | undefined

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      let stat = await fs.promises.stat(filePath)
      if (stat.size > MAX_SOURCE_BYTES) {
        return { stable: false, text: '', warning: 'source_too_large' }
      }
      latest = { size: stat.size, mtimeMs: stat.mtimeMs }
      if (
        previous &&
        previous.size === latest.size &&
        previous.mtimeMs === latest.mtimeMs
      ) {
        stableChecks += 1
      } else {
        stableChecks = 0
      }
      previous = latest
      if (stableChecks >= 2) {
        return {
          stable: true,
          text: await readBoundedText(filePath, latest.size),
        }
      }
    } catch {
      return { stable: false, text: '', warning: 'source_read_failed' }
    }

    await wait(intervalMs)
  }

  return {
    stable: false,
    text: latest ? await readBoundedText(filePath, latest.size) : '',
  }
}

async function readBoundedText(filePath: string, size: number) {
  let file = await fs.promises.open(filePath, 'r')
  try {
    let buffer = Buffer.alloc(size)
    let result = await file.read(buffer, 0, size, 0)
    return buffer.subarray(0, result.bytesRead).toString('utf8')
  } finally {
    await file.close()
  }
}

function parseRows(text: string) {
  let rows: ParsedRow[] = []
  let errorCount = 0

  for (let [index, line] of text.split('\n').entries()) {
    if (!line.trim()) continue
    try {
      let value = JSON.parse(line)
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        rows.push({ index, value })
      } else {
        errorCount += 1
      }
    } catch {
      errorCount += 1
    }
  }

  return { rows, errorCount }
}

function emptyParsed(warning: string): ParsedGeminiProviderHistory {
  return {
    supported: false,
    sessionId: 'unknown',
    providerEnvironment: {},
    events: [],
    evidenceCount: 0,
    operationCount: 0,
    operationCounts: {},
    recognizedRecordCount: 0,
    unsupportedRecordCount: 0,
    intentionallyIgnoredRecordCount: 0,
    toolCallRecordCount: 0,
    circularCallCount: 0,
    unsupportedCallCount: 0,
    duplicateCallCount: 0,
    warnings: [warning],
  }
}

function collectionResult(
  status: CollectionStatus,
  details: Record<string, unknown> = {},
): ProviderHistoryCollection {
  return {
    status,
    events: [],
    summary: {
      status,
      provider: 'gemini_cli',
      evidence_event_count: 0,
      execution_operation_count: 0,
      recognized_record_count: 0,
      partially_extracted_record_count: 0,
      unsupported_record_count: 0,
      intentionally_ignored_record_count: 0,
      extraction_method_counts: {},
      ignored_circular_call_count: 0,
      ignored_unsupported_call_count: 0,
      ignored_duplicate_call_count: 0,
      warnings: [],
      ...details,
    },
  }
}

function countOperations(events: ProviderHistoryEvent[]) {
  let counts: Record<string, number> = {}
  for (let event of events) {
    let kind = stringValue(event.payload.operation_kind)
    if (kind) counts[kind] = (counts[kind] ?? 0) + 1
  }
  return counts
}

function safePath(value: unknown, cwd: string) {
  let filePath = stringValue(value)?.trim()
  if (!filePath || filePath.length > 4096 || /[\0\r\n]/.test(filePath)) {
    return undefined
  }
  return path.resolve(cwd, filePath)
}

function skillFileForName(value: unknown, skillRoots: string[]) {
  let name = stringValue(value)?.trim()
  if (
    !name ||
    name.length > 256 ||
    name !== path.basename(name) ||
    name === '.' ||
    name === '..'
  ) {
    return undefined
  }

  let candidates = new Map<string, string>()
  for (let root of skillRoots) {
    let filePath = path.join(root, name, 'SKILL.md')
    try {
      if (
        fs.statSync(filePath).isFile() &&
        withinRoot(filePath, root)
      ) {
        candidates.set(normalizedPath(filePath), filePath)
      }
    } catch {
      continue
    }
  }
  return candidates.size === 1
    ? candidates.values().next().value
    : undefined
}

function skillName(filePath: string) {
  if (path.basename(filePath) === 'SKILL.md') {
    return path.basename(path.dirname(filePath))
  }
  let parts = filePath.split(path.sep)
  let skillIndex = parts.findLastIndex((part) => part === 'skills')
  return skillIndex >= 0 ? parts[skillIndex + 1] : undefined
}

function displayPath(filePath: string, targetRoot: string) {
  let relative = path.relative(targetRoot, filePath)
  if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.replaceAll(path.sep, '/')
  }
  return filePath.replace(os.homedir(), '~').replaceAll(path.sep, '/')
}

function withinRoot(filePath: string, root: string) {
  if (pathWithin(filePath, root)) return true
  return pathWithin(normalizedPath(filePath), normalizedPath(root))
}

function pathWithin(filePath: string, root: string) {
  let relative = path.relative(path.resolve(root), path.resolve(filePath))
  return (
    relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative)
  )
}

function pathsEqual(left: string, right: string) {
  return normalizedPath(left) === normalizedPath(right)
}

function normalizedPath(value: string) {
  try {
    return fs.realpathSync(value)
  } catch {
    return path.resolve(value)
  }
}

function sourceFingerprint(...values: string[]) {
  return `sha256:${createHash('sha256').update(values.join('\0')).digest('hex')}`
}

function safeProviderValue(value: unknown) {
  let text = stringValue(value)?.trim()
  if (!text || text.length > 128 || /[\0\r\n]/.test(text)) return undefined
  return text
}

function definedRecord(record: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  )
}

function jsonObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

function timestampValue(value: unknown) {
  let timestamp = stringValue(value)
  return timestamp && Number.isFinite(new Date(timestamp).getTime())
    ? timestamp
    : undefined
}

function recordWithin(value: any, start: number, stop: number) {
  let timestamps = [
    timestampValue(value.timestamp),
    ...(Array.isArray(value.toolCalls)
      ? value.toolCalls.map((call: any) => timestampValue(call?.timestamp))
      : []),
  ]
    .filter((timestamp): timestamp is string => !!timestamp)
    .map((timestamp) => new Date(timestamp).getTime())
  return timestamps.some((timestamp) => within(timestamp, start, stop))
}

function callTime(call: GeminiToolCall, row: any) {
  return new Date(call.timestamp ?? row.timestamp ?? '').getTime()
}

function lastUpdated(rows: ParsedRow[]) {
  let timestamps = rows
    .flatMap((row) => [
      timestampValue(row.value.lastUpdated),
      timestampValue(row.value.$set?.lastUpdated),
    ])
    .filter((timestamp): timestamp is string => !!timestamp)
    .sort(
      (left, right) =>
        new Date(right).getTime() - new Date(left).getTime(),
    )
  return timestamps[0]
}

function isSessionHeader(value: any) {
  return (
    typeof value.sessionId === 'string' &&
    typeof value.startTime === 'string' &&
    !value.type
  )
}

function isSnapshot(value: any) {
  return !!jsonObject(value.$set) && Array.isArray(value.$set.messages)
}

function toolOutcome(value?: string): Outcome {
  let status = value?.toLowerCase()
  if (['success', 'succeeded', 'completed'].includes(status ?? '')) {
    return 'success'
  }
  if (
    ['error', 'failed', 'cancelled', 'canceled'].includes(status ?? '')
  ) {
    return 'failed'
  }
  return 'unknown'
}

function unique<T>(values: (T | undefined)[]): T[] {
  return [...new Set(values.filter((value): value is T => value !== undefined))]
}

function within(value: number, start: number, stop: number) {
  return Number.isFinite(value) && value >= start && value <= stop
}

function validDate(value: Date) {
  return Number.isFinite(value.getTime())
}

function isSkillTraceTool(name: string) {
  let value = name.toLowerCase()
  return (
    value.includes('skilltrace') ||
    value.startsWith('skill_trace_') ||
    value === 'skill_log_event'
  )
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

type CollectGeminiProviderHistoryOptions = {
  runId: string
  targetRoot: string
  skillRoots: string[]
  startedAt: string
  stoppedAt: string
  geminiHome?: string
  stabilityIntervalMs?: number
  stabilityAttempts?: number
}

type ParseGeminiProviderHistoryOptions = Omit<
  CollectGeminiProviderHistoryOptions,
  'geminiHome' | 'stabilityIntervalMs' | 'stabilityAttempts'
> & {
  matchConfidence: MatchConfidence
}

type ParsedGeminiProviderHistory = {
  supported: boolean
  sessionId: string
  model?: string
  lastUpdated?: string
  providerEnvironment: Record<string, unknown>
  events: ProviderHistoryEvent[]
  evidenceCount: number
  operationCount: number
  operationCounts: Record<string, number>
  recognizedRecordCount: number
  unsupportedRecordCount: number
  intentionallyIgnoredRecordCount: number
  toolCallRecordCount: number
  circularCallCount: number
  unsupportedCallCount: number
  duplicateCallCount: number
  warnings: string[]
}

type DiscoverCandidatesOptions = {
  projectsRoot: string
  targetRoot: string
  runId: string
  startedAt: Date
  stoppedAt: Date
}

type GeminiCandidate = {
  filePath: string
  hasRunId: boolean
}

type CandidateMatch = {
  status: CollectionStatus
  confidence: MatchConfidence
  candidate?: GeminiCandidate
  warnings: string[]
}

type StabilityOptions = {
  intervalMs?: number
  attempts?: number
}

type SourceStat = {
  size: number
  mtimeMs: number
}

type ParsedRow = {
  index: number
  value: any
}

type GeminiToolCall = {
  id: string
  name: string
  status?: string
  timestamp?: string
  args: Record<string, unknown>
}

type ProjectionContext = {
  sessionId: string
  cwd: string
  timestamp?: string
  rowIndex: number
  options: ParseGeminiProviderHistoryOptions
  events: ProviderHistoryEvent[]
  fingerprints: Set<string>
}

type OperationProjection = {
  kind: 'file_read' | 'file_edit' | 'test' | 'typecheck' | 'lint' | 'build'
  classifier: string
  artifactRefs: string[]
  outcome: Outcome
  classificationConfidence: 'high' | 'medium'
}

type SkillReadProjection = {
  filePath: string
  classifier: string
  evidenceKind:
    | 'direct_file_read'
    | 'direct_skill_activation'
    | 'shell_content_read'
  confidence: 'high' | 'medium'
  outcome: Outcome
}

type ProjectionResult = 'recognized' | 'ignored' | 'circular' | 'unsupported'
