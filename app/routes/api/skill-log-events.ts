import {
  badRequestError,
  methodNotAllowedError,
} from '~/lib/.server/errors'
import { validate } from '~/lib/data/validate'
import {
  appendSemanticEvent,
  semanticEventSchema,
} from '~/models/.server/trace'

export async function loader() {
  throw methodNotAllowedError('POST required')
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    throw methodNotAllowedError('POST required')
  }

  let input = await jsonFromRequest(request)
  let result = validate(input, semanticEventSchema)
  if (!result.ok) return Response.json({ errors: result.errors }, { status: 422 })

  let event = await appendSemanticEvent(result.data)

  return Response.json({
    ok: true,
    event: {
      id: event.public_id,
      run_id: result.data.run_id,
      event_type: event.event_type,
      source: event.source,
      timestamp: event.timestamp,
    },
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
