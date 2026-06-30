import { methodNotAllowedError } from '~/lib/.server/errors'
import { jsonFromRequest } from './+/request.server'
import {
  discardTraceSession,
  stopTraceSession,
} from '~/models/.server/trace-session'

export async function loader() {
  throw methodNotAllowedError('POST required')
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    throw methodNotAllowedError('POST required')
  }

  let input = await jsonFromRequest(request)
  let session = input.discard
    ? await discardTraceSession()
    : await stopTraceSession()

  return Response.json({
    ok: true,
    session,
    discarded: input.discard === true && !!session,
  })
}
