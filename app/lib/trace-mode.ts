export const TRACE_MODES = [
  'full',
  'passive_reflection',
  'passive_only',
] as const

export function isTraceMode(value: unknown): value is TraceMode {
  return TRACE_MODES.includes(value as TraceMode)
}

export function normalizeTraceMode(value: unknown): TraceMode {
  return isTraceMode(value) ? value : 'full'
}

export function traceModeLabel(value: unknown) {
  if (value === 'passive_reflection') return 'passive + reflection'
  if (value === 'passive_only') return 'passive only'
  if (value === 'full') return 'full'
  return 'unknown'
}

export type TraceMode = (typeof TRACE_MODES)[number]
