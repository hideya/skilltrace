import { notes } from '~/.server/db/schema/notes'
import { createModel } from './base'

const base = createModel(notes)

export const Note = {
  ...base,
}
