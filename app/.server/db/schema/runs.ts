import { relations } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { defaultHex, defaultNow, foreign, id, idx, timestamp } from '../helpers'
import { trace_events } from './trace-events'
import { users } from './users'

export const runs = sqliteTable(
  'runs',
  {
    id: id(),
    public_id: defaultHex(),
    user_id: foreign(() => users),
    name: text(),
    description: text(),
    status: text().notNull().default('active'),
    started_at: defaultNow(),
    finished_at: timestamp(),
    bag: text({ mode: 'json' }).$type<RunBag>(),
    created_at: defaultNow(),
    updated_at: defaultNow(),
  },
  (t) => [idx(t, 'user_id'), idx(t, 'created_at'), idx(t, 'status')],
)

export type Select = typeof runs.$inferSelect
export type Insert = typeof runs.$inferInsert
export type Update = Partial<Insert>

export type RunBag = Record<string, unknown>

export const runRelations = relations(runs, ({ one, many }) => ({
  user: one(users, {
    fields: [runs.user_id],
    references: [users.id],
  }),
  trace_events: many(trace_events),
}))
