import { collectClaudeProviderHistory } from './claude'
import { collectCodexProviderHistory } from './codex'
import { collectGeminiProviderHistory } from './gemini'
import type {
  CollectProviderHistoryOptions,
  ProviderHistoryCollection,
} from './types'

export async function collectProviderHistory(
  options: CollectProviderHistoryOptions,
): Promise<ProviderHistoryCollection> {
  let codex = await collectCodexProviderHistory({
    ...options,
    codexHome: options.codexHome,
  })
  let claude = await collectClaudeProviderHistory({
    ...options,
    claudeHome: options.claudeHome,
  })
  let gemini = await collectGeminiProviderHistory({
    ...options,
    geminiHome: options.geminiHome,
  })
  let collections = [codex, claude, gemini]
  let exact = collections.filter(
    (collection) =>
      usable(collection) && collection.summary.match_confidence === 'high',
  )

  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return ambiguousCollection(exact)

  let usableCollections = collections.filter(usable)
  if (usableCollections.length === 1) return usableCollections[0]
  if (usableCollections.length > 1) {
    return ambiguousCollection(usableCollections)
  }

  let relevant = collections.filter(
    (collection) => collection.status !== 'unavailable',
  )
  if (relevant.length === 1) return relevant[0]
  if (relevant.length > 1) return ambiguousCollection(relevant)

  return unavailableCollection()
}

function usable(collection: ProviderHistoryCollection) {
  return ['collected', 'possibly_incomplete'].includes(collection.status)
}

function ambiguousCollection(collections: ProviderHistoryCollection[]) {
  let providers = collections
    .map((collection) => collection.summary.provider)
    .filter((value): value is string => typeof value === 'string')

  return baseCollection('ambiguous', {
    provider_candidates: [...new Set(providers)],
    warnings: ['multiple_provider_matches'],
  })
}

function unavailableCollection() {
  return baseCollection('unavailable')
}

function baseCollection(
  status: 'ambiguous' | 'unavailable',
  details: Record<string, unknown> = {},
): ProviderHistoryCollection {
  return {
    status,
    events: [],
    summary: {
      status,
      provider: 'unknown',
      evidence_event_count: 0,
      execution_operation_count: 0,
      recognized_record_count: 0,
      partially_extracted_record_count: 0,
      unsupported_record_count: 0,
      intentionally_ignored_record_count: 0,
      extraction_method_counts: {},
      ignored_circular_call_count: 0,
      ignored_unsupported_call_count: 0,
      warnings: [],
      ...details,
    },
  }
}
