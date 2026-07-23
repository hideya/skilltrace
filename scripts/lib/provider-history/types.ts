export type ProviderHistoryEvent = {
  event_type:
    | 'skill_file_read'
    | 'skill_reference_read'
    | 'execution_operation_observed'
  timestamp?: string
  artifact_refs?: string[]
  skill?: {
    name?: string
    path?: string
  }
  payload: Record<string, unknown>
}

export type ProviderHistoryCollection = {
  status: CollectionStatus
  events: ProviderHistoryEvent[]
  summary: Record<string, unknown>
}

export type CollectionStatus =
  | 'collected'
  | 'unavailable'
  | 'ambiguous'
  | 'unsupported_format'
  | 'possibly_incomplete'
  | 'failed'

export type MatchConfidence = 'high' | 'medium' | 'unknown'
export type Outcome = 'success' | 'failed' | 'unknown'
export type Confidence = 'high' | 'medium' | 'low'

export type CollectProviderHistoryOptions = {
  runId: string
  targetRoot: string
  skillRoots: string[]
  startedAt: string
  stoppedAt: string
  codexHome?: string
  claudeHome?: string
  stabilityIntervalMs?: number
  stabilityAttempts?: number
}
