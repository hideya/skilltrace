import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '~/.server/db'
import { trace_events } from '~/.server/db/schema/trace-events'
import { withProviderExecutionIdentity } from '~/lib/provider-history'
import { skillPathFromRoot } from '~/lib/skill-path'
import { isTraceMode, TRACE_MODES, type TraceMode } from '~/lib/trace-mode'
import { Run } from './run'
import {
  type ConsistencyMatrixRow,
  summarizeConsistencyMatrix,
  traceConsistencyMatrix,
} from './trace-consistency'
import { TraceEvent } from './trace-event'

export const passiveEventSchema = z.object({
  run_id: z.string().trim().min(1, 'run_id is required'),
  event_type: z.string().trim().min(1, 'event_type is required'),
  timestamp: z
    .string()
    .trim()
    .refine(isDateString, 'timestamp must be a valid date')
    .optional(),
  skill: z
    .object({
      name: z.string().trim().optional(),
      version: z.string().trim().optional(),
      path: z.string().trim().optional(),
      file_hash: z.string().trim().optional(),
    })
    .optional(),
  artifact_refs: z.array(z.string()).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

export const semanticEventSchema = z.object({
  run_id: z.string().trim().min(1, 'run_id is required'),
  event_type: z.string().trim().min(1, 'event_type is required'),
  timestamp: z
    .string()
    .trim()
    .refine(isDateString, 'timestamp must be a valid date')
    .optional(),
  skill: z
    .object({
      name: z.string().trim().optional(),
      version: z.string().trim().optional(),
      path: z.string().trim().optional(),
      file_hash: z.string().trim().optional(),
    })
    .optional(),
  summary: z.string().trim().optional(),
  confidence: z.string().trim().optional(),
  related_artifacts: z.array(z.string()).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
})

export const providerHistoryEventSchema = z
  .object({
    event_type: z.enum([
      'skill_file_read',
      'skill_reference_read',
      'execution_operation_observed',
    ]),
    timestamp: z
      .string()
      .trim()
      .refine(isDateString, 'timestamp must be a valid date')
      .optional(),
    skill: z
      .object({
        name: z.string().trim().min(1).max(256).optional(),
        path: z.string().trim().min(1).max(4096).optional(),
      })
      .strict()
      .optional(),
    artifact_refs: z.array(z.string().trim().min(1).max(4096)).optional(),
    payload: z
      .object({
        provider: z.literal('codex'),
        provider_session_id: z
          .string()
          .trim()
          .min(1, 'provider_session_id is required')
          .max(256),
        tool_name: z.string().trim().min(1).max(256),
        tool_call_id: z.string().trim().min(1).max(256),
        parent_tool_call_id: z.string().trim().min(1).max(256).optional(),
        outcome: z.enum(['success', 'failed', 'unknown']),
        evidence_kind: z.literal('shell_content_read').optional(),
        operation_kind: z
          .enum([
            'file_read',
            'file_edit',
            'test',
            'typecheck',
            'lint',
            'build',
          ])
          .optional(),
        command_classifier: z.string().trim().min(1).max(256),
        confidence: z.enum(['high', 'medium', 'low']).optional(),
        classification_confidence: z.enum(['high', 'medium', 'low']).optional(),
        extraction_method: z.enum(['direct_envelope', 'static_js']),
        extraction_confidence: z.enum(['high', 'medium', 'low']),
        evidence_status: z.literal('context_only').optional(),
        match_confidence: z.enum(['high', 'medium', 'unknown']),
        format: z.literal('codex_rollout_jsonl_v1'),
        exit_code: z.number().int().optional(),
        duration_ms: z.number().int().nonnegative().optional(),
        source_record_index: z.number().int().nonnegative(),
        source_fingerprint: z
          .string()
          .trim()
          .regex(
            /^sha256:[a-f0-9]{64}$/,
            'source_fingerprint must be a SHA-256',
          ),
      })
      .strict(),
  })
  .strict()

export const providerHistoryBatchSchema = z
  .object({
    run_id: z.string().trim().min(1, 'run_id is required'),
    events: z.array(providerHistoryEventSchema).min(1).max(1000),
  })
  .strict()

export async function appendPassiveEvent(input: PassiveEventInput) {
  let timestamp = input.timestamp ? new Date(input.timestamp) : new Date()
  let run = await findOrCreateEventRun(input.run_id, timestamp)

  return await TraceEvent.create({
    run_id: run.id,
    timestamp,
    source: PASSIVE_SOURCE,
    event_type: input.event_type,
    skill_name: input.skill?.name,
    skill_version: input.skill?.version,
    skill_path: input.skill?.path,
    skill_file_hash: input.skill?.file_hash,
    artifact_refs: input.artifact_refs ?? [],
    payload: input.payload ?? {},
  })
}

export async function appendSemanticEvent(input: SemanticEventInput) {
  let timestamp = input.timestamp ? new Date(input.timestamp) : new Date()
  let run = await findOrCreateEventRun(input.run_id, timestamp)

  return await TraceEvent.create({
    run_id: run.id,
    timestamp,
    source: SEMANTIC_SOURCE,
    event_type: input.event_type,
    skill_name: input.skill?.name,
    skill_version: input.skill?.version,
    skill_path: input.skill?.path,
    skill_file_hash: input.skill?.file_hash,
    artifact_refs: input.related_artifacts ?? [],
    payload: {
      summary: input.summary,
      confidence: input.confidence,
      data: input.data ?? {},
    },
  })
}

export async function appendProviderHistoryEvents(
  input: ProviderHistoryBatchInput,
) {
  let run = await Run.findByPublicID(input.run_id)
  let existing = await TraceEvent.findAllBy({
    run_id: run.id,
    source: PROVIDER_SOURCE,
  })
  let fingerprints = new Set(
    existing
      .map((event) => event.payload?.source_fingerprint)
      .filter((value): value is string => typeof value === 'string'),
  )
  let events = input.events.filter((event) => {
    let fingerprint = event.payload.source_fingerprint
    if (fingerprints.has(fingerprint)) return false
    fingerprints.add(fingerprint)
    return true
  })

  if (events.length === 0) return []

  return await TraceEvent.createMany(
    events.map((event) => ({
      run_id: run.id,
      timestamp: event.timestamp ? new Date(event.timestamp) : new Date(),
      source: PROVIDER_SOURCE,
      event_type: event.event_type,
      skill_name: event.skill?.name,
      skill_path: event.skill?.path,
      artifact_refs: event.artifact_refs ?? [],
      payload: event.payload,
    })),
  )
}

export async function listRunSummaries() {
  let runs = await Run.newestBy('created_at')
  let events = await TraceEvent.newestBy('timestamp')
  let eventsByRun = groupEventsByRun(events)
  let starts = sessionStartTimes(events)

  return runs.map((run) => {
    let runEvents = eventsByRun.get(run.id) ?? []
    let lastEvent = runEvents[0]
    let lifecycle = runLifecycleResult(run, runEvents, starts)
    let traceMode = runTraceMode(run, runEvents)
    let status = runDisplayStatus(run, runEvents, starts)
    let matrix = traceConsistencyMatrix(runEvents, { traceMode })
    let providerHistory = latestProviderHistory(runEvents)

    return {
      run,
      status,
      trace_mode: traceMode,
      result: lifecycle ?? summarizeConsistencyMatrix(matrix),
      context: withProviderExecutionIdentity(
        latestRunContext(runEvents),
        providerHistory,
      ),
      reflection: latestEventData(runEvents, 'run_reflection_declared'),
      event_count: runEvents.length,
      last_event_at: lastEvent?.timestamp ?? null,
      last_event_type: lastEvent?.event_type ?? null,
      sources: unique(runEvents.map((event) => event.source)),
    }
  })
}

export async function getModeComparisonForRuns(publicIds: string[]) {
  let requestedIds = unique(publicIds.map((id) => id.trim()).filter(Boolean))
  let runs =
    requestedIds.length > 0
      ? await Run.newestBy('created_at', {
          where: { public_id: { in: requestedIds } },
        })
      : []
  let runIds = runs.map((run) => run.id)
  let events =
    runIds.length > 0
      ? await TraceEvent.newestBy('timestamp', {
          where: { run_id: { in: runIds } },
        })
      : []
  let eventsByRun = groupEventsByRun(events)
  let starts = sessionStartTimes(events)
  let selected: ModeComparisonRun[] = []
  let missingIds = requestedIds.filter((id) =>
    !runs.some((run) => run.public_id === id)
  )
  let invalidReasons = [...missingIds.map((id) => `Run not found: ${id}`)]

  for (let publicId of requestedIds) {
    let run = runs.find((item) => item.public_id === publicId)
    if (!run) continue

    let runEvents = eventsByRun.get(run.id) ?? []
    let traceMode = runTraceMode(run, runEvents)
    let lifecycle = runLifecycleResult(run, runEvents, starts)
    let matrix = traceConsistencyMatrix(runEvents, { traceMode })
    let result = lifecycle ?? summarizeConsistencyMatrix(matrix)
    let status = runDisplayStatus(run, runEvents, starts)

    if (!isTraceMode(traceMode)) {
      invalidReasons.push(`${publicId} has unknown trace mode.`)
      continue
    }

    if (status !== 'finished' || result !== 'pass') {
      invalidReasons.push(`${publicId} is not a finished successful run.`)
    }

    selected.push({
      run,
      trace_mode: traceMode,
      result,
      matrix,
      event_count: runEvents.length,
      started_at: run.started_at,
      finished_at: run.finished_at,
    })
  }

  let modes = selected.map((run) => run.trace_mode)
  let distinctModes = unique(modes)

  if (selected.length < 2) {
    invalidReasons.push('Select at least two runs.')
  }

  if (distinctModes.length !== selected.length) {
    invalidReasons.push('Select only one run per mode.')
  }

  let ordered = TRACE_MODES
    .map((mode) => selected.find((run) => run.trace_mode === mode))
    .filter((run): run is ModeComparisonRun => !!run)

  return {
    group_key: selected[0] ? runGroupKey(selected[0].run) : null,
    group_label: selected[0] ? runGroupKey(selected[0].run) : 'Selected runs',
    target_root: selected[0]?.run.bag?.target_root ?? null,
    runs: ordered,
    rows: invalidReasons.length > 0 ? [] : comparisonRows(ordered),
    has_enough_runs: ordered.length >= 2,
    modes: TRACE_MODES.filter((mode) =>
      ordered.some((run) => run.trace_mode === mode)
    ),
    is_valid: invalidReasons.length === 0,
    invalid_reasons: invalidReasons,
  }
}

export async function getRunTimeline(publicId: string) {
  let run = await Run.findByPublicID(publicId)
  let events = await TraceEvent.oldestBy('timestamp', {
    where: { run_id: run.id },
  })
  let startedAt = sessionStartTime(events) ?? new Date(run.started_at)
  let newerStart = await TraceEvent.findBy({
    event_type: 'trace_session_started',
    timestamp: { gt: startedAt },
  })
  let starts = newerStart ? [new Date(newerStart.timestamp)] : []
  let traceMode = runTraceMode(run, events)
  let lifecycle = runLifecycleResult(run, events, starts)
  let consistencyMatrix = traceConsistencyMatrix(events, { traceMode })

  return {
    run,
    events,
    status: runDisplayStatus(run, events, starts),
    result: lifecycle ?? summarizeConsistencyMatrix(consistencyMatrix),
    trace_mode: traceMode,
    context: latestRunContext(events),
    execution_environment: runExecutionEnvironment(run, events),
    git_snapshot: runGitSnapshot(run, events),
    instruction_surfaces: runInstructionSurfaces(run, events),
    instruction_profile: runInstructionProfile(run, events),
    reflection: latestEventData(events, 'run_reflection_declared'),
    passive_events: events.filter((event) => event.source === PASSIVE_SOURCE),
    semantic_events: events.filter((event) => event.source === SEMANTIC_SOURCE),
    provider_events: events.filter((event) => event.source === PROVIDER_SOURCE),
    provider_history: latestProviderHistory(events),
    consistency_matrix: consistencyMatrix,
  }
}

export async function clearRunEvents(publicId: string) {
  let run = await Run.findByPublicID(publicId)
  await db.delete(trace_events).where(eq(trace_events.run_id, run.id))
  return run
}

export async function discardRunRecord(publicId: string) {
  let run = await Run.findBy({ public_id: publicId })
  if (!run) return null

  await db.delete(trace_events).where(eq(trace_events.run_id, run.id))
  return await Run.delete(run.id)
}

export async function deleteRunRecords(publicIds: string[]) {
  let deleted: any[] = []
  let requestedIds = unique(publicIds)
  if (requestedIds.length === 0) return deleted

  let runs = await Run.findAllBy({ public_id: { in: requestedIds } })
  let runIds = runs.map((run) => run.id)
  let events =
    runIds.length > 0
      ? await TraceEvent.newestBy('timestamp', {
          where: { run_id: { in: runIds } },
        })
      : []
  let eventsByRun = groupEventsByRun(events)
  let latestStarts = await TraceEvent.newestBy('timestamp', {
    where: { event_type: 'trace_session_started' },
    limit: 1,
  })
  let starts = sessionStartTimes(latestStarts)

  for (let publicId of requestedIds) {
    let run = runs.find((item) => item.public_id === publicId)
    if (!run) continue

    let runEvents = eventsByRun.get(run.id) ?? []
    if (runDisplayStatus(run, runEvents, starts) === 'active') continue

    await db.delete(trace_events).where(eq(trace_events.run_id, run.id))
    deleted.push(await Run.delete(run.id))
  }

  return deleted
}

export type PassiveEventInput = z.infer<typeof passiveEventSchema>
export type SemanticEventInput = z.infer<typeof semanticEventSchema>
export type ProviderHistoryBatchInput = z.infer<
  typeof providerHistoryBatchSchema
>

const PASSIVE_SOURCE = 'passive_file_harness'
const SEMANTIC_SOURCE = 'mcp_semantic_logger'
const PROVIDER_SOURCE = 'provider_history'
const SESSION_SOURCE = 'skilltrace_session'

async function findOrCreateEventRun(publicId: string, timestamp: Date) {
  return await Run.findOrCreateBy(
    { public_id: publicId },
    {
      status: 'finished',
      started_at: timestamp,
      finished_at: timestamp,
    },
  )
}

function isDateString(value: string) {
  return !Number.isNaN(Date.parse(value))
}

function groupEventsByRun(events: any[]) {
  let groups = new Map<number, any[]>()

  for (let event of events) {
    let group = groups.get(event.run_id) ?? []
    group.push(event)
    groups.set(event.run_id, group)
  }

  return groups
}

function unique(values: string[]) {
  return [...new Set(values)]
}

function runGroupKey(run: any) {
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

function comparisonRows(runs: ModeComparisonRun[]) {
  let rows = new Map<string, ModeComparisonRow>()

  for (let run of runs) {
    for (let row of run.matrix.filter((item) => item.status !== 'discovered')) {
      let key = `${row.kind}:${normalizeComparePath(row.file)}`
      let comparison = rows.get(key) ?? {
        kind: row.kind,
        file: displayCompareFile(row.file),
        modes: {},
        status: 'aligned',
      }

      comparison.file = displayCompareFile(row.file)
      comparison.modes[run.trace_mode] = {
        present: true,
        passive: row.passive,
        semantic: row.semantic,
        reflection: row.reflection,
      }
      rows.set(key, comparison)
    }
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      status: runs.every((run) => row.modes[run.trace_mode]?.present)
        ? 'aligned'
        : 'different',
    }))
    .toSorted((left, right) => {
      let kind = compareKindOrder(left.kind) - compareKindOrder(right.kind)
      return kind || left.file.localeCompare(right.file)
    })
}

function compareKindOrder(kind: string) {
  return kind === 'Skill' ? 0 : 1
}

function displayCompareFile(file: string) {
  return skillPathFromRoot(file, true) ?? file
}

function normalizeComparePath(file: string) {
  return displayCompareFile(file)
    .trim()
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .toLowerCase()
}

export function runLifecycleResult(
  run: RunLike,
  events: TraceEventLike[],
  starts: Date[],
) {
  let hasFinish = events.some((event) =>
    event.event_type === 'trace_session_finished'
  )
  if (hasFinish || run.status === 'finished') return null

  let startedAt = sessionStartTime(events)
  if (!startedAt) return null
  let hasNewerStart = starts.some((started) =>
    started.getTime() > startedAt.getTime()
  )
  if (hasNewerStart) return 'incomplete'
  if (run.status === 'active') return 'running'
  return null
}

function runDisplayStatus(
  run: RunLike,
  events: TraceEventLike[],
  starts: Date[],
) {
  if (
    run.status === 'active' &&
    !events.some((event) => event.event_type === 'trace_session_started')
  ) {
    return 'finished'
  }

  if (
    run.status === 'active' &&
    runLifecycleResult(run, events, starts) === 'incomplete'
  ) {
    return 'interrupted'
  }

  return run.status
}

function latestRunContext(events: any[]) {
  return latestEventData(events, 'run_context_declared')
}

function latestProviderHistory(events: any[]) {
  return latestEventPayload(
    events.filter((event) => event.source === SESSION_SOURCE),
    'provider_history_collection_finished',
  )
}

function runGitSnapshot(run: any, events: any[]) {
  if (run.bag?.git_snapshot) return run.bag.git_snapshot

  let started = events.find((event) =>
    event.event_type === 'trace_session_started'
  )
  return started?.payload?.git_snapshot ?? null
}

function runInstructionSurfaces(run: any, events: any[]) {
  if (run.bag?.instruction_surfaces) return run.bag.instruction_surfaces

  let started = events.find((event) =>
    event.event_type === 'trace_session_started'
  )
  return started?.payload?.instruction_surfaces ?? null
}

function runInstructionProfile(run: any, events: any[]) {
  if (run.bag?.instruction_profile) return run.bag.instruction_profile

  let started = events.find((event) =>
    event.event_type === 'trace_session_started'
  )
  return started?.payload?.instruction_profile ?? null
}

function runExecutionEnvironment(run: any, events: any[]) {
  if (run.bag?.execution_environment) return run.bag.execution_environment

  let started = events.find((event) =>
    event.event_type === 'trace_session_started'
  )
  return started?.payload?.execution_environment ?? null
}

function runTraceMode(run: any, events: any[]) {
  let bagMode = run.bag?.trace_mode
  if (typeof bagMode === 'string') return bagMode

  let started = events.find((event) =>
    event.event_type === 'trace_session_started'
  )
  let eventMode = started?.payload?.trace_mode
  if (typeof eventMode === 'string') return eventMode

  return 'unknown'
}

function latestEventData(events: any[], eventType: string) {
  let matches = events.filter((event) => event.event_type === eventType)
  if (matches.length === 0) return null

  let latest = matches.toSorted((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )[0]

  return latest.payload?.data ?? {}
}

function latestEventPayload(events: any[], eventType: string) {
  let matches = events.filter((event) => event.event_type === eventType)
  if (matches.length === 0) return null

  let latest = matches.toSorted(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  )[0]

  return latest.payload ?? {}
}

function sessionStartTimes(events: any[]) {
  return events
    .filter((event) => event.event_type === 'trace_session_started')
    .map((event) => new Date(event.timestamp))
    .filter((date) => !Number.isNaN(date.getTime()))
}

function sessionStartTime(events: TraceEventLike[]) {
  let starts = sessionStartTimes(events)
  if (starts.length === 0) return null
  return starts.toSorted((a, b) => a.getTime() - b.getTime())[0]
}

type RunLike = {
  status: string
  started_at: Date | string
}

type TraceEventLike = {
  event_type: string
  timestamp: Date | string
}

type ModeComparisonRun = {
  run: any
  trace_mode: TraceMode
  result: string
  matrix: ConsistencyMatrixRow[]
  event_count: number
  started_at: Date | string
  finished_at: Date | string | null
}

type ModeComparisonRow = {
  kind: 'Skill' | 'Reference'
  file: string
  modes: Record<string, ModeComparisonCell>
  status: 'aligned' | 'different'
}

type ModeComparisonCell = {
  present: boolean
  passive: boolean
  semantic: boolean
  reflection: boolean
}
