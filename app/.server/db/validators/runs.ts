import { createInsertSchema } from 'drizzle-zod'
import { runs } from '../schema'

export const runInsertSchema = createInsertSchema(runs, {
  status: (z) => z.trim().min(1, 'Status is required'),
})

export const runUpdateSchema = runInsertSchema
  .pick({
    user_id: true,
    name: true,
    description: true,
    status: true,
    started_at: true,
    finished_at: true,
    bag: true,
  })
  .partial()
