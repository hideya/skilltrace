import { relations } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { defaultHex, defaultNow, foreign, id, idx } from '../helpers'
import { runs } from './runs'

export const trace_events = sqliteTable(
  'trace_events',
  {
    id: id(),
    public_id: defaultHex(),
    run_id: foreign(() => runs).notNull(),
    timestamp: defaultNow(),
    source: text().notNull(),
    event_type: text().notNull(),
    skill_name: text(),
    skill_version: text(),
    skill_path: text(),
    skill_file_hash: text(),
    artifact_refs: text({ mode: 'json' }).$type<string[]>(),
    payload: text({ mode: 'json' }).$type<TraceEventPayload>(),
    created_at: defaultNow(),
    updated_at: defaultNow(),
  },
  (t) => [
    idx(t, 'run_id'),
    idx(t, 'timestamp'),
    idx(t, 'event_type'),
    idx(t, 'skill_name'),
  ],
)

export type Select = typeof trace_events.$inferSelect
export type Insert = typeof trace_events.$inferInsert
export type Update = Partial<Insert>

export type TraceEventPayload = Record<string, unknown>

export const traceEventRelations = relations(trace_events, ({ one }) => ({
  run: one(runs, {
    fields: [trace_events.run_id],
    references: [runs.id],
  }),
}))
