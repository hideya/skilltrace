import {
  methodNotAllowedError,
  notFoundError,
} from '~/lib/.server/errors'
import { jsonFromRequest } from './+/request.server'
import { resolveTraceSession } from '~/models/.server/trace-session'

export async function loader() {
  throw methodNotAllowedError('POST required')
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    throw methodNotAllowedError('POST required')
  }

  let input = await jsonFromRequest(request)
  let session = resolveTraceSession({
    target_root: typeof input.target_root === 'string'
      ? input.target_root
      : undefined,
  })
  if (!session) throw notFoundError()

  return Response.json({
    ok: true,
    session,
  })
}
