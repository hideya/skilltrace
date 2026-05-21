import { relations } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { defaultNow, foreign, id } from '../helpers'
import { users } from './users'

export const notes = sqliteTable('notes', {
  id: id(),
  user_id: foreign(() => users).notNull(),
  title: text().notNull(),
  content: text(),
  created_at: defaultNow(),
  updated_at: defaultNow(),
})

export type Select = typeof notes.$inferSelect
export type Insert = typeof notes.$inferInsert
export type Update = Partial<Insert>

export const noteRelations = relations(notes, ({ one }) => ({
  user: one(users, {
    fields: [notes.user_id],
    references: [users.id],
  }),
}))
