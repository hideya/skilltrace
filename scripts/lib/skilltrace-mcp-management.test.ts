import { describe, expect, test } from 'vitest'
import {
  expectedMcpServerCommand,
  mcpRegistrationMatches,
} from './skilltrace-mcp-management'

describe('MCP registration management', () => {
  test('selects the expected server command by mode', () => {
    expect(expectedMcpServerCommand(false)).toBe('skilltrace')
    expect(expectedMcpServerCommand(true)).toBe('skilltrace-dev')
  })

  test('matches Codex registration output', () => {
    let output = `
skilltrace
  enabled: true
  transport: stdio
  command: skilltrace-dev
  args: mcp serve
`

    expect(mcpRegistrationMatches('codex', output, 'skilltrace-dev')).toBe(true)
    expect(mcpRegistrationMatches('codex', output, 'skilltrace')).toBe(false)
  })

  test('matches Claude Code registration output', () => {
    let output = `
skilltrace:
  Scope: User config
  Status: Connected
  Command: skilltrace
  Args: mcp serve
`

    expect(mcpRegistrationMatches('claude', output, 'skilltrace')).toBe(true)
    expect(mcpRegistrationMatches('claude', output, 'skilltrace-dev')).toBe(false)
  })

  test('matches Gemini CLI registration output', () => {
    let output = 'skilltrace: skilltrace-dev mcp serve (stdio)'

    expect(mcpRegistrationMatches('gemini', output, 'skilltrace-dev')).toBe(true)
    expect(mcpRegistrationMatches('gemini', output, 'skilltrace')).toBe(false)
  })

  test('does not match unknown agent keys', () => {
    expect(mcpRegistrationMatches('unknown', 'skilltrace mcp serve', 'skilltrace')).toBe(false)
  })
})
