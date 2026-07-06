import { useState } from 'react'
import { JsonBlock, SectionSummaryHeader } from './run-detail-ui'

const reflectionModes = ['pretty', 'raw'] as const

export function RunReflectionPanel({ reflection }: RunReflectionPanelProps) {
  let [mode, setMode] = useState<ReflectionMode>('pretty')

  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-box border border-base-300 bg-base-100 p-5 shadow-sm">
      <div className="mb-2 flex flex-col gap-2 sm:flex-col sm:items-start sm:justify-between">
        <SectionSummaryHeader
          summary="Post-run self-report"
          title="Run reflection"
        />
        {reflection ? (
          <div className="flex w-full flex-col items-end">
            <div className="join gap-2">
              {reflectionModes.map((option) => (
                <button
                  aria-pressed={mode === option}
                  className={`btn join-item btn-xs ${
                    mode === option ? 'btn-primary' : 'btn-outline'
                  }`}
                  key={option}
                  onClick={() => setMode(option)}
                  type="button"
                >
                  {capitalize(option)}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {reflection ? (
        mode === 'pretty' ? (
          <ReflectionPretty value={reflection} />
        ) : (
          <div className="min-h-0 w-full flex-1 items-end">
            <JsonBlock className="h-full max-h-none" flush value={reflection} />
          </div>
        )
      ) : (
        <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
          No run reflection declared.
        </div>
      )}
    </section>
  )
}

function ReflectionPretty({ value }: ReflectionPrettyProps) {
  let fileSections = reflectionFileSections(value)
  let entries = Object.entries(omitReflectionFileSections(value)).filter(
    ([_, item]) => hasValue(item),
  )

  if (entries.length === 0 && fileSections.length === 0) {
    return (
      <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
        Empty reflection.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {fileSections.length > 0 ? (
        <div className="space-y-3 rounded-box border border-base-300 bg-base-100 p-3">
          <h3 className="text-sm font-semibold text-base-content/70">
            Reflected file usage
          </h3>
          <div className="space-y-3">
            {fileSections.map((section) => (
              <ReflectionFileSection
                items={section.items}
                key={section.key}
                title={section.title}
              />
            ))}
          </div>
        </div>
      ) : null}
      {entries.map(([key, item]) => (
        <ReflectionSection item={item} key={key} name={reflectionLabel(key)} />
      ))}
    </div>
  )
}

function ReflectionFileSection({ title, items }: ReflectionFileSectionProps) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold text-base-content/60">{title}</h4>
      <ul className="space-y-1">
        {items.map((item, index) => (
          <li
            className="rounded bg-base-200 px-2 py-1 font-mono text-xs break-words"
            key={`${item}-${index}`}
          >
            {item}
          </li>
        ))}
      </ul>
    </section>
  )
}

function ReflectionSection({ name, item }: ReflectionSectionProps) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-base-content/70">{name}</h3>
      <ReflectionValue item={item} />
    </section>
  )
}

function ReflectionValue({ item }: ReflectionValueProps) {
  if (Array.isArray(item)) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm">
        {item.map((entry, index) => (
          <li className="break-words" key={index}>
            <ReflectionValue item={entry} />
          </li>
        ))}
      </ul>
    )
  }

  if (item && typeof item === 'object') {
    return (
      <div className="space-y-3 rounded-box bg-base-200 p-3">
        {Object.entries(item).map(([key, value]) => (
          <div className="space-y-1" key={key}>
            <h4 className="text-xs font-semibold text-base-content/60">
              {reflectionLabel(key)}
            </h4>
            <ReflectionValue item={value} />
          </div>
        ))}
      </div>
    )
  }

  return <p className="text-sm leading-relaxed break-words">{String(item)}</p>
}

function reflectionLabel(key: string) {
  let labels: Record<string, string> = {
    task_outcome: 'Task outcome',
    summary: 'Summary',
    skills_used: 'Skills used',
    skills_read: 'Skills read',
    references_read: 'References read',
    files_believed_to_influence_work: 'Files believed to influence work',
    file_usage_uncertainties: 'File usage uncertainties',
    skills_skipped: 'Skills skipped',
    decision_notes: 'Decision notes',
    instrumentation_notes: 'Instrumentation notes',
    uncertainty: 'Uncertainty',
    next_steps: 'Next steps',
  }

  return labels[key] ?? key.split('_').filter(Boolean).map(capitalize).join(' ')
}

function reflectionFileSections(value: Record<string, any>) {
  return REFLECTION_FILE_FIELDS.map((field) => ({
    key: field.key,
    title: field.title,
    items: stringList(value[field.key]),
  })).filter((section) => section.items.length > 0)
}

function omitReflectionFileSections(value: Record<string, any>) {
  let next = { ...value }
  for (let field of REFLECTION_FILE_FIELDS) {
    delete next[field.key]
  }
  return next
}

function stringList(value: any) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.trim())
}

function hasValue(value: any) {
  if (value === null || value === undefined || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

function capitalize(value: string) {
  if (!value) return value
  return `${value[0].toUpperCase()}${value.slice(1)}`
}

type RunReflectionPanelProps = {
  reflection?: Record<string, any> | null
}

type ReflectionPrettyProps = {
  value: Record<string, any>
}

type ReflectionSectionProps = {
  name: string
  item: any
}

type ReflectionFileSectionProps = {
  title: string
  items: string[]
}

type ReflectionValueProps = {
  item: any
}

type ReflectionMode = (typeof reflectionModes)[number]

const REFLECTION_FILE_FIELDS = [
  { key: 'skills_read', title: 'Skills read' },
  { key: 'references_read', title: 'References read' },
  {
    key: 'files_believed_to_influence_work',
    title: 'Files believed to influence work',
  },
  { key: 'file_usage_uncertainties', title: 'File usage uncertainties' },
] as const
