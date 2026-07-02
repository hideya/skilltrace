export function parseMcpValue(output: string, key: string) {
  let prefix = `${key}:`.toLowerCase()
  let line = output
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.toLowerCase().startsWith(prefix))

  return line?.slice(prefix.length).trim() || null
}

export function parseGeminiCommand(output: string) {
  if (/\btraceskill-dev\b/.test(output)) return 'traceskill-dev'
  if (/\btraceskill\b/.test(output)) return 'traceskill'
  return null
}

export function parseGeminiArgs(output: string) {
  return /\bmcp\b/.test(output) ? 'mcp' : null
}
