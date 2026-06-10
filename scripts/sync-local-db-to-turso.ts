import fs from 'fs'
import path from 'path'
import { createInterface } from 'readline/promises'
import { stdin as input, stdout as output } from 'process'
import { createClient } from '@libsql/client'
import { dbPath } from '../app/config/.server/db'
import { parseEnv } from './lib/env'

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env')
const INSERT_BATCH_SIZE = 200
const CONFIRM_TEXT = 'sync local db to turso'

async function getSchema(db: any) {
  let result = await db.execute(`
    select m.rowid, m.type, m.name, m.tbl_name, m.sql
    from sqlite_master m
    left join pragma_table_list p
      on m.type = 'table'
      and p.schema = 'main'
      and p.name = m.name
    where m.sql is not null
      and m.type in ('table', 'index', 'trigger', 'view')
      and m.name not like 'sqlite_%'
      and coalesce(p.type, '') <> 'shadow'
    order by
      case m.type
        when 'table' then 0
        when 'index' then 1
        when 'view' then 2
        else 3
      end,
      m.rowid
  `)

  return result.rows.map((row: any) => ({
    type: row.type,
    name: row.name,
    tableName: row.tbl_name,
    sql: row.sql,
  })) as SchemaRow[]
}

async function orderTablesByDependencies(db: any, tables: SchemaRow[]) {
  let names = new Set(tables.map((table) => table.name))
  let tablesByName = new Map(tables.map((table) => [table.name, table]))
  let dependencies = new Map<string, string[]>()

  for (let table of tables) {
    let result = await db.execute({
      sql: 'select "table" as name from pragma_foreign_key_list(?)',
      args: [table.name],
    })
    let tableDependencies = result.rows
      .map((row: any) => String(row.name))
      .filter((name: string) => names.has(name))

    dependencies.set(table.name, tableDependencies)
  }

  let ordered: SchemaRow[] = []
  let visited = new Set<string>()
  let visiting = new Set<string>()

  for (let table of tables) {
    visitTable(
      table.name,
      tablesByName,
      dependencies,
      visited,
      visiting,
      ordered,
    )
  }

  return ordered
}

function visitTable(
  name: string,
  tablesByName: Map<string, SchemaRow>,
  dependencies: Map<string, string[]>,
  visited: Set<string>,
  visiting: Set<string>,
  ordered: SchemaRow[],
) {
  if (visited.has(name)) return
  if (visiting.has(name)) return

  visiting.add(name)

  for (let dependency of dependencies.get(name) ?? []) {
    visitTable(
      dependency,
      tablesByName,
      dependencies,
      visited,
      visiting,
      ordered,
    )
  }

  visiting.delete(name)
  visited.add(name)

  let table = tablesByName.get(name)
  if (table) ordered.push(table)
}

async function createStageTables(
  remoteDb: any,
  tables: SchemaRow[],
  stageNames: Map<string, string>,
) {
  for (let table of tables) {
    let ddl = rewriteCreateTable(
      table.sql,
      stageNames.get(table.name)!,
      stageNames,
    )
    await remoteDb.execute(ddl)
  }
}

async function copyTable(
  localDb: any,
  remoteDb: any,
  table: SchemaRow,
  stageName: string,
) {
  let columnResult = await localDb.execute({
    sql: 'select name from pragma_table_info(?) order by cid',
    args: [table.name],
  })
  let columns = columnResult.rows.map((row: any) => String(row.name))

  if (columns.length === 0) {
    console.log(`${table.name}: 0 rows`)
    return
  }

  let names = columns.map(quoteIdentifier).join(', ')
  let placeholders = columns.map(() => '?').join(', ')
  let selectSql = `select ${names} from ${quoteIdentifier(table.name)} limit ? offset ?`
  let insertSql = `insert into ${quoteIdentifier(stageName)} (${names}) values (${placeholders})`
  let offset = 0

  while (true) {
    let result = await localDb.execute({
      sql: selectSql,
      args: [INSERT_BATCH_SIZE, offset],
    })

    if (result.rows.length === 0) break

    let inserts = result.rows.map((row: any) => ({
      sql: insertSql,
      args: columns.map((_, index) => row[index]),
    }))
    await remoteDb.batch(inserts, 'write')

    offset += result.rows.length
    if (result.rows.length < INSERT_BATCH_SIZE) break
  }

  console.log(`${table.name}: ${offset} rows`)
}

async function swapStageIntoPlace(
  remoteDb: any,
  localSchema: SchemaRow[],
  remoteSchema: SchemaRow[],
  orderedTables: SchemaRow[],
  stageNames: Map<string, string>,
  backupNames: Map<string, string>,
) {
  let localTableNames = new Set(orderedTables.map((table) => table.name))
  let remoteTableNames = new Set(
    remoteSchema
      .filter((item) => item.type === 'table')
      .map((item) => item.name),
  )
  let localObjectNames = new Set(
    localSchema
      .filter((item) => item.type !== 'table')
      .map((item) => item.name),
  )
  let remoteObjectsToDrop = remoteSchema.filter(
    (item) =>
      item.type !== 'table' &&
      (localObjectNames.has(item.name) || localTableNames.has(item.tableName)),
  )
  let statements: string[] = []

  for (let item of remoteObjectsToDrop.reverse()) {
    statements.push(dropObjectSql(item))
  }

  for (let table of orderedTables) {
    if (!remoteTableNames.has(table.name)) continue

    statements.push(
      `create table ${quoteIdentifier(backupNames.get(table.name)!)} as select * from ${quoteIdentifier(table.name)}`,
    )
  }

  for (let table of [...orderedTables].reverse()) {
    if (!remoteTableNames.has(table.name)) continue

    statements.push(`drop table ${quoteIdentifier(table.name)}`)
  }

  for (let table of orderedTables) {
    statements.push(
      `alter table ${quoteIdentifier(stageNames.get(table.name)!)} rename to ${quoteIdentifier(table.name)}`,
    )
  }

  for (let item of localSchema.filter((item) => item.type !== 'table')) {
    statements.push(item.sql)
  }

  await runWriteScript(remoteDb, statements)
}

async function runWriteScript(remoteDb: any, statements: string[]) {
  let sql = [
    'pragma foreign_keys = off',
    'begin immediate',
    ...statements,
    'commit',
    'pragma foreign_keys = on',
  ].join(';\n')

  try {
    await remoteDb.executeMultiple(`${sql};`)
  } catch (error) {
    await remoteDb
      .executeMultiple('rollback; pragma foreign_keys = on;')
      .catch(() => {})
    throw error
  }
}

async function cleanupStageTables(
  remoteDb: any,
  orderedTables: SchemaRow[],
  stageNames: Map<string, string>,
) {
  let statements = [...orderedTables]
    .reverse()
    .map(
      (table) =>
        `drop table if exists ${quoteIdentifier(stageNames.get(table.name)!)}`,
    )

  await runWriteScript(remoteDb, statements).catch(() => {})
}

function rewriteCreateTable(
  sql: string,
  newName: string,
  tableNames: Map<string, string>,
) {
  let ddl = sql.replace(
    /^(create\s+table\s+(?:if\s+not\s+exists\s+)?)(?:"[^"]+"|`[^`]+`|\[[^\]]+\]|[^\s(]+)/i,
    `$1${quoteIdentifier(newName)}`,
  )

  for (let [from, to] of tableNames) {
    let pattern = new RegExp(
      `(references\\s+)${identifierPattern(from)}(?=\\s*\\(|\\s|$)`,
      'gi',
    )
    ddl = ddl.replace(pattern, `$1${quoteIdentifier(to)}`)
  }

  return ddl
}

function identifierPattern(value: string) {
  return `(?:"${escapeRegExp(value.replaceAll('"', '""'))}"|\`${escapeRegExp(value.replaceAll('`', '``'))}\`|\\[${escapeRegExp(value.replaceAll(']', ']]'))}\\]|${escapeRegExp(value)})`
}

function dropObjectSql(item: SchemaRow) {
  if (item.type === 'index')
    return `drop index if exists ${quoteIdentifier(item.name)}`
  if (item.type === 'trigger') {
    return `drop trigger if exists ${quoteIdentifier(item.name)}`
  }

  return `drop view if exists ${quoteIdentifier(item.name)}`
}

function quoteIdentifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function timestamp() {
  return new Date()
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace('.', '_')
}

async function confirmSync(dbUrl: string) {
  console.log('This will replace Turso tables with data from the local DB.')
  console.log(`Local DB: ${dbPath}`)
  console.log(`Turso DB: ${dbUrl}`)
  console.log('Backup tables will be left in Turso after the swap.')

  let reader = createInterface({ input, output })

  try {
    let answer = await reader.question(
      `Type "${CONFIRM_TEXT}" to continue: `,
    )

    if (answer.trim() !== CONFIRM_TEXT) {
      throw new Error('Sync cancelled')
    }
  } finally {
    reader.close()
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

  await confirmSync(dbUrl)

  let id = timestamp()
  let localDb = createClient({ url: `file:${dbPath}` })
  let remoteDb = createClient({ url: dbUrl, authToken: dbAuthToken })

  try {
    let localSchema = await getSchema(localDb)
    let localTables = localSchema.filter((item) => item.type === 'table')
    let orderedTables = await orderTablesByDependencies(localDb, localTables)
    let stageNames = new Map(
      orderedTables.map((table) => [
        table.name,
        `__sync_stage_${id}_${table.name}`,
      ]),
    )
    let backupNames = new Map(
      orderedTables.map((table) => [
        table.name,
        `__sync_backup_${id}_${table.name}`,
      ]),
    )

    if (orderedTables.length === 0) {
      throw new Error('Local DB has no tables to sync')
    }

    console.log('Creating Turso staging tables...')
    await createStageTables(remoteDb, orderedTables, stageNames)

    try {
      console.log('\nCopying local -> Turso staging tables...')
      for (let table of orderedTables) {
        await copyTable(localDb, remoteDb, table, stageNames.get(table.name)!)
      }

      let remoteSchema = await getSchema(remoteDb)
      console.log(
        '\nBacking up current Turso tables and swapping staging in...',
      )
      await swapStageIntoPlace(
        remoteDb,
        localSchema,
        remoteSchema,
        orderedTables,
        stageNames,
        backupNames,
      )

      let foreignKeyErrors = await remoteDb.execute('pragma foreign_key_check')
      if (foreignKeyErrors.rows.length > 0) {
        throw new Error(
          `Turso foreign key check found ${foreignKeyErrors.rows.length} error(s) after sync`,
        )
      }

      console.log('\nTurso sync complete')
      console.log('Backup tables left in Turso:')
      for (let table of orderedTables) {
        console.log(`- ${backupNames.get(table.name)}`)
      }
    } catch (error) {
      await cleanupStageTables(remoteDb, orderedTables, stageNames)
      throw error
    }
  } finally {
    localDb.close()
    remoteDb.close()
  }
}

await main()

type SchemaRow = {
  type: 'table' | 'index' | 'trigger' | 'view'
  name: string
  tableName: string
  sql: string
}
