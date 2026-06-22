import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { Run } from './run'

const DEFAULT_SKILL_ROOTS = ['.skills']

export async function startTraceSession(input: StartTraceSessionInput) {
  let targetRoot = path.resolve(input.target_root)
  let config = loadTargetConfig(targetRoot)

  await stopTraceSession()

  let runId = buildSessionId(targetRoot, input.now ?? new Date())
  let session: TraceSession = {
    run_id: runId,
    target_root: targetRoot,
    target_name: path.basename(targetRoot),
    path_hash: pathHash(targetRoot),
    skill_roots: config.skillRoots,
    started_at: new Date().toISOString(),
  }

  state.session = session

  await Run.create({
    public_id: runId,
    name: runId,
    description: targetRoot,
    status: 'active',
    bag: {
      target_root: targetRoot,
      path_hash: session.path_hash,
      skill_roots: config.skillRoots,
    },
  })

  return session
}

export async function attachTraceSessionProbe(input: AttachProbeInput) {
  let session = state.session
  if (!session || session.run_id !== input.run_id) return undefined

  session.probe_pid = input.probe_pid
  session.probe_log_path = input.probe_log_path
  return session
}

export async function stopTraceSession() {
  let session = state.session

  if (session?.probe_pid) killProcess(session.probe_pid)
  state.session = undefined

  if (session) {
    let run = await Run.findBy({ public_id: session.run_id })
    if (run) {
      await Run.update(run.id, {
        status: 'finished',
        finished_at: new Date(),
      })
    }
  }

  return session
}

export function getTraceSession() {
  return state.session
}

export function resolveTraceSession(input: ResolveTraceSessionInput = {}) {
  let session = state.session
  if (!session) return undefined

  let targetRoot = input.target_root ? path.resolve(input.target_root) : undefined
  let targetMatch = targetRoot ? targetRoot === session.target_root : false

  return {
    ...session,
    target_match: targetMatch,
  }
}

export function buildSessionId(targetRoot: string, date = new Date()) {
  return `${safeName(path.basename(targetRoot))}-${pathHash(targetRoot)}-${timestampName(date)}`
}

export function pathHash(targetRoot: string) {
  return createHash('sha256')
    .update(path.resolve(targetRoot))
    .digest('base64url')
    .slice(0, 6)
}

export function timestampName(date = new Date()) {
  let pad = (value: number) => String(value).padStart(2, '0')
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(
    date.getSeconds(),
  )}`
}

export function loadTargetConfig(targetRoot: string) {
  let configPath = path.join(targetRoot, '.skilltrace.json')
  let config: SkillTraceConfigFile = {}

  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  }

  let skillRoots = config.skill_roots ?? config.skillRoots ?? DEFAULT_SKILL_ROOTS

  return {
    targetRoot,
    skillRoots: skillRoots.map((skillRoot) =>
      path.resolve(targetRoot, skillRoot),
    ),
  }
}

function killProcess(pid: number) {
  try {
    process.kill(-pid, 'SIGTERM')
    return
  } catch {}

  try {
    process.kill(pid, 'SIGTERM')
  } catch {}
}

function safeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'repo'
}

type TraceSessionState = {
  session?: TraceSession
}

type StartTraceSessionInput = {
  target_root: string
  now?: Date
}

type AttachProbeInput = {
  run_id: string
  probe_pid: number
  probe_log_path?: string
}

type ResolveTraceSessionInput = {
  target_root?: string
}

type TraceSession = {
  run_id: string
  target_root: string
  target_name: string
  path_hash: string
  skill_roots: string[]
  started_at: string
  probe_pid?: number
  probe_log_path?: string
}

type SkillTraceConfigFile = {
  skill_roots?: string[]
  skillRoots?: string[]
}

const STATE_KEY = Symbol.for('skilltrace.trace-session-state')
const state = ((globalThis as any)[STATE_KEY] ??= {}) as TraceSessionState
