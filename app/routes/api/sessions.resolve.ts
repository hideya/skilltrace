import {
  badRequestError,
  methodNotAllowedError,
  notFoundError,
} from '~/lib/.server/errors'
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

async function jsonFromRequest(request: Request) {
  let type = request.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw badRequestError('Expected application/json')
  }

  try {
    return await request.json()
  } catch {
    throw badRequestError('Invalid JSON')
  }
}
