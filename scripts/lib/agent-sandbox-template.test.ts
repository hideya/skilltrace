import fs from 'node:fs'
import { describe, expect, test } from 'vitest'

describe('type-fix demo', () => {
  test('keeps profile.ts intentionally broken for SkillTrace experiments', () => {
    let source = fs.readFileSync(
      'examples/type-fix-demo/src/profile.ts',
      'utf8',
    )

    expect(source).toContain('user.nmae')
    expect(source).toContain("score, '0'")
    expect(source).not.toContain('roles: []')
    expect(source).toContain('console.log(formatUser(demoUser)')
    expect(source).not.toContain('console.log(formatUser(demoUser))')
  })

  test('keeps Claude Code surfaces symlinked to the AGENTS.md-compatible surface', () => {
    expect(fs.readlinkSync('examples/type-fix-demo/CLAUDE.md')).toBe(
      'AGENTS.md',
    )
    expect(fs.readlinkSync('examples/type-fix-demo/.claude/skills')).toBe(
      '../.skills',
    )
  })
})
