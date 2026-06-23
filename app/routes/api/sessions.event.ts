import {
  badRequestError,
  methodNotAllowedError,
  notFoundError,
} from '~/lib/.server/errors'
import { appendTraceSessionEvent } from '~/models/.server/trace-session'

export async function loader() {
  throw methodNotAllowedError('POST required')
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    throw methodNotAllowedError('POST required')
  }

  let input = await jsonFromRequest(request)
  if (!input.run_id || typeof input.run_id !== 'string') {
    throw badRequestError('run_id is required')
  }
  if (!input.event_type || typeof input.event_type !== 'string') {
    throw badRequestError('event_type is required')
  }

  let session = await appendTraceSessionEvent({
    run_id: input.run_id,
    event_type: input.event_type,
    payload: typeof input.payload === 'object' && input.payload
      ? input.payload
      : {},
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
