import fs from 'node:fs'
import { describe, expect, test } from 'vitest'

describe('agent sandbox template', () => {
  test('keeps profile.ts intentionally broken for SkillTrace experiments', () => {
    let source = fs.readFileSync(
      'agent-sandbox-repo-template/src/profile.ts',
      'utf8',
    )

    expect(source).toContain('user.nmae')
    expect(source).toContain("score, '0'")
    expect(source).not.toContain('roles: []')
    expect(source).toContain('console.log(formatUser(demoUser)')
    expect(source).not.toContain('console.log(formatUser(demoUser))')
  })
})
