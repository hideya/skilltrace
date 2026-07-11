import { describe, expect, test } from 'vitest'
import { compactPathLabel } from './run-timeline-panel'

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
