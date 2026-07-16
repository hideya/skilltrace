import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export function skilltraceVersion() {
  let dir = path.dirname(fileURLToPath(import.meta.url))

  while (true) {
    let filePath = path.join(dir, 'package.json')
    if (fs.existsSync(filePath)) {
      let json = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      if (json.name === 'skilltrace' && typeof json.version === 'string') {
        return json.version
      }
    }

    let parent = path.dirname(dir)
    if (parent === dir) return 'unknown'
    dir = parent
  }
}
