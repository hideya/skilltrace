import { SectionSummaryHeader } from './run-detail-ui'

export function ConsistencyPanel({ rows, traceMode }: ConsistencyPanelProps) {
  let description = consistencyDescription(traceMode)

  return (
    <section className="rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <SectionSummaryHeader
        className="mb-4"
        summary={`${rows.length} file${rows.length === 1 ? '' : 's'} · ${description}`}
        title="Consistency"
      />

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="table table-sm">
            <thead>
              <tr>
                <th className="text-center">Kind</th>
                <th>File</th>
                <th className="text-center">Passive</th>
                <th className="text-center">Semantic</th>
                <th className="text-center">Reflection</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  className={consistencyRowClass(row)}
                  key={`${row.kind}-${row.file}`}
                >
                  <td className="text-center">
                    <span className="badge badge-outline badge-sm">
                      {row.kind}
                    </span>
                  </td>
                  <td
                    className="max-w-[28rem] font-mono text-xs break-words"
                    title={row.file}
                  >
                    {displayRunFilePath(row.file)}
                  </td>
                  <td className="text-center">
                    <ConsistencyDot
                      active={row.passive}
                      expected={row.passive_expected}
                      tone="passive"
                    />
                  </td>
                  <td className="text-center">
                    <ConsistencyDot
                      active={row.semantic}
                      expected={row.semantic_expected}
                      state={row.semantic_state}
                      tone="semantic"
                    />
                  </td>
                  <td className="text-center">
                    <ConsistencyDot
                      active={row.reflection}
                      expected={row.reflection_expected}
                      tone="semantic"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
          No keyed skill events to check yet.
        </div>
      )}
    </section>
  )
}

function ConsistencyDot({
  active,
  expected = true,
  state,
  tone,
}: ConsistencyDotProps) {
  if (!expected) {
    return (
      <span
        aria-label="Not expected in this mode"
        className="inline-block size-3 rounded-full border border-dashed border-base-300"
        title="Not expected in this mode"
      />
    )
  }

  let activeClass = tone === 'semantic' ? 'bg-indigo-400' : 'bg-teal-400'
  let isPartial = tone === 'semantic' && state === 'partial'
  let className = active
    ? activeClass
    : isPartial
      ? 'bg-indigo-400/50'
      : 'bg-base-300'
  let label = active
    ? 'Observed'
    : isPartial
      ? 'Started, waiting for finish'
      : 'Missing'

  return (
    <span
      aria-label={label}
      className={`inline-block size-3 rounded-full ${className}`}
      title={label}
    />
  )
}

function consistencyDescription(mode?: string) {
  if (mode === 'passive_only') return 'checking passive observations'
  if (mode === 'passive_reflection') {
    return 'checking passive observations and reflection'
  }
  return 'checking passive, semantic, and reflection evidence'
}

function consistencyRowClass(row: any) {
  if (row.status === 'error') return 'bg-error/20'
  if (row.status === 'warning') return 'bg-warning/20'
  return ''
}

function displayRunFilePath(filePath: string) {
  let normalized = filePath.replaceAll('\\', '/')
  let parts = normalized.split('/').filter(Boolean)
  let agentSkillIndex = parts.findIndex((part, index) =>
    part === 'skills' && parts[index - 1] === '.agents'
  )
  let skillIndex = parts.indexOf('.skills')

  if (agentSkillIndex > 0) {
    return parts.slice(agentSkillIndex - 1).join('/')
  }

  if (skillIndex >= 0) {
    return parts.slice(skillIndex).join('/')
  }

  return filePath
}

type ConsistencyPanelProps = {
  rows: any[]
  traceMode?: string
}

type ConsistencyDotProps = {
  active: boolean
  expected?: boolean
  state?: 'complete' | 'partial' | 'missing'
  tone: 'passive' | 'semantic'
}
