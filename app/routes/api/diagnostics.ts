import { getDiagnosticsData } from '~/routes/app/+/diagnostics-data.server'

export async function loader() {
  return Response.json({
    ok: true,
    diagnostics: await getDiagnosticsData(),
  })
}
