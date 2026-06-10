import fs from 'fs'
import path from 'path'
import { createClient } from '@libsql/client'
import { dbPath } from '../app/config/.server/db'
import { parseEnv } from './lib/env'

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env')
const BACKUP_DIR = path.join(path.dirname(dbPath), 'backups')

async function backupLocalDb() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true })

  let timestamp = new Date().toISOString().replaceAll(':', '-')
  let backupPath = path.join(BACKUP_DIR, `dev-${timestamp}.db`)
  let localDb = createClient({ url: `file:${dbPath}` })

  try {
    await localDb.execute(`vacuum into ${quoteString(backupPath)}`)
  } finally {
    localDb.close()
  }

  return backupPath
}

async function pullTurso(
  dbUrl: string,
  dbAuthToken: string,
  outputPath: string,
) {
  let replicaPath = `${outputPath}.replica`
  removeReplica(replicaPath)

  try {
    let replica = createClient({
      url: `file:${replicaPath}`,
      syncUrl: dbUrl,
      authToken: dbAuthToken,
    })

    try {
      let result = await replica.sync()
      let tables = await replica.execute(`
        select count(*) as count
        from sqlite_master
        where type = 'table'
          and name not like 'sqlite_%'
      `)

      console.log(`Downloaded ${result?.frames_synced ?? 0} Turso frames`)
      console.log(`Local replica contains ${tables.rows[0]?.count ?? 0} tables`)

      await replica.execute(`vacuum into ${quoteString(outputPath)}`)
    } finally {
      replica.close()
    }
  } finally {
    removeReplica(replicaPath)
  }
}

function quoteString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function removeReplica(replicaPath: string) {
  for (let suffix of ['', '-info', '-shm', '-wal']) {
    let filePath = `${replicaPath}${suffix}`
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }
}

async function main() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`Missing ${ENV_PATH}`)
  }
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Local DB not found: ${dbPath}`)
  }

  let env = parseEnv(ENV_PATH)
  let dbUrl = env.DB_URL?.trim()
  let dbAuthToken = env.DB_AUTH_TOKEN?.trim()
  if (!dbUrl || !dbAuthToken) {
    throw new Error('Missing DB_URL or DB_AUTH_TOKEN in .env')
  }

  let tempPath = `${dbPath}.turso-pull-${process.pid}.tmp`
  if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)

  try {
    console.log('Backing up local DB...')
    let backupPath = await backupLocalDb()
    console.log(`Backup created: ${backupPath}`)

    console.log('\nPulling Turso into a temporary local replica...')
    await pullTurso(dbUrl, dbAuthToken, tempPath)

    fs.renameSync(tempPath, dbPath)
    console.log(`\nTurso pull complete: ${dbPath}`)
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
  }
}

await main()
