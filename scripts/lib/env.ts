import fs from 'fs'

export function parseEnv(filePath: string) {
  let content = fs.readFileSync(filePath, 'utf8')
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        let index = line.indexOf('=')
        if (index === -1) return [line, '']
        let key = line.slice(0, index).trim()
        let value = line.slice(index + 1).trim()
        if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1)
        }
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1)
        }
        value = value.replace(/\s+#.*$/, '').trim()
        return [key, value]
      }),
  ) as Record<string, string>
}
