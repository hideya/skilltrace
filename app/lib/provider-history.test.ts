import { describe, expect, test } from 'vitest'
import {
  providerExecutionIdentity,
  withProviderExecutionIdentity,
} from './provider-history'

describe('provider execution identity', () => {
  test('prefers matched provider execution configuration', () => {
    let context = {
      agent: 'Codex',
      model: 'GPT-5 (uncertain)',
      client: 'Codex (uncertain)',
    }
    let history = {
      provider_session_id: 'session-1',
      provider_model: 'fallback-model',
      provider_client_version: '0.143.0',
      provider_environment: {
        model: 'gpt-5.6-sol',
        client: 'codex-tui',
        client_version: '0.144.0',
      },
    }

    expect(withProviderExecutionIdentity(context, history)).toEqual({
      agent: 'Codex',
      model: 'gpt-5.6-sol',
      client: 'codex-tui 0.144.0',
    })
  })

  test('uses collection-summary identity when environment data is absent', () => {
    expect(
      providerExecutionIdentity({
        provider: 'codex',
        provider_session_id: 'session-1',
        provider_model: 'gpt-5.6-sol',
        provider_client_version: '0.143.0',
      }),
    ).toEqual({
      model: 'gpt-5.6-sol',
      client: 'Codex 0.143.0',
    })
  })

  test('keeps declared context when provider history is not matched', () => {
    let context = {
      model: 'declared-model',
      client: 'declared-client',
    }

    expect(
      withProviderExecutionIdentity(context, {
        status: 'unavailable',
        provider_model: 'unmatched-model',
      }),
    ).toBe(context)
  })
})
