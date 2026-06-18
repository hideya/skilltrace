import { methodNotAllowedError } from '~/lib/.server/errors'
import { stopTraceSession } from '~/models/.server/trace-session'

export async function loader() {
  throw methodNotAllowedError('POST required')
}

export async function action({ request }) {
  if (request.method !== 'POST') {
    throw methodNotAllowedError('POST required')
  }

  let session = await stopTraceSession()

  return Response.json({
    ok: true,
    session,
  })
}
