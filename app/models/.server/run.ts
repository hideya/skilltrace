import { runs } from '~/.server/db/schema/runs'
import { createModel } from './base'

const base = createModel(runs)

export const Run = {
  ...base,
}
