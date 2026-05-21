import type { Select as User } from '~/.server/db/schema'

export type { User }

export function isAdmin(user?: User | null) {
  return user?.role === 'admin'
}
