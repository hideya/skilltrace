import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { ConsistencyPanel } from './run-consistency-panel'

describe('ConsistencyPanel', () => {
  test('labels provider observations as advisory', () => {
    let markup = renderPanel({
      provider: true,
      status: 'pass',
    })

    expect(markup).toContain('Advisory only')
    expect(markup).toContain('tooltip tooltip-bottom tooltip-end')
    expect(markup).toContain('font-normal')
    expect(markup).toContain('before:w-48')
    expect(markup).toContain('tabindex="0"')
    expect(markup).toContain('Observed in provider history')
    expect(markup).toContain('bg-amber-400')
  })

  test('distinguishes an absent observation from unavailable history', () => {
    let collected = renderPanel(
      { provider: false, status: 'pass' },
      'collected',
    )
    let unavailable = renderPanel(
      { provider: false, status: 'pass' },
      'unavailable',
    )

    expect(collected).toContain('Not observed in provider history')
    expect(unavailable).toContain('Provider history unavailable')
  })

  test('shows provider-only rows as not evaluated', () => {
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
