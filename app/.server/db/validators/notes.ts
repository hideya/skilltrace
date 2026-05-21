import { createInsertSchema } from 'drizzle-zod'
import { notes } from '../schema'

export const noteInsertSchema = createInsertSchema(notes, {
  title: (z) => z.trim().min(1, 'Title is required'),
})

export const noteUpdateSchema = noteInsertSchema
  .pick({ title: true, content: true })
  .partial()
