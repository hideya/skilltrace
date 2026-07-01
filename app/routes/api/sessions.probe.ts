import {
  badRequestError,
  methodNotAllowedError,
  notFoundError,
} from '~/lib/.server/errors'
import { jsonFromRequest } from './+/request.server'
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
  if (
    input.probe_kind !== undefined &&
    input.probe_kind !== 'run' &&
    input.probe_kind !== 'shared'
  ) {
    throw badRequestError('probe_kind must be run or shared')
  }

  let session = await attachTraceSessionProbe({
    run_id: input.run_id,
    probe_pid: input.probe_pid,
    probe_log_path: typeof input.probe_log_path === 'string'
      ? input.probe_log_path
      : undefined,
    probe_kind: input.probe_kind,
  })
  if (!session) throw notFoundError()

  return Response.json({
    ok: true,
    session,
  })
}
