import { methodNotAllowedError } from '~/lib/.server/errors'
import { validate } from '~/lib/data/validate'
import {
  appendProviderHistoryEvents,
  providerHistoryBatchSchema,
} from '~/models/.server/trace'
import { jsonFromRequest } from './+/request.server'

export async function loader() {
  throw methodNotAllowedError('POST required')
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    throw methodNotAllowedError('POST required')
  }

  let input = await jsonFromRequest(request)
  let result = validate(input, providerHistoryBatchSchema)
  if (!result.ok)
    return Response.json({ errors: result.errors }, { status: 422 })

  let events = await appendProviderHistoryEvents(result.data)

  return Response.json({
    ok: true,
    run_id: result.data.run_id,
    accepted_event_count: events.length,
    duplicate_event_count: result.data.events.length - events.length,
  })
}
