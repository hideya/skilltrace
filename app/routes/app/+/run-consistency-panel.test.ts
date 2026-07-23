import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { ConsistencyPanel } from './run-consistency-panel'

describe('ConsistencyPanel', () => {
  test('labels execution-log observations as advisory', () => {
    let markup = renderPanel({
      provider: true,
      status: 'pass',
    })

    expect(markup).toContain('Advisory only')
    expect(markup).toContain('Agent log')
    expect(markup).toContain('tooltip tooltip-bottom tooltip-end')
    expect(markup).toContain('font-normal')
    expect(markup).toContain('before:w-48')
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('Observed in agent execution logs')
    expect(markup).toContain('bg-amber-400')
  })

  test('distinguishes an absent observation from unavailable execution logs', () => {
    let collected = renderPanel(
      { provider: false, status: 'pass' },
      'collected',
    )
    let unavailable = renderPanel(
      { provider: false, status: 'pass' },
      'unavailable',
    )

    expect(collected).toContain('Not observed in agent execution logs')
    expect(unavailable).toContain('Agent execution logs unavailable')
  })

  test('distinguishes matching context-only operations from positive evidence', () => {
    let context = renderPanel({
      provider: false,
      provider_context: true,
      status: 'pass',
    })
    let positive = renderPanel({
      provider: true,
      provider_context: true,
      status: 'pass',
    })

    expect(context).toContain('Matching context-only execution-log operation')
    expect(context).toContain('border-2 border-amber-400')
    expect(context).not.toContain('Observed in agent execution logs')
    expect(positive).toContain('Observed in agent execution logs')
    expect(positive).toContain('bg-amber-400')
  })

  test('shows execution-log-only rows as not evaluated', () => {
    let markup = renderPanel({
      provider: true,
      passive: false,
      semantic: false,
      reflection: false,
      passive_expected: false,
      semantic_expected: false,
      reflection_expected: false,
      status: 'provider_only',
    })

    expect(markup).toContain('not evaluated')
    expect(markup).not.toContain('badge-warning')
    expect(markup).not.toContain('badge-error')
  })
})

function renderPanel(
  row: Record<string, any>,
  providerStatus = 'collected',
) {
  return renderToStaticMarkup(
    createElement(ConsistencyPanel, {
      providerHistory: { status: providerStatus },
      rows: [
        {
          kind: 'Skill',
          file: '.agents/skills/type-fix/SKILL.md',
          passive: true,
          semantic: true,
          semantic_state: 'complete',
          reflection: true,
          provider: false,
          provider_context: false,
          passive_expected: true,
          semantic_expected: true,
          reflection_expected: true,
          status: 'pass',
          ...row,
        },
      ],
      traceMode: 'full',
    }),
  )
}
