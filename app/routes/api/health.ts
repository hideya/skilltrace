import { getTraceSession } from '~/models/.server/trace-session'

export async function loader() {
  return Response.json({
    ok: true,
    pid: process.pid,
    mode: process.env.SKILLTRACE_DEV === '1' ? 'dev' : 'package',
    port: process.env.PORT || '7555',
    host: process.env.HOST || '127.0.0.1',
    session: getTraceSession() ?? null,
  })
}
