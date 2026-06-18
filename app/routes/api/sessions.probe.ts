import {
  badRequestError,
  methodNotAllowedError,
  notFoundError,
} from '~/lib/.server/errors'
import { attachTraceSessionProbe } from '~/models/.server/trace-session'

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
  if (!Number.isInteger(input.probe_pid)) {
    throw badRequestError('probe_pid is required')
  }

  let session = await attachTraceSessionProbe({
    run_id: input.run_id,
    probe_pid: input.probe_pid,
    probe_log_path: typeof input.probe_log_path === 'string'
      ? input.probe_log_path
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
