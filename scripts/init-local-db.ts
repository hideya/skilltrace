import fs from 'fs'
import path from 'path'
import { createClient } from '@libsql/client'
import { dbPath } from '../app/config/.server/db'

const STATEMENTS = [
  `create table if not exists runs (
    id integer primary key autoincrement not null,
    public_id text not null,
    user_id integer,
    name text,
    description text,
    status text not null default 'active',
    started_at text not null default (CURRENT_TIMESTAMP),
    finished_at text,
    bag text,
    created_at text not null default (CURRENT_TIMESTAMP),
    updated_at text not null default (CURRENT_TIMESTAMP),
    foreign key (user_id) references users(id) on update no action on delete cascade
  )`,
  `create unique index if not exists runs_public_id_unique on runs(public_id)`,
  `create index if not exists runs_user_id_index on runs(user_id)`,
  `create index if not exists runs_created_at_index on runs(created_at)`,
  `create index if not exists runs_status_index on runs(status)`,

  `create table if not exists trace_events (
    id integer primary key autoincrement not null,
    public_id text not null,
    run_id integer not null,
    timestamp text not null default (CURRENT_TIMESTAMP),
    source text not null,
    event_type text not null,
    skill_name text,
    skill_version text,
    skill_path text,
    skill_file_hash text,
    artifact_refs text,
    payload text,
    created_at text not null default (CURRENT_TIMESTAMP),
    updated_at text not null default (CURRENT_TIMESTAMP),
    foreign key (run_id) references runs(id) on update no action on delete cascade
  )`,
  `create unique index if not exists trace_events_public_id_unique on trace_events(public_id)`,
  `create index if not exists trace_events_run_id_index on trace_events(run_id)`,
  `create index if not exists trace_events_timestamp_index on trace_events(timestamp)`,
  `create index if not exists trace_events_event_type_index on trace_events(event_type)`,
  `create index if not exists trace_events_skill_name_index on trace_events(skill_name)`,
]

async function main() {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  let db = createClient({ url: `file:${dbPath}` })

  try {
    await assertUsersTable(db)
    await db.execute('pragma foreign_keys = on')

    for (let statement of STATEMENTS) {
      await db.execute(statement)
    }

    console.log(`Initialized SkillTrace tables in ${dbPath}`)
  } finally {
    db.close()
  }
}

async function assertUsersTable(db: any) {
  let result = await db.execute({
    sql: `
      select name
      from sqlite_master
      where type = 'table'
        and name = ?
    `,
    args: ['users'],
  })

  if (result.rows.length === 0) {
    throw new Error(`Missing users table in ${dbPath}`)
  }
}

await main()
