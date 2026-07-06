import { type ReactNode } from 'react'
import { AnimatedDisclosure } from '~/ui/animated-disclosure'

export function CompactDetailsPanel({
  children,
  summary,
  title,
}: CompactDetailsPanelProps) {
  return (
    <AnimatedDisclosure
      childrenClassName="border-t border-base-300 p-5"
      className="rounded-box border border-base-300 bg-base-100 shadow-sm"
      header={<CompactDisclosureHeader summary={summary} title={title} />}
      headerClassName="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left"
    >
      {children}
    </AnimatedDisclosure>
  )
}

export function CompactDisclosureHeader({
  subsection = false,
  summary,
  title,
}: CompactDisclosureHeaderProps) {
  let titleClassName = subsection
    ? 'truncate font-semibold text-base-content/70'
    : 'section-title shrink-0'

  return (
    <>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-5 gap-y-1">
        <h2 className={titleClassName}>{title}</h2>
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-base-content/60">
          {summary}
        </p>
      </div>
      <span className="badge shrink-0 badge-outline">details</span>
    </>
  )
}

export function SectionSummaryHeader({
  className = '',
  summary,
  title,
}: SectionSummaryHeaderProps) {
  return (
    <div
      className={`flex min-w-0 flex-wrap items-baseline gap-x-5 gap-y-1 ${className}`}
    >
      <h2 className="section-title shrink-0">{title}</h2>
      <p className="min-w-0 text-sm text-base-content/60">{summary}</p>
    </div>
  )
}

export function EmptyPanel({ children }: EmptyPanelProps) {
  return (
    <div className="rounded-box border border-dashed border-base-300 p-5 text-center text-sm text-base-content/60">
      {children}
    </div>
  )
}

export function Metric({ label, value }: MetricProps) {
  return (
    <div className="rounded-box border border-base-300 bg-base-100 p-4 shadow-sm">
      <p className="text-left text-xs tracking-[0.2em] text-base-content/50 uppercase">
        {label}
      </p>
      <p className="mt-2 truncate text-right text-1.5xl font-semibold">
        {value}
      </p>
    </div>
  )
}

export function StatTile({ label, value }: StatTileProps) {
  return (
    <div className="rounded-box bg-base-200 p-3">
      <p className="text-xs tracking-[0.16em] text-base-content/50 uppercase">
        {label}
      </p>
      <p className="mt-1 truncate font-mono text-sm font-semibold">{value}</p>
    </div>
  )
}

type CompactDetailsPanelProps = {
  children: ReactNode
  summary: string
  title: string
}

type CompactDisclosureHeaderProps = {
  subsection?: boolean
  summary: string
  title: string
}

type SectionSummaryHeaderProps = {
  className?: string
  summary: string
  title: string
}

type EmptyPanelProps = {
  children: any
}

type MetricProps = {
  label: string
  value: any
}

type StatTileProps = {
  label: string
  value: any
}
