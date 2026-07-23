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

const FORMAT = 'claude_code_session_jsonl_v1'
const MAX_SOURCE_BYTES = 128 * 1024 * 1024
const START_TOLERANCE_MS = 2_000
const STOP_TOLERANCE_MS = 1_000

export async function collectClaudeProviderHistory(
  options: CollectClaudeProviderHistoryOptions,
): Promise<ProviderHistoryCollection> {
  let claudeHome = options.claudeHome ?? path.join(os.homedir(), '.claude')
  let projectsRoot = path.join(claudeHome, 'projects')
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

  let parsed = parseClaudeProviderHistory(source.text, {
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
      provider: 'claude_code',
      provider_session_id: parsed.sessionId,
      provider_client_version: parsed.clientVersion,
      provider_model: parsed.model,
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
      candidate_count: candidates.length,
      source_stable: source.stable,
      warnings,
    },
  }
}

export function parseClaudeProviderHistory(
  text: string,
  options: ParseClaudeProviderHistoryOptions,
): ParsedClaudeProviderHistory {
  let parsed = parseRows(text)
  let start = new Date(options.startedAt).getTime() - START_TOLERANCE_MS
  let stop = new Date(options.stoppedAt).getTime() + STOP_TOLERANCE_MS
  let rows = parsed.rows.filter((row) => {
    let time = new Date(row.value.timestamp ?? '').getTime()
    return within(time, start, stop)
  })
  let sessionIds = unique(
    rows.map((row) => stringValue(row.value.sessionId)).filter(Boolean),
  )

  if (sessionIds.length !== 1) {
    return emptyParsed(
      sessionIds.length === 0
        ? 'missing_provider_session_id'
        : 'multiple_provider_session_ids',
    )
  }

  let sessionId = sessionIds[0]
  let results = toolResults(rows)
  let events: ProviderHistoryEvent[] = []
  let fingerprints = new Set<string>()
  let recognizedRecordCount = 0
  let unsupportedRecordCount = 0
  let intentionallyIgnoredRecordCount = 0
  let circularCallCount = 0
  let unsupportedCallCount = 0
  let toolCallRecordCount = 0

  for (let row of rows) {
    let calls = toolUses(row)
    if (calls.length === 0) continue
    toolCallRecordCount += 1
    let recognized = 0
    let ignored = 0
    let unsupported = 0

    for (let call of calls) {
      let result = projectToolCall(call, {
        sessionId,
        cwd: stringValue(row.value.cwd) ?? options.targetRoot,
        timestamp: timestampValue(row.value.timestamp),
        rowIndex: row.index,
        sidechain: row.value.isSidechain === true,
        result: results.get(call.id),
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
  let environment = claudeProviderEnvironment(rows, options.targetRoot)

  return {
    supported: true,
    sessionId,
    clientVersion: stringValue(environment.client_version),
    model: stringValue(environment.model),
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
    warnings: parsed.errorCount > 0 ? ['malformed_records_ignored'] : [],
  }
}

function projectToolCall(
  call: ClaudeToolCall,
  context: ProjectionContext,
): ProjectionResult {
  if (isSkillTraceTool(call.name)) return 'circular'
  if (['ToolSearch', 'Glob', 'Grep'].includes(call.name)) return 'ignored'

  let outcome = context.result?.outcome ?? 'unknown'
  let durationMs = duration(context.timestamp, context.result?.timestamp)

  if (call.name === 'Bash') {
    let command = stringValue(call.input.command)
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
        durationMs,
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
        durationMs,
        classificationConfidence: 'medium',
      })
      recognized = true
    }

    return recognized ? 'recognized' : 'unsupported'
  }

  if (call.name === 'Read') {
    let filePath = safePath(call.input.file_path, context.cwd)
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
        classifier: 'claude_read',
        evidenceKind: 'direct_file_read',
        confidence: 'high',
        outcome,
      })
      return 'recognized'
    }

    addOperation(call, context, {
      kind: 'file_read',
      classifier: 'claude_read',
      artifactRefs: [relativePath],
      outcome,
      durationMs,
      classificationConfidence: 'high',
    })
    return 'recognized'
  }

  if (call.name === 'Edit' || call.name === 'Write') {
    let filePath = safePath(call.input.file_path, context.cwd)
    if (!filePath || !withinRoot(filePath, context.options.targetRoot)) {
      return 'unsupported'
    }
    addOperation(call, context, {
      kind: 'file_edit',
      classifier: `claude_${call.name.toLowerCase()}`,
      artifactRefs: [displayPath(filePath, context.options.targetRoot)],
      outcome,
      durationMs,
      classificationConfidence: 'high',
    })
    return 'recognized'
  }

  return 'unsupported'
}

function addSkillRead(
  call: ClaudeToolCall,
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
  call: ClaudeToolCall,
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
      duration_ms: operation.durationMs,
      classification_confidence: operation.classificationConfidence,
      evidence_status: 'context_only',
      source_fingerprint: fingerprint,
    },
  })
}

function providerPayload(
  call: ClaudeToolCall,
  context: ProjectionContext,
  outcome: Outcome,
) {
  return definedRecord({
    provider: 'claude_code',
    provider_session_id: context.sessionId,
    tool_name: call.name,
    tool_call_id: call.id,
    outcome,
    extraction_method: 'direct_envelope',
    extraction_confidence: 'high',
    match_confidence: context.options.matchConfidence,
    format: FORMAT,
    source_record_index: context.rowIndex,
    sidechain: context.sidechain || undefined,
  })
}

function claudeProviderEnvironment(rows: ParsedRow[], targetRoot: string) {
  let versions = unique(
    rows.map((row) => safeProviderValue(row.value.version)).filter(Boolean),
  )
  let models = unique(
    rows
      .map((row) => safeProviderValue(row.value.message?.model))
      .filter(Boolean),
  )
  let entrypoints = unique(
    rows.map((row) => safeProviderValue(row.value.entrypoint)).filter(Boolean),
  )
  let permissionModes = unique(
    rows
      .map((row) => safeProviderValue(row.value.permissionMode))
      .filter(Boolean),
  )
  let cwds = unique(
    rows.map((row) => stringValue(row.value.cwd)).filter(Boolean),
  )
  let changedFields: string[] = []
  if (models.length > 1) changedFields.push('model')
  if (permissionModes.length > 1) changedFields.push('permission_mode')
  if (cwds.length > 1) changedFields.push('working_directory')

  return definedRecord({
    provider: 'claude_code',
    client: 'Claude Code',
    client_version: versions[0],
    source: entrypoints[0],
    model: models[0],
    working_directory: cwds.some((cwd) => pathsEqual(cwd, targetRoot))
      ? targetRoot
      : undefined,
    permission_mode: permissionModes[0],
    workspace_scope: cwds.some((cwd) => pathsEqual(cwd, targetRoot))
      ? 'target_root'
      : undefined,
    changed_fields: changedFields.length > 0 ? changedFields : undefined,
  })
}

function discoverCandidates(options: DiscoverCandidatesOptions) {
  let directory = path.join(
    options.projectsRoot,
    encodeProjectPath(options.targetRoot),
  )
  if (!fs.existsSync(directory)) return []

  let candidates: ClaudeCandidate[] = []
  for (let entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue

    let filePath = path.join(directory, entry.name)
    let stat = fs.statSync(filePath)
    if (stat.size > MAX_SOURCE_BYTES) continue

    let text: string
    try {
      text = fs.readFileSync(filePath, 'utf8')
    } catch {
      continue
    }

    let rows = parseRows(text).rows
    let matchingRows = rows.filter((row) => {
      let cwd = stringValue(row.value.cwd)
      let time = new Date(row.value.timestamp ?? '').getTime()
      return (
        !!cwd &&
        pathsEqual(cwd, options.targetRoot) &&
        within(
          time,
          options.startedAt.getTime() - START_TOLERANCE_MS,
          options.stoppedAt.getTime() + STOP_TOLERANCE_MS,
        )
      )
    })
    if (matchingRows.length === 0) continue

    candidates.push({
      filePath,
      hasRunId: matchingRows.some((row) =>
        rowContainsRunId(row, options.runId),
      ),
    })
  }

  return candidates
}

function rowContainsRunId(row: ParsedRow, runId: string) {
  return toolUses(row).some(
    (call) => isSkillTraceTool(call.name) && call.input.run_id === runId,
  )
}

function selectCandidate(candidates: ClaudeCandidate[]): CandidateMatch {
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
      warnings: ['multiple_time_and_cwd_matches'],
    }
  }

  return {
    status: 'unavailable',
    confidence: 'unknown',
    warnings: [],
  }
}

function toolUses(row: ParsedRow) {
  let content = row.value.message?.content
  if (row.value.type !== 'assistant' || !Array.isArray(content)) return []

  return content
    .filter(
      (block): block is Record<string, unknown> =>
        !!block &&
        typeof block === 'object' &&
        block.type === 'tool_use' &&
        typeof block.id === 'string' &&
        typeof block.name === 'string',
    )
    .map((block) => ({
      id: String(block.id),
      name: String(block.name),
      input: jsonObject(block.input) ?? {},
    }))
}

function toolResults(rows: ParsedRow[]) {
  let results = new Map<string, ClaudeToolResult>()

  for (let row of rows) {
    let content = row.value.message?.content
    if (row.value.type !== 'user' || !Array.isArray(content)) continue

    for (let block of content) {
      if (
        !block ||
        typeof block !== 'object' ||
        block.type !== 'tool_result' ||
        typeof block.tool_use_id !== 'string'
      )
        continue

      results.set(block.tool_use_id, {
        outcome: block.is_error === true ? 'failed' : 'success',
        timestamp: timestampValue(row.value.timestamp),
      })
    }
  }

  return results
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
      rows.push({ index, value: JSON.parse(line) })
    } catch {
      errorCount += 1
    }
  }

  return { rows, errorCount }
}

function emptyParsed(warning: string): ParsedClaudeProviderHistory {
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
      provider: 'claude_code',
      evidence_event_count: 0,
      execution_operation_count: 0,
      recognized_record_count: 0,
      partially_extracted_record_count: 0,
      unsupported_record_count: 0,
      intentionally_ignored_record_count: 0,
      extraction_method_counts: {},
      ignored_circular_call_count: 0,
      ignored_unsupported_call_count: 0,
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

function encodeProjectPath(value: string) {
  return path.resolve(value).replace(/[^A-Za-z0-9]/g, '-')
}

function sourceFingerprint(...values: string[]) {
  return `sha256:${createHash('sha256').update(values.join('\0')).digest('hex')}`
}

function duration(start?: string, finish?: string) {
  if (!start || !finish) return undefined
  let value = new Date(finish).getTime() - new Date(start).getTime()
  return Number.isFinite(value) && value >= 0 ? value : undefined
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

type CollectClaudeProviderHistoryOptions = {
  runId: string
  targetRoot: string
  skillRoots: string[]
  startedAt: string
  stoppedAt: string
  claudeHome?: string
  stabilityIntervalMs?: number
  stabilityAttempts?: number
}

type ParseClaudeProviderHistoryOptions = Omit<
  CollectClaudeProviderHistoryOptions,
  'claudeHome' | 'stabilityIntervalMs' | 'stabilityAttempts'
> & {
  matchConfidence: MatchConfidence
}

type ParsedClaudeProviderHistory = {
  supported: boolean
  sessionId: string
  clientVersion?: string
  model?: string
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
  warnings: string[]
}

type DiscoverCandidatesOptions = {
  projectsRoot: string
  targetRoot: string
  runId: string
  startedAt: Date
  stoppedAt: Date
}

type ClaudeCandidate = {
  filePath: string
  hasRunId: boolean
}

type CandidateMatch = {
  status: CollectionStatus
  confidence: MatchConfidence
  candidate?: ClaudeCandidate
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

type ClaudeToolCall = {
  id: string
  name: string
  input: Record<string, unknown>
}

type ClaudeToolResult = {
  outcome: Outcome
  timestamp?: string
}

type ProjectionContext = {
  sessionId: string
  cwd: string
  timestamp?: string
  rowIndex: number
  sidechain: boolean
  result?: ClaudeToolResult
  options: ParseClaudeProviderHistoryOptions
  events: ProviderHistoryEvent[]
  fingerprints: Set<string>
}

type OperationProjection = {
  kind: 'file_read' | 'file_edit' | 'test' | 'typecheck' | 'lint' | 'build'
  classifier: string
  artifactRefs: string[]
  outcome: Outcome
  durationMs?: number
  classificationConfidence: 'high' | 'medium'
}

type SkillReadProjection = {
  filePath: string
  classifier: string
  evidenceKind: 'direct_file_read' | 'shell_content_read'
  confidence: 'high' | 'medium'
  outcome: Outcome
}

type ProjectionResult = 'recognized' | 'ignored' | 'circular' | 'unsupported'
