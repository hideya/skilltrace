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
  test('offers detailed and compact timeline views', () => {
    let markup = renderToStaticMarkup(
      createElement(Timeline, {
        events: [
          {
            id: 1,
            timestamp: '2026-07-23T06:00:48.338Z',
            source: 'provider_history',
            event_type: 'provider_collection_completed',
            payload: {},
          },
        ],
      }),
    )

    expect(markup).toContain('aria-pressed="false"')
    expect(markup).toContain('aria-pressed="true"')
    expect(markup).toContain('Detailed')
    expect(markup).toContain('Compact')
  })

  test('shows event type beside compact file labels', () => {
    let markup = renderToStaticMarkup(
      createElement(Timeline, {
        events: [
          {
            id: 1,
            timestamp: '2026-07-23T06:00:48.338Z',
            source: 'passive_file_harness',
            event_type: 'skill_file_read',
            skill_path: '.agents/skills/type-fix/SKILL.md',
            payload: {},
          },
        ],
      }),
    )

    expect(markup).toContain('type-fix/')
    expect(markup).toContain('SKILL.md')
    expect(markup).toContain('skill_file_read')
    expect(markup).toContain('font-mono font-semibold text-teal-500')
    expect(markup).toContain('font-mono text-sm text-teal-500')
    expect(markup.indexOf('SKILL.md')).toBeLessThan(
      markup.indexOf('skill_file_read'),
    )
  })

  test('shows tool, operation kind, and known outcome above an operation', () => {
    let markup = renderToStaticMarkup(
      createElement(Timeline, {
        events: [
          {
            id: 1,
            timestamp: '2026-07-23T06:00:48.338Z',
            source: 'provider_history',
            event_type: 'execution_operation_observed',
            artifact_refs: ['.agents/skills/type-fix/SKILL.md'],
            payload: {
              provider: 'codex',
              tool_name: 'exec_command',
              operation_kind: 'file_read',
              outcome: 'failed',
            },
          },
        ],
      }),
    )

    expect(markup).toContain('exec_command')
    expect(markup).toContain('file_read')
    expect(markup).toContain('.agents/')
    expect(markup).toContain('type-fix/')
    expect(markup).toContain('SKILL.md')
    expect(markup).toContain('failed')
    expect(markup).toContain('text-amber-500')
    expect(markup).toContain('text-amber-500 opacity-70')
    expect(markup).toContain('font-semibold text-amber-500')
    expect(markup.indexOf('exec_command')).toBeLessThan(
      markup.indexOf('file_read'),
    )
    expect(markup.indexOf('file_read')).toBeLessThan(markup.indexOf('failed'))
    expect(markup.indexOf('file_read')).toBeLessThan(markup.indexOf('.agents/'))
    expect(markup.indexOf('.agents/')).toBeLessThan(markup.indexOf('failed'))
    expect(markup).not.toContain('execution_operation_observed')
  })

  test('shows file-edit targets but omits an unknown outcome', () => {
    let markup = renderToStaticMarkup(
      createElement(Timeline, {
        events: [
          {
            id: 1,
            timestamp: '2026-07-23T06:00:48.338Z',
            source: 'provider_history',
            event_type: 'execution_operation_observed',
            artifact_refs: ['src/profile.ts', 'src/profile.test.ts'],
            payload: {
              provider: 'codex',
              tool_name: 'exec_command',
              operation_kind: 'file_edit',
              outcome: 'unknown',
            },
          },
        ],
      }),
    )

    expect(markup).toContain('src/')
    expect(markup).toContain('profile.ts')
    expect(markup).toContain('profile.test.ts')
    expect(markup).not.toContain('text-amber-500 opacity-70">unknown')
  })
})
