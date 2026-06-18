import { z } from 'zod'
import { Run } from './run'
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

export async function appendPassiveEvent(input: PassiveEventInput) {
  let timestamp = input.timestamp ? new Date(input.timestamp) : new Date()
  let run = await Run.findOrCreateBy({ public_id: input.run_id })

  return await TraceEvent.create({
    run_id: run.id,
    timestamp,
    source: 'passive_file_harness',
    event_type: input.event_type,
    skill_name: input.skill?.name,
    skill_version: input.skill?.version,
    skill_path: input.skill?.path,
    skill_file_hash: input.skill?.file_hash,
    artifact_refs: input.artifact_refs ?? [],
    payload: input.payload ?? {},
  })
}

export type PassiveEventInput = z.infer<typeof passiveEventSchema>

function isDateString(value: string) {
  return !Number.isNaN(Date.parse(value))
}
