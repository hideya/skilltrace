import { createHash } from 'crypto'
import fs from 'fs'
import os from 'os'
import path from 'path'

const FORMAT = 'codex_rollout_jsonl_v1'
const MAX_SOURCE_BYTES = 128 * 1024 * 1024
const START_TOLERANCE_MS = 2_000
const STOP_TOLERANCE_MS = 1_000

export async function collectCodexProviderHistory(
  options: CollectCodexProviderHistoryOptions,
): Promise<ProviderHistoryCollection> {
  let codexHome =
    options.codexHome ??
    process.env.CODEX_HOME ??
    path.join(os.homedir(), '.codex')
  let sessionsRoot = path.join(codexHome, 'sessions')
  let startedAt = new Date(options.startedAt)
  let stoppedAt = new Date(options.stoppedAt)

  if (!validDate(startedAt) || !validDate(stoppedAt)) {
    return collectionResult('failed', {
      warnings: ['invalid_run_interval'],
    })
  }
  if (!fs.existsSync(sessionsRoot)) {
    return collectionResult('unavailable')
  }

  let candidates = discoverCandidates({
    sessionsRoot,
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

  let parsed = parseCodexProviderHistory(source.text, {
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

  return {
    status: source.stable ? 'collected' : 'possibly_incomplete',
    events: parsed.events,
    summary: {
      status: source.stable ? 'collected' : 'possibly_incomplete',
      provider: 'codex',
      provider_session_id: parsed.sessionId,
      provider_client_version: parsed.clientVersion,
      provider_model: parsed.model,
      match_confidence: match.confidence,
      completeness: parsed.completeness,
      evidence_event_count: parsed.evidenceCount,
      execution_operation_count: parsed.operationCount,
      operation_counts: parsed.operationCounts,
      ignored_circular_call_count: parsed.circularCallCount,
      ignored_unsupported_call_count: parsed.unsupportedCallCount,
      candidate_count: candidates.length,
      source_stable: source.stable,
      warnings,
    },
  }
}

export function parseCodexProviderHistory(
  text: string,
  options: ParseCodexProviderHistoryOptions,
): ParsedCodexProviderHistory {
  let parsed = parseRows(text)
  let start = new Date(options.startedAt).getTime() - START_TOLERANCE_MS
  let stop = new Date(options.stoppedAt).getTime() + STOP_TOLERANCE_MS
  let rows = parsed.rows
  let session =
    rows.find((item) => item.value.type === 'session_meta')?.value.payload ?? {}
  let sessionId = stringValue(session.id) ?? stringValue(session.session_id)
  if (!sessionId) {
    return {
      supported: false,
      sessionId: 'unknown',
      completeness: 'stable_at_stop',
      events: [],
      evidenceCount: 0,
      operationCount: 0,
      operationCounts: {},
      circularCallCount: 0,
      unsupportedCallCount: 0,
      warnings: ['missing_provider_session_id'],
    }
  }
  let currentCwd = stringValue(session.cwd) ?? options.targetRoot
  let model: string | undefined
  let outputs = functionOutputs(rows, start, stop)
  let events: ProviderHistoryEvent[] = []
  let fingerprints = new Set<string>()
  let circularCallCount = 0
  let unsupportedCallCount = 0
  let terminal: TerminalRecord | undefined

  for (let row of rows) {
    let value = row.value
    let timestamp = timestampValue(value.timestamp)
    let time = timestamp ? new Date(timestamp).getTime() : Number.NaN

    if (value.type === 'turn_context') {
      currentCwd = stringValue(value.payload?.cwd) ?? currentCwd
      if (within(time, start, stop)) {
        model = stringValue(value.payload?.model) ?? model
      }
      continue
    }

    if (
      value.type === 'event_msg' &&
      within(time, start, stop) &&
      ['task_complete', 'turn_aborted'].includes(value.payload?.type)
    ) {
      terminal = {
        type: value.payload.type,
        timestamp: timestamp!,
      }
      continue
    }

    if (
      value.type !== 'response_item' ||
      !within(time, start, stop) ||
      !['function_call', 'custom_tool_call'].includes(value.payload?.type)
    )
      continue

    let name = stringValue(value.payload?.name) ?? ''
    if (isSkillTraceTool(name)) {
      circularCallCount += 1
      continue
    }
    if (name !== 'exec_command') {
      unsupportedCallCount += 1
      continue
    }

    let args = jsonObject(value.payload?.arguments)
    let command = stringValue(args?.cmd)
    let callId = stringValue(value.payload?.call_id) ?? `record-${row.index}`
    let cwd = stringValue(args?.workdir) ?? currentCwd
    let output = outputs.get(callId)
    let outcome =
      output?.exitCode === 0
        ? 'success'
        : typeof output?.exitCode === 'number'
          ? 'failed'
          : 'unknown'
    let durationMs = duration(timestamp, output?.timestamp)
    let recognized = 0

    if (command) {
      for (let read of skillReads(command, cwd, options.skillRoots)) {
        if (outcome !== 'success') continue

        let relativePath = displayPath(read.absolutePath, options.targetRoot)
        let eventType: 'skill_file_read' | 'skill_reference_read' =
          path.basename(read.absolutePath) === 'SKILL.md'
            ? 'skill_file_read'
            : 'skill_reference_read'
        let fingerprint = sourceFingerprint(
          sessionId,
          callId,
          eventType,
          relativePath,
        )
        if (fingerprints.has(fingerprint)) continue
        fingerprints.add(fingerprint)
        recognized += 1
        events.push({
          event_type: eventType,
          timestamp,
          skill: {
            name: skillName(read.absolutePath),
            path: relativePath,
          },
          payload: {
            provider: 'codex',
            provider_session_id: sessionId,
            tool_name: name,
            tool_call_id: callId,
            outcome,
            evidence_kind: 'shell_content_read',
            command_classifier: read.classifier,
            confidence: 'medium',
            match_confidence: options.matchConfidence,
            format: FORMAT,
            source_record_index: row.index,
            source_fingerprint: fingerprint,
          },
        })
      }

      for (let operation of verificationOperations(command)) {
        let fingerprint = sourceFingerprint(
          sessionId,
          callId,
          'execution_operation_observed',
          operation.classifier,
        )
        if (fingerprints.has(fingerprint)) continue
        fingerprints.add(fingerprint)
        recognized += 1
        events.push({
          event_type: 'execution_operation_observed',
          timestamp,
          payload: {
            provider: 'codex',
            provider_session_id: sessionId,
            tool_name: name,
            tool_call_id: callId,
            operation_kind: operation.kind,
            command_classifier: operation.classifier,
            outcome,
            exit_code: output?.exitCode,
            duration_ms: durationMs,
            classification_confidence: 'medium',
            match_confidence: options.matchConfidence,
            format: FORMAT,
            source_record_index: row.index,
            source_fingerprint: fingerprint,
          },
        })
      }
    }

    if (recognized === 0) unsupportedCallCount += 1
  }

  let evidenceCount = events.filter((event) =>
    ['skill_file_read', 'skill_reference_read'].includes(event.event_type),
  ).length
  let operations = events.filter(
    (event) => event.event_type === 'execution_operation_observed',
  )

  return {
    supported: true,
    sessionId,
    clientVersion: stringValue(session.cli_version),
    model,
    completeness:
      terminal?.type === 'task_complete'
        ? 'explicit_complete'
        : terminal?.type === 'turn_aborted'
          ? 'explicit_aborted'
          : 'stable_at_stop',
    events,
    evidenceCount,
    operationCount: operations.length,
    operationCounts: countOperations(operations),
    circularCallCount,
    unsupportedCallCount,
    warnings: parsed.errorCount > 0 ? ['malformed_records_ignored'] : [],
  }
}

function discoverCandidates(options: DiscoverCandidatesOptions) {
  let candidates: CodexCandidate[] = []

  for (let directory of sessionDateDirectories(
    options.sessionsRoot,
    options.startedAt,
    options.stoppedAt,
  )) {
    if (!fs.existsSync(directory)) continue

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

      let parsed = parseRows(text)
      let session = parsed.rows.find((row) => row.value.type === 'session_meta')
        ?.value.payload
      let cwd = stringValue(session?.cwd)
      if (!cwd || !pathsEqual(cwd, options.targetRoot)) continue

      let hasActivity = parsed.rows.some((row) => {
        let time = new Date(row.value.timestamp ?? '').getTime()
        return within(
          time,
          options.startedAt.getTime() - START_TOLERANCE_MS,
          options.stoppedAt.getTime() + STOP_TOLERANCE_MS,
        )
      })
      if (!hasActivity) continue

      let hasRunId = parsed.rows.some((row) => {
        let time = new Date(row.value.timestamp ?? '').getTime()
        return (
          within(
            time,
            options.startedAt.getTime() - START_TOLERANCE_MS,
            options.stoppedAt.getTime() + STOP_TOLERANCE_MS,
          ) && JSON.stringify(row.value).includes(options.runId)
        )
      })

      candidates.push({
        filePath,
        hasRunId,
      })
    }
  }

  return candidates
}

function selectCandidate(candidates: CodexCandidate[]): CandidateMatch {
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
        return {
          stable: false,
          text: '',
          warning: 'source_too_large',
        }
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
      return {
        stable: false,
        text: '',
        warning: 'source_read_failed',
      }
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

function functionOutputs(rows: ParsedRow[], start: number, stop: number) {
  let outputs = new Map<string, FunctionOutput>()

  for (let row of rows) {
    let value = row.value
    let time = new Date(value.timestamp ?? '').getTime()
    if (
      value.type !== 'response_item' ||
      value.payload?.type !== 'function_call_output' ||
      !within(time, start, stop)
    )
      continue

    let callId = stringValue(value.payload.call_id)
    if (!callId) continue
    let output = stringValue(value.payload.output) ?? ''
    let match = output.match(/Process exited with code (-?\d+)/)
    outputs.set(callId, {
      exitCode: match ? Number(match[1]) : undefined,
      timestamp: timestampValue(value.timestamp),
    })
  }

  return outputs
}

function skillReads(command: string, cwd: string, skillRoots: string[]) {
  let reads: SkillRead[] = []
  let seen = new Set<string>()

  for (let segment of shellSegments(command)) {
    let tokens = shellTokens(segment)
    let commandIndex = shellCommandIndex(tokens)
    if (commandIndex < 0) continue
    let name = path.basename(tokens[commandIndex])
    if (!['cat', 'sed', 'head', 'tail'].includes(name)) continue
    let operands = tokens.slice(commandIndex + 1)
    if (
      name === 'sed' &&
      operands.some(
        (token) =>
          token === '-i' ||
          token.startsWith('-i') ||
          token === '--in-place' ||
          token.startsWith('--in-place='),
      )
    )
      continue

    for (let token of operands) {
      if (/^\d*[<>]/.test(token)) break
      if (!fileOperand(token)) continue
      let absolutePath = path.resolve(cwd, token)
      if (!skillRoots.some((root) => withinRoot(absolutePath, root))) continue

      let key = `${name}:${absolutePath}`
      if (seen.has(key)) continue
      seen.add(key)
      reads.push({
        absolutePath,
        classifier: name,
      })
    }
  }

  return reads
}

function verificationOperations(command: string) {
  let operations: VerificationOperation[] = []

  for (let segment of shellSegments(command)) {
    let tokens = shellTokens(segment)
    let commandIndex = shellCommandIndex(tokens)
    if (commandIndex < 0) continue
    let words = tokens.slice(commandIndex).map((token) => token.toLowerCase())
    let operation = verificationOperation(words)
    if (operation) operations.push(operation)
  }

  return operations
}

function verificationOperation(words: string[]): VerificationOperation | null {
  let runner = path.basename(words[0] ?? '')
  let args = words.slice(1).filter((word) => !word.startsWith('-'))

  if (['pnpm', 'npm', 'yarn', 'bun', 'npx'].includes(runner)) {
    if (args[0] === 'run' || args[0] === 'exec') args.shift()
    let task = args[0] ?? ''
    let kind = verificationKind(task)
    return kind
      ? { kind, classifier: `${runner}_${safeClassifier(task)}` }
      : null
  }
  if (runner === 'cargo' && args[0] === 'test') {
    return { kind: 'test', classifier: 'cargo_test' }
  }
  if (runner === 'go' && args[0] === 'test') {
    return { kind: 'test', classifier: 'go_test' }
  }
  if (runner === 'make') {
    let kind = verificationKind(args[0] ?? '')
    return kind ? { kind, classifier: `make_${safeClassifier(args[0])}` } : null
  }

  let kind = verificationKind(runner)
  return kind ? { kind, classifier: safeClassifier(runner) } : null
}

function verificationKind(value: string): OperationKind | null {
  if (/^(test|vitest|jest|pytest|rspec|mocha)(:|$)/.test(value)) return 'test'
  if (/^(tsc|typecheck|type-check|check-types)(:|$)/.test(value)) {
    return 'typecheck'
  }
  if (/^(lint|eslint|stylelint|biome|ruff)(:|$)/.test(value)) return 'lint'
  if (/^(build|compile)(:|$)/.test(value)) return 'build'
  return null
}

function shellSegments(command: string) {
  let segments: string[] = []
  let current = ''
  let quote = ''

  for (let index = 0; index < command.length; index += 1) {
    let char = command[index]
    let next = command[index + 1]

    if (quote) {
      current += char
      if (char === quote && command[index - 1] !== '\\') quote = ''
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      current += char
      continue
    }
    if (char === '\n' || char === ';' || char === '|') {
      if (current.trim()) segments.push(current.trim())
      current = ''
      if (char === '|' && next === '|') index += 1
      continue
    }
    if (char === '&' && next === '&') {
      if (current.trim()) segments.push(current.trim())
      current = ''
      index += 1
      continue
    }
    current += char
  }

  if (current.trim()) segments.push(current.trim())
  return segments
}

function shellTokens(segment: string) {
  let tokens: string[] = []
  let current = ''
  let quote = ''

  for (let index = 0; index < segment.length; index += 1) {
    let char = segment[index]
    if (quote) {
      if (char === quote && segment[index - 1] !== '\\') {
        quote = ''
      } else {
        current += char
      }
      continue
    }
    if (char === "'" || char === '"') {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) tokens.push(current)
      current = ''
      continue
    }
    if (char === '\\' && segment[index + 1]) {
      current += segment[++index]
      continue
    }
    current += char
  }

  if (current) tokens.push(current)
  return tokens
}

function shellCommandIndex(tokens: string[]) {
  let index = 0
  while (
    index < tokens.length &&
    /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[index])
  ) {
    index += 1
  }
  if (tokens[index] === 'env' || tokens[index] === 'command') index += 1
  return index < tokens.length ? index : -1
}

function fileOperand(value: string) {
  if (!value || value === '-' || value.startsWith('-')) return false
  if (/[$`*?{}]/.test(value)) return false
  return value.includes('/') || path.basename(value) === 'SKILL.md'
}

function sessionDateDirectories(root: string, start: Date, stop: Date) {
  let first = new Date(start)
  first.setDate(first.getDate() - 1)
  first.setHours(0, 0, 0, 0)
  let last = new Date(stop)
  last.setDate(last.getDate() + 1)
  last.setHours(23, 59, 59, 999)
  let directories: string[] = []

  for (
    let date = first, count = 0;
    date <= last && count < 35;
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
      count += 1
  ) {
    directories.push(
      path.join(
        root,
        String(date.getFullYear()),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
      ),
    )
  }

  return directories
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
      provider: 'codex',
      evidence_event_count: 0,
      execution_operation_count: 0,
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

function duration(start?: string, finish?: string) {
  if (!start || !finish) return undefined
  let value = new Date(finish).getTime() - new Date(start).getTime()
  return Number.isFinite(value) && value >= 0 ? value : undefined
}

function skillName(filePath: string) {
  if (path.basename(filePath) === 'SKILL.md')
    return path.basename(path.dirname(filePath))
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

function safeClassifier(value?: string) {
  return (value ?? 'unknown')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function jsonObject(value: unknown) {
  if (value && typeof value === 'object')
    return value as Record<string, unknown>
  if (typeof value !== 'string') return undefined
  try {
    let parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object'
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
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

export type ProviderHistoryEvent = {
  event_type:
    | 'skill_file_read'
    | 'skill_reference_read'
    | 'execution_operation_observed'
  timestamp?: string
  skill?: {
    name?: string
    path?: string
  }
  payload: Record<string, unknown>
}

export type ProviderHistoryCollection = {
  status: CollectionStatus
  events: ProviderHistoryEvent[]
  summary: Record<string, unknown>
}

type CollectCodexProviderHistoryOptions = {
  runId: string
  targetRoot: string
  skillRoots: string[]
  startedAt: string
  stoppedAt: string
  codexHome?: string
  stabilityIntervalMs?: number
  stabilityAttempts?: number
}

type ParseCodexProviderHistoryOptions = Omit<
  CollectCodexProviderHistoryOptions,
  'codexHome' | 'stabilityIntervalMs' | 'stabilityAttempts'
> & {
  matchConfidence: MatchConfidence
}

type ParsedCodexProviderHistory = {
  supported: boolean
  sessionId: string
  clientVersion?: string
  model?: string
  completeness: Completeness
  events: ProviderHistoryEvent[]
  evidenceCount: number
  operationCount: number
  operationCounts: Record<string, number>
  circularCallCount: number
  unsupportedCallCount: number
  warnings: string[]
}

type DiscoverCandidatesOptions = {
  sessionsRoot: string
  targetRoot: string
  runId: string
  startedAt: Date
  stoppedAt: Date
}

type CodexCandidate = {
  filePath: string
  hasRunId: boolean
}

type CandidateMatch = {
  status: CollectionStatus
  confidence: MatchConfidence
  candidate?: CodexCandidate
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

type FunctionOutput = {
  exitCode?: number
  timestamp?: string
}

type SkillRead = {
  absolutePath: string
  classifier: string
}

type VerificationOperation = {
  kind: OperationKind
  classifier: string
}

type TerminalRecord = {
  type: 'task_complete' | 'turn_aborted'
  timestamp: string
}

type CollectionStatus =
  | 'collected'
  | 'unavailable'
  | 'ambiguous'
  | 'unsupported_format'
  | 'possibly_incomplete'
  | 'failed'
type MatchConfidence = 'high' | 'medium' | 'unknown'
type Completeness = 'explicit_complete' | 'explicit_aborted' | 'stable_at_stop'
type OperationKind = 'test' | 'typecheck' | 'lint' | 'build'
