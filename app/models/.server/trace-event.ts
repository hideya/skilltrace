import { trace_events } from '~/.server/db/schema/trace-events'
import { createModel } from './base'

const base = createModel(trace_events)

export const TraceEvent = {
  ...base,
}
