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
  if (match) return match[1]

  return null
}

export function parseGeminiArgs(output: string) {
  return /\bmcp\b/.test(output) ? 'mcp' : null
}
