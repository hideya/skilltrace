import { describe, expect, it } from 'vitest'
import {
  mcpAgents,
  parseGeminiArgs,
  parseGeminiCommand,
  parseMcpValue,
} from './skilltrace-mcp-clients'

describe('MCP client registration parsing', () => {
  it('parses Codex MCP key-value output', () => {
    let output = `
skilltrace
  enabled: true
  transport: stdio
  command: skilltrace-dev
  args: mcp serve
`

    expect(parseMcpValue(output, 'command')).toBe('skilltrace-dev')
    expect(parseMcpValue(output, 'args')).toBe('mcp serve')
    expect(mcpAgents()[0].registrationMatches(output, 'skilltrace-dev')).toBe(
      true,
    )
  })

  it('parses Claude Code output case-insensitively', () => {
    let output = `
skilltrace:
  Command: skilltrace
  Args: mcp serve
`

    expect(parseMcpValue(output, 'command')).toBe('skilltrace')
    expect(parseMcpValue(output, 'args')).toBe('mcp serve')
  })

  it('does not accept the dev command as the package command', () => {
    let output = 'command: skilltrace-dev\nargs: mcp serve'

    expect(mcpAgents()[0].registrationMatches(output, 'skilltrace')).toBe(false)
  })

  it('parses Gemini compact output', () => {
    let output = 'skilltrace: skilltrace-dev mcp serve (stdio)'

    expect(parseGeminiCommand(output)).toBe('skilltrace-dev')
    expect(parseGeminiArgs(output)).toBe('mcp serve')
    expect(mcpAgents()[2].registrationMatches(output, 'skilltrace-dev')).toBe(
      true,
    )
  })

  it('rejects old Gemini registration shapes', () => {
    expect(parseGeminiCommand('skilltrace: traceskill mcp (stdio)')).toBeNull()
    expect(parseGeminiArgs('skilltrace: skilltrace-dev mcp (stdio)')).toBe(
      'mcp',
    )
    expect(
      mcpAgents()[2].registrationMatches(
        'skilltrace: skilltrace-dev mcp (stdio)',
        'skilltrace-dev',
      ),
    ).toBe(false)
  })
})
