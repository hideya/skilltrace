export type CsvRow = Record<string, string>

export function parseCsvObjects(text: string) {
  let rows = parseCsvRows(text)
  if (rows.length === 0) return []

  let header = rows[0].map((col) => col.trim())
  return rows
    .slice(1)
    .map(
      (cells) =>
        Object.fromEntries(
          header.map((key, index) => [key, cells[index] ?? '']),
        ) as CsvRow,
    )
}

export function parseNullable(value?: string) {
  if (value === undefined) return null
  if (value === '') return null
  return value
}

export function parseTimestampUtc(value: string) {
  let input = value.trim()
  let date = new Date(`${input.replace(' ', 'T')}Z`)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${value}`)
  }
  return date
}

export function parseIntOrNull(value?: string) {
  let text = value?.trim()
  if (!text) return null
  let num = Number(text)
  if (!Number.isFinite(num)) return null
  return num
}

export function parseMediaList(value?: string) {
  if (!value) return []
  let text = value.trim()
  if (!text || text === '{}') return []
  if (!text.startsWith('{') || !text.endsWith('}')) return [text]

  let body = text.slice(1, -1)
  if (!body) return []

  let items: string[] = []
  let current = ''
  let inQuotes = false
  let escaped = false

  for (let i = 0; i < body.length; i++) {
    let char = body[i]

    if (escaped) {
      current += char
      escaped = false
      continue
    }

    if (char === '\\' && inQuotes) {
      escaped = true
      continue
    }

    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }

    if (char === ',' && !inQuotes) {
      if (current) items.push(current)
      current = ''
      continue
    }

    current += char
  }

  if (current) items.push(current)
  return items.map((item) => item.trim()).filter(Boolean)
}

function parseCsvRows(text: string) {
  let rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    let char = text[i]

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      row.push(current)
      current = ''
      continue
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') i++
      row.push(current)
      rows.push(row)
      row = []
      current = ''
      continue
    }

    current += char
  }

  if (current !== '' || row.length) {
    row.push(current)
    rows.push(row)
  }

  return rows
}
