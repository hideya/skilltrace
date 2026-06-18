import {
  badRequestError,
  methodNotAllowedError,
} from '~/lib/.server/errors'
import { startTraceSession } from '~/models/.server/trace-session'

export async function loader() {
  throw methodNotAllowedError('POST required')
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    throw methodNotAllowedError('POST required')
  }

  let input = await jsonFromRequest(request)
  if (!input.target_root || typeof input.target_root !== 'string') {
    throw badRequestError('target_root is required')
  }

  let session = await startTraceSession({
    target_root: input.target_root,
  })

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
