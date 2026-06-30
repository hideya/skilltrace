import {
  badRequestError,
  methodNotAllowedError,
} from '~/lib/.server/errors'
import { jsonFromRequest } from './+/request.server'
import {
  ActiveSessionError,
  startTraceSession,
} from '~/models/.server/trace-session'

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

  let session
  try {
    session = await startTraceSession({
      target_root: input.target_root,
      instrumentation: input.instrumentation,
      trace_mode: input.trace_mode,
      git_snapshot: input.git_snapshot,
      instruction_surfaces: input.instruction_surfaces,
      instruction_profile: input.instruction_profile,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('sudo is not ready')) {
      throw badRequestError(error.message)
    }
    if (error instanceof ActiveSessionError) {
      return Response.json(
        {
          ok: false,
          error: 'session_already_active',
          session: error.session,
        },
        { status: 409 },
      )
    }

    throw error
  }

  return Response.json({
    ok: true,
    session,
  })
}
