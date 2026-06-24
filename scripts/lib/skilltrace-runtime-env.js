import fs from 'fs'
import os from 'os'
import path from 'path'

process.env.NODE_ENV = process.env.NODE_ENV || 'production'
process.env.SKILLTRACE_DATA_DIR =
  process.env.SKILLTRACE_DATA_DIR || path.join(os.homedir(), '.skilltrace')
process.env.COOKIE_SECRET =
  process.env.COOKIE_SECRET || 'skilltrace-local-only-cookie-secret-v0'

fs.mkdirSync(path.join(process.env.SKILLTRACE_DATA_DIR, 'local'), { recursive: true })
