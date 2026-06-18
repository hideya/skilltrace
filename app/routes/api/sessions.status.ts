import { getTraceSession } from '~/models/.server/trace-session'

export async function loader() {
  return Response.json({
    ok: true,
    session: getTraceSession() ?? null,
  })
}
