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
  command: traceskill-dev
  args: mcp
  cwd: -
  env: -
  remove: codex mcp remove skilltrace
`

    expect(parseMcpValue(output, 'command')).toBe('traceskill-dev')
    expect(parseMcpValue(output, 'args')).toBe('mcp')
  })

  it('parses Claude Code MCP key-value output case-insensitively', () => {
    let output = `
skilltrace:
  Scope: User config (available in all your projects)
  Status: OK Connected
  Type: stdio
  Command: traceskill
  Args: mcp
  Environment:
`

    expect(parseMcpValue(output, 'command')).toBe('traceskill')
    expect(parseMcpValue(output, 'args')).toBe('mcp')
  })

  it('parses Gemini CLI compact MCP list output', () => {
    let output = `
Configured MCP servers:

✓ skilltrace: skilltrace-dev mcp (stdio) - Connected
`

    expect(parseGeminiCommand(output)).toBe('skilltrace-dev')
    expect(parseGeminiArgs(output)).toBe('mcp')
  })

  it('prefers dev command names when parsing Gemini output', () => {
    let output = 'skilltrace: skilltrace-dev mcp (stdio)'

    expect(parseGeminiCommand(output)).toBe('skilltrace-dev')
  })

  it('parses the existing traceskill alias in Gemini output', () => {
    let output = 'skilltrace: traceskill mcp (stdio)'

    expect(parseGeminiCommand(output)).toBe('traceskill')
  })

  it('returns null when expected values are absent', () => {
    expect(parseMcpValue('skilltrace enabled', 'command')).toBeNull()
    expect(parseGeminiCommand('Configured MCP servers:')).toBeNull()
    expect(parseGeminiArgs('Configured MCP servers:')).toBeNull()
  })
})
