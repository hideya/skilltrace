import { ChevronLeftIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Form, redirect, useNavigate, useRevalidator } from 'react-router'
import { notFoundError } from '~/lib/.server/errors'
import { traceModeLabel } from '~/lib/trace-mode'
import { clearRunEvents, getRunTimeline } from '~/models/.server/trace'
import { Metric } from './+/run-detail-ui'
import { ConsistencyPanel } from './+/run-consistency-panel'
import { InstructionSurfacesPanel } from './+/run-instruction-surfaces-panel'
import { RunContextPanel } from './+/run-context-panel'
import { ProviderHistoryPanel } from './+/run-provider-history-panel'
import { RunReflectionPanel } from './+/run-reflection-panel'
import { RunSnapshotPanel } from './+/run-snapshot-panel'
import { Timeline } from './+/run-timeline-panel'

// Remote/auth mode reference:
// import { requireUser } from '~/.server/auth/middlewares'

export async function loader({ params }) {
  // Remote/auth mode reference:
  // requireUser(context)
  if (!params.id) throw notFoundError()

  let timeline = await getRunTimeline(params.id)
  return { timeline }
}

export async function action({ params }) {
  // Remote/auth mode reference:
  // requireUser(context)
  if (!params.id) throw notFoundError()

  await clearRunEvents(params.id)

  return redirect(`/app/runs/${params.id}`)
}

export default function Page({ loaderData }: PageProps) {
  let { timeline } = loaderData
  let run = timeline.run
  let title = run.name || run.public_id
  let note = runNote(run)
  useAutoRefresh(run.status === 'active')

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-6 pt-10 pb-40">
      <header className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="mb-2 min-w-0 space-y-2">
            <div className="flex flex-row items-center gap-2">
              <BackButton />
              <div className="badge rounded-full badge-outline">
                Run timeline
              </div>
            </div>

            <h1 className="page-title tracking-wide break-words">{title}</h1>
            {run.description ? (
              <p className="font-mono text-base-content/70">
                {run.description}
              </p>
            ) : null}
            {note ? (
              <p className="font-medium tracking-wider text-info">{note}</p>
            ) : null}
          </div>
        </div>

        {/* <Form method="post">
          <button className="btn btn-outline" type="submit">
            Start new attempt
          </button>
        </Form> */}
      </header>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-[2fr_2fr_2fr_1fr_1fr_1fr_1fr]">
        <Metric label="Mode" value={traceModeLabel(timeline.trace_mode)} />
        <Metric label="Status" value={statusLabel(timeline.status)} />
        <Metric
          label="Result"
          value={resultLabel(timeline.result, timeline.trace_mode)}
        />
        <Metric label="Events" value={timeline.events.length} />
        <Metric label="Passive" value={timeline.passive_events.length} />
        <Metric label="Semantic" value={timeline.semantic_events.length} />
        <Metric label="Agent log" value={timeline.provider_events.length} />
      </section>

      <RunContextPanel
        context={timeline.context}
        environment={timeline.execution_environment}
        providerHistory={timeline.provider_history}
      />
      <RunSnapshotPanel snapshot={timeline.git_snapshot} />
      {timeline.instruction_surfaces ? (
        <InstructionSurfacesPanel
          profile={timeline.instruction_profile}
          report={timeline.instruction_surfaces}
        />
      ) : null}

      <ConsistencyPanel
        isFinal={timeline.status === 'finished'}
        providerHistory={timeline.provider_history}
        rows={timeline.consistency_matrix}
        traceMode={timeline.trace_mode}
      />

      <section className="grid items-stretch gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Timeline events={timeline.events} />

        <aside className="flex min-h-0 flex-col gap-4 lg:self-stretch">
          {timeline.provider_history ? (
            <ProviderHistoryPanel
              events={timeline.provider_events}
              summary={timeline.provider_history}
            />
          ) : null}
          <RunReflectionPanel reflection={timeline.reflection} />
        </aside>
      </section>
    </main>
  )
}

function runNote(run: any) {
  let note = run.bag?.note
  return typeof note === 'string' && note.trim() ? note.trim() : ''
}

function BackButton() {
  let navigate = useNavigate()

  function goBack() {
    let referrer = document.referrer ? new URL(document.referrer) : null
    let hasLocalReferrer = referrer?.origin === window.location.origin
    let hasRouterHistory = Number(window.history.state?.idx) > 0

    if (hasLocalReferrer || hasRouterHistory) {
      navigate(-1)
      return
    }

    navigate('/app/runs')
  }

  return (
    <button
      aria-label="Back"
      className="link rounded-full bg-primary text-white link-hover"
      onClick={goBack}
      type="button"
    >
      <ChevronLeftIcon className="size-10" />
    </button>
  )
}

function statusLabel(status?: string) {
  if (status === 'active') return 'active'
  if (status === 'finished') return 'finished'
  if (status === 'interrupted') return 'interrupted'
  return status ?? 'unknown'
}

function resultLabel(result?: string, mode?: string) {
  if (result === 'pass' && mode === 'passive_only') return 'captured'
  if (result === 'pass') return 'pass'
  if (result === 'warning') return 'warning'
  if (result === 'incomplete') return 'incomplete'
  if (result === 'running') return 'running'
  return result ?? 'unknown'
}

function useAutoRefresh(enabled: boolean) {
  let revalidator = useRevalidator()

  useEffect(() => {
    if (!enabled) return

    let refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (revalidator.state !== 'idle') return
      revalidator.revalidate()
    }
    let interval = window.setInterval(refresh, RUN_REFRESH_MS)

    return () => window.clearInterval(interval)
  }, [enabled, revalidator])
}

type PageProps = {
  loaderData: {
    timeline: any
  }
}

const RUN_REFRESH_MS = 3000
