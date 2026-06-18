import fs from 'fs'
import path from 'path'

export const DEFAULT_SESSION_FILE = path.join(
  process.cwd(),
  'data/local/skilltrace-session.json',
)

export function sessionFilePath(env: SkillTraceSessionEnv) {
  return env.sessionFile || DEFAULT_SESSION_FILE
}

export function readActiveSession(filePath = DEFAULT_SESSION_FILE) {
  if (!fs.existsSync(filePath)) return undefined

  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as SkillTraceSession
}

export function writeActiveSession(
  session: SkillTraceSession,
  filePath = DEFAULT_SESSION_FILE,
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(session, null, 2)}\n`)
}

export function removeActiveSession(filePath = DEFAULT_SESSION_FILE) {
  fs.rmSync(filePath, { force: true })
}

export type SkillTraceSessionEnv = {
  sessionFile?: string
}

export type SkillTraceSession = {
  run_id: string
  server: string
  target_root: string
  skill_roots: string[]
  started_at: string
}
