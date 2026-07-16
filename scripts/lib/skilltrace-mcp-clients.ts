const MCP_ARGS = 'mcp serve'

export function expectedMcpServerCommand(devMode = false) {
  return devMode ? 'skilltrace-dev' : 'skilltrace'
}

export function expectedMcpServerArgs() {
  return MCP_ARGS
}

export function mcpAgents() {
  return [
    {
      key: 'codex',
      name: 'Codex CLI',
      command: 'codex',
      statusArgs: ['mcp', 'get', 'skilltrace'],
      uninstallArgs: ['mcp', 'remove', 'skilltrace'],
      installArgs: (serverCommand: string) => [
        'mcp',
        'add',
        'skilltrace',
        '--',
        serverCommand,
        'mcp',
        'serve',
      ],
      registration: keyValueRegistration,
      registrationMatches: keyValueRegistrationMatches,
    },
    {
      key: 'claude',
      name: 'Claude Code',
      command: 'claude',
      statusArgs: ['mcp', 'get', 'skilltrace'],
      uninstallArgs: ['mcp', 'remove', 'skilltrace', '-s', 'user'],
      removeBeforeInstall: true,
      installArgs: (serverCommand: string) => [
        'mcp',
        'add',
        'skilltrace',
        '--scope',
        'user',
        '--',
        serverCommand,
        'mcp',
        'serve',
      ],
      registration: keyValueRegistration,
      registrationMatches: keyValueRegistrationMatches,
    },
    {
      key: 'gemini',
      name: 'Gemini CLI',
      command: 'gemini',
      statusArgs: ['mcp', 'list'],
      uninstallArgs: ['mcp', 'remove', 'skilltrace', '--scope', 'user'],
      installArgs: (serverCommand: string) => [
        'mcp',
        'add',
        'skilltrace',
        serverCommand,
        'mcp',
        'serve',
        '--scope',
        'user',
      ],
      registration: geminiRegistration,
      registrationMatches: geminiRegistrationMatches,
    },
  ] satisfies McpAgent[]
}

export function parseMcpValue(output: string, key: string) {
  let prefix = `${key}:`.toLowerCase()
  let line = output
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith(prefix))

  return line?.slice(prefix.length).trim() || null
}

export function parseGeminiCommand(output: string) {
  let match = output.match(/\bskilltrace:\s+(skilltrace-dev|skilltrace)\b/i)
  return match?.[1] ?? null
}

export function parseGeminiArgs(output: string) {
  if (/\bmcp serve\b/.test(output)) return MCP_ARGS
  if (/\bmcp\b/.test(output)) return 'mcp'
  return null
}

function keyValueRegistration(output: string) {
  return {
    registered: true,
    command: parseMcpValue(output, 'command'),
    args: parseMcpValue(output, 'args'),
  }
}

function keyValueRegistrationMatches(output: string, serverCommand: string) {
  let registration = keyValueRegistration(output)
  return (
    registration.command === serverCommand && registration.args === MCP_ARGS
  )
}

function geminiRegistration(output: string) {
  return {
    registered: /\bskilltrace\b/i.test(output),
    command: parseMcpValue(output, 'command') ?? parseGeminiCommand(output),
    args: parseMcpValue(output, 'args') ?? parseGeminiArgs(output),
  }
}

function geminiRegistrationMatches(output: string, serverCommand: string) {
  let registration = geminiRegistration(output)
  return (
    registration.registered &&
    registration.command === serverCommand &&
    (registration.args === MCP_ARGS || /\bmcp serve\b/.test(output))
  )
}

export type McpRegistration = {
  registered: boolean
  command: string | null
  args: string | null
}

export type McpAgent = {
  key: string
  name: string
  command: string
  statusArgs: string[]
  uninstallArgs: string[]
  installArgs: (serverCommand: string) => string[]
  removeBeforeInstall?: boolean
  registration: (output: string) => McpRegistration
  registrationMatches: (output: string, serverCommand: string) => boolean
}
