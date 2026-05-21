import { relations } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { defaultHex, defaultNow, id, idx, timestamp } from '../helpers'
import { notes } from './notes'

export const users = sqliteTable(
  'users',
  {
    id: id(),
    public_id: defaultHex(),
    email: text().unique().notNull(),
    name: text(),
    role: text({ enum: ['admin'] }),
    created_at: defaultNow(),
    updated_at: defaultNow(),
    verified_at: timestamp(),
    token: defaultHex(24),
    token_expires_at: timestamp(),
    password: text(),
    bag: text({ mode: 'json' }).$type<UserBag>(),
  },
  (t) => [idx(t, 'created_at'), idx(t, 'updated_at')],
)

export type Select = typeof users.$inferSelect
export type Insert = typeof users.$inferInsert
export type Update = Partial<Insert>

export type UserBag = {
  auth: {
    google?: { id: string; image_url: string }
    github?: { id: number; image_url: string; login: string }
  }
}

export const userRelations = relations(users, ({ many }) => ({
  notes: many(notes),
}))
