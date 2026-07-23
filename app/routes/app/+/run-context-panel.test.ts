import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { RunContextPanel } from './run-context-panel'

describe('RunContextPanel', () => {
  test('shows recorded agent identity from an existing collection summary', () => {
    let markup = renderToStaticMarkup(
      createElement(RunContextPanel, {
        context: {
          model: 'GPT-5 (uncertain)',
          client: 'Codex (uncertain)',
        },
        providerHistory: {
          provider: 'codex',
          provider_session_id: 'session-1',
          provider_client_version: '0.143.0',
          provider_model: 'gpt-5.6-sol',
        },
      }),
    )

    expect(markup).toContain('Recorded agent configuration')
    expect(markup).toContain('Codex 0.143.0 / gpt-5.6-sol')
    expect(markup).toContain('Client version')
    expect(markup).not.toContain('GPT-5 (uncertain)')
    expect(markup).not.toContain('Codex (uncertain)')
  })

  test('keeps declared identity when no agent log session was matched', () => {
    let markup = renderToStaticMarkup(
      createElement(RunContextPanel, {
        context: {
          model: 'Declared model',
          client: 'Declared client',
        },
        providerHistory: {
          provider: 'codex',
          status: 'unavailable',
        },
      }),
    )

    expect(markup).toContain('Declared model')
    expect(markup).toContain('Declared client')
    expect(markup).not.toContain('Recorded agent configuration')
  })

  test('shows normalized agent policy without raw configuration', () => {
    let markup = renderToStaticMarkup(
      createElement(RunContextPanel, {
        providerHistory: {
          provider: 'codex',
          provider_session_id: 'session-1',
          provider_environment: {
            provider: 'codex',
            model: 'gpt-5.6-sol',
            client: 'codex-tui',
            client_version: '0.143.0',
            approval_policy: 'on-request',
            sandbox: 'workspace-write',
            network_access: false,
            changed_fields: ['reasoning_effort'],
            raw_configuration: 'PRIVATE_PROVIDER_CONFIGURATION_CANARY',
          },
        },
      }),
    )

    expect(markup).toContain(
      'Codex 0.143.0 / gpt-5.6-sol / workspace-write / network disabled',
    )
    expect(markup).toContain('on-request')
    expect(markup).toContain('reasoning effort')
    expect(markup).not.toContain('PRIVATE_PROVIDER_CONFIGURATION_CANARY')
  })

  test('shows Claude Code permission mode', () => {
    let markup = renderToStaticMarkup(
      createElement(RunContextPanel, {
        providerHistory: {
          provider: 'claude_code',
          provider_session_id: 'session-1',
          provider_environment: {
            provider: 'claude_code',
            client: 'Claude Code',
            client_version: '2.1.218',
            model: 'claude-sonnet-5',
            permission_mode: 'acceptEdits',
          },
        },
      }),
    )

    expect(markup).toContain('Permission mode')
    expect(markup).toContain('acceptEdits')
  })
})
