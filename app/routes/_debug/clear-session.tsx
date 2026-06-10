import { logout } from '~/.server/auth/cookie'
import { notFoundError } from '~/lib/.server/errors'

export async function loader({ request }: { request: Request }) {
  // if (process.env.NODE_ENV === 'production') throw notFoundError()
  return await logout(request)
}

export default function Page() {
  return null
}
