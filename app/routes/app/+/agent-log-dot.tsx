import { MinusIcon } from 'lucide-react'

export function AgentLogDot({
  active,
  context,
  status,
}: AgentLogDotProps) {
  if (active) {
    return (
      <span
        aria-label="Observed in agent execution logs"
        className="inline-block size-3 rounded-full bg-amber-400"
        title="Observed in agent execution logs; advisory only"
      />
    )
  }

  if (context) {
    return (
      <span
        aria-label="Matching context-only execution-log operation"
        className="inline-block size-3 rounded-full border-2 border-amber-400"
        title="Matching execution-log file-read target; context only, not positive evidence"
      />
    )
  }

  if (status === 'collected') {
    return (
      <span
        aria-label="Not observed in agent execution logs"
        className="inline-block size-3 rounded-full border border-base-content/30"
        title="Not observed in collected agent execution logs; advisory only"
      />
    )
  }

  let label = unavailableLabel(status)

  return (
    <span
      aria-label={label}
      className="inline-flex size-3 items-center justify-center text-xs leading-none text-base-content/40"
      title={label}
    >
      <MinusIcon aria-hidden="true" className="size-3" />
    </span>
  )
}

function unavailableLabel(status?: string) {
  if (status === 'possibly_incomplete') {
    return 'Not established; execution-log collection may be incomplete'
  }
  if (status === 'unavailable') return 'Agent execution logs unavailable'
  if (status === 'ambiguous') {
    return 'Agent execution log match was ambiguous'
  }
  if (status === 'unsupported_format') {
    return 'Agent execution log format was unsupported'
  }
  if (status === 'failed') return 'Agent execution log collection failed'
  return 'Agent execution logs were not collected'
}

type AgentLogDotProps = {
  active?: boolean
  context?: boolean
  status?: string
}
