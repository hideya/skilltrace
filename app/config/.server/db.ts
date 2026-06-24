import path from 'path'

const dbName = 'local/dev.db'
const dataDir = process.env.SKILLTRACE_DATA_DIR
  ? path.resolve(process.env.SKILLTRACE_DATA_DIR)
  : path.join(process.cwd(), 'data')

export const dbPath = path.join(dataDir, dbName)

const isProd = process.env.NODE_ENV === 'production' && !!process.env.DB_URL

export const dbCredentials = isProd
  ? { url: process.env.DB_URL!, authToken: process.env.DB_AUTH_TOKEN! }
  : { url: `file:${dbPath}` }
