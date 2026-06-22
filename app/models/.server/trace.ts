import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { db } from '~/.server/db'
import { trace_events } from '~/.server/db/schema/trace-events'
import { Run } from './run'
import { TraceEvent } from './trace-event'
import { checkTraceConsistency } from './trace-consistency'

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

export async function appendPassiveEvent(input: PassiveEventInput) {
  let timestamp = input.timestamp ? new Date(input.timestamp) : new Date()
  let run = await Run.findOrCreateBy({ public_id: input.run_id })

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
  let run = await Run.findOrCreateBy({ public_id: input.run_id })

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

export async function listRunSummaries() {
  let runs = await Run.newestBy('created_at')
  let events = await TraceEvent.newestBy('timestamp')
  let eventsByRun = groupEventsByRun(events)

  return runs.map((run) => {
    let runEvents = eventsByRun.get(run.id) ?? []
    let lastEvent = runEvents[0]

    return {
      run,
      result: summarizeConsistency(checkTraceConsistency(runEvents)),
      event_count: runEvents.length,
      last_event_at: lastEvent?.timestamp ?? null,
      last_event_type: lastEvent?.event_type ?? null,
      sources: unique(runEvents.map((event) => event.source)),
    }
  })
}

export async function getRunTimeline(publicId: string) {
  let run = await Run.findByPublicID(publicId)
  let events = await TraceEvent.oldestBy('timestamp', {
    where: { run_id: run.id },
  })

  return {
    run,
    events,
    passive_events: events.filter((event) => event.source === PASSIVE_SOURCE),
    semantic_events: events.filter((event) => event.source === SEMANTIC_SOURCE),
    consistency: checkTraceConsistency(events),
  }
}

export async function clearRunEvents(publicId: string) {
  let run = await Run.findByPublicID(publicId)
  await db.delete(trace_events).where(eq(trace_events.run_id, run.id))
  return run
}

export type PassiveEventInput = z.infer<typeof passiveEventSchema>
export type SemanticEventInput = z.infer<typeof semanticEventSchema>

const PASSIVE_SOURCE = 'passive_file_harness'
const SEMANTIC_SOURCE = 'mcp_semantic_logger'

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

function summarizeConsistency(results: ConsistencySummaryResult[]) {
  if (results.length === 0) return 'unknown'
  if (results.some((result) => result.status === 'warning')) return 'warning'
  if (results.some((result) => result.status === 'incomplete')) {
    return 'incomplete'
  }
  return 'pass'
}

type ConsistencySummaryResult = {
  status: 'pass' | 'warning' | 'incomplete'
}
