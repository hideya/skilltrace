import { describe, expect, it } from 'vitest'
import {
  parseGeminiArgs,
  parseGeminiCommand,
  parseMcpValue,
} from './diagnostics-mcp'

describe('diagnostics MCP output parsing', () => {
  it('parses Codex MCP key-value output', () => {
    let output = `
skilltrace
  enabled: true
  transport: stdio
  command: skilltrace-dev
  args: mcp serve
  cwd: -
  env: -
  remove: codex mcp remove skilltrace
`

    expect(parseMcpValue(output, 'command')).toBe('skilltrace-dev')
    expect(parseMcpValue(output, 'args')).toBe('mcp serve')
  })

  it('parses Claude Code MCP key-value output case-insensitively', () => {
    let output = `
skilltrace:
  Scope: User config (available in all your projects)
  Status: OK Connected
  Type: stdio
  Command: skilltrace
  Args: mcp serve
  Environment:
`

    expect(parseMcpValue(output, 'command')).toBe('skilltrace')
    expect(parseMcpValue(output, 'args')).toBe('mcp serve')
  })

  it('parses Gemini CLI compact MCP list output', () => {
    let output = `
Configured MCP servers:

✓ skilltrace: skilltrace-dev mcp serve (stdio) - Connected
`

    expect(parseGeminiCommand(output)).toBe('skilltrace-dev')
    expect(parseGeminiArgs(output)).toBe('mcp serve')
  })

  it('prefers dev command names when parsing Gemini output', () => {
    let output = 'skilltrace: skilltrace-dev mcp serve (stdio)'

    expect(parseGeminiCommand(output)).toBe('skilltrace-dev')
  })

  it('ignores old Gemini alias output', () => {
    let output = 'skilltrace: traceskill mcp (stdio)'

    expect(parseGeminiCommand(output)).toBeNull()
  })

  it('parses old Gemini MCP args as a stale registration shape', () => {
    let output = 'skilltrace: skilltrace-dev mcp (stdio)'

    expect(parseGeminiArgs(output)).toBe('mcp')
  })

  it('returns null when expected values are absent', () => {
    expect(parseMcpValue('skilltrace enabled', 'command')).toBeNull()
    expect(parseGeminiCommand('Configured MCP servers:')).toBeNull()
    expect(parseGeminiArgs('Configured MCP servers:')).toBeNull()
  })
})
