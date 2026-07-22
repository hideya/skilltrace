import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { compactPathLabel, Timeline } from './run-timeline-panel'

describe('compactPathLabel', () => {
  test('shows skill-relative paths for agent skill roots', () => {
    expect(compactPathLabel('.agents/skills/type-fix/SKILL.md')).toBe(
      'type-fix/SKILL.md',
    )
    expect(compactPathLabel('/repo/.claude/skills/review/SKILL.md')).toBe(
      'review/SKILL.md',
    )
  })

  test('keeps reference context under a skill root', () => {
    expect(
      compactPathLabel('.agents/skills/type-fix/references/checklist.md'),
    ).toBe('type-fix/references/checklist.md')
  })

  test('uses parent context for bare skill entrypoints', () => {
    expect(compactPathLabel('/tmp/type-fix/SKILL.md')).toBe(
      'type-fix/SKILL.md',
    )
  })

  test('does not treat legacy .skills directories as active skill roots', () => {
    expect(
      compactPathLabel('/repo/.skills/legacy/references/checklist.md'),
    ).toBe('checklist.md')
  })

  test('falls back to basename for ordinary files', () => {
    expect(compactPathLabel('/tmp/repo/README.md')).toBe('README.md')
  })
})

describe('Timeline', () => {
  test('shows the tool name above a provider execution operation', () => {
    let markup = renderToStaticMarkup(
      createElement(Timeline, {
        events: [
          {
            id: 1,
            timestamp: '2026-07-23T06:00:48.338Z',
            source: 'provider_history',
            event_type: 'execution_operation_observed',
            payload: {
              provider: 'codex',
              tool_name: 'exec_command',
              operation_kind: 'typecheck',
              outcome: 'failed',
            },
          },
        ],
      }),
    )

    expect(markup).toContain('exec_command')
    expect(markup).toContain('text-amber-600')
    expect(markup.indexOf('exec_command')).toBeLessThan(
      markup.indexOf('execution_operation_observed'),
    )
  })
})
