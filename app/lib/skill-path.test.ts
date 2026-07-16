import { describe, expect, test } from 'vitest'
import { skillDirectoryKey, skillPathFromRoot } from './skill-path'

describe('skill paths', () => {
  test('recognizes supported Agent Skills roots', () => {
    expect(skillPathFromRoot('/repo/.agents/skills/review/SKILL.md')).toBe(
      'review/SKILL.md',
    )
    expect(
      skillPathFromRoot('/repo/.claude/skills/review/SKILL.md', true),
    ).toBe('.claude/skills/review/SKILL.md')
  })

  test('does not recognize the legacy .skills root', () => {
    expect(skillPathFromRoot('/repo/.skills/review/SKILL.md')).toBeNull()
    expect(skillDirectoryKey('/repo/.skills/review/SKILL.md')).toBeNull()
  })

  test('associates generic fixture skill and reference paths', () => {
    expect(skillDirectoryKey('fixtures/skills/review/SKILL.md')).toBe(
      'fixtures/skills/review',
    )
    expect(
      skillDirectoryKey('fixtures/skills/review/references/checklist.md'),
    ).toBe('fixtures/skills/review')
  })
})
