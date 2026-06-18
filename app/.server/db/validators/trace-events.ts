import { createInsertSchema } from 'drizzle-zod'
import { trace_events } from '../schema'

export const traceEventInsertSchema = createInsertSchema(trace_events, {
  source: (z) => z.trim().min(1, 'Source is required'),
  event_type: (z) => z.trim().min(1, 'Event type is required'),
})

export const traceEventUpdateSchema = traceEventInsertSchema
  .pick({
    timestamp: true,
    source: true,
    event_type: true,
    skill_name: true,
    skill_version: true,
    skill_path: true,
    skill_file_hash: true,
    artifact_refs: true,
    payload: true,
  })
  .partial()
