import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { spawnSync } from 'child_process'
import { Run } from './run'
import { TraceEvent } from './trace-event'
import { discardRunRecord } from './trace'

const DEFAULT_SKILL_ROOTS = ['.skills']
const SESSION_SOURCE = 'skilltrace_session'

export async function startTraceSession(input: StartTraceSessionInput) {
  let targetRoot = path.resolve(input.target_root)
  let instructionProfile = selectedInstructionProfile(input.instruction_profile)
  let config = loadTargetConfig(targetRoot, instructionProfile)

  if (state.session) throw new ActiveSessionError(state.session)

  let runId = buildSessionId(targetRoot, input.now ?? new Date())
  let session: TraceSession = {
    run_id: runId,
    target_root: targetRoot,
    target_name: path.basename(targetRoot),
    path_hash: pathHash(targetRoot),
    skill_roots: config.skillRoots,
    trace_mode: normalizeTraceMode(input.trace_mode),
    note: normalizedNote(input.note),
    started_at: new Date().toISOString(),
  }

  state.session = session

  let run = await Run.create({
    public_id: runId,
    name: runId,
    description: targetRoot,
    status: 'active',
    bag: {
      target_root: targetRoot,
      path_hash: session.path_hash,
      skill_roots: config.skillRoots,
      trace_mode: session.trace_mode,
      note: session.note,
      git_snapshot: input.git_snapshot,
      instruction_surfaces: input.instruction_surfaces,
      instruction_profile: input.instruction_profile,
    },
  })
  await appendSessionEvent(run.id, 'trace_session_started', session, {
    reason: 'started',
    instrumentation: input.instrumentation,
    note: session.note,
    git_snapshot: input.git_snapshot,
    instruction_surfaces: input.instruction_surfaces,
    instruction_profile: input.instruction_profile,
  })

  return session
}

export async function attachTraceSessionProbe(input: AttachProbeInput) {
  let session = state.session
  if (!session || session.run_id !== input.run_id) return undefined

  session.probe_pid = input.probe_pid
  session.probe_log_path = input.probe_log_path
  session.probe_kind = input.probe_kind ?? 'run'
  return session
}

export async function appendTraceSessionEvent(input: SessionEventInput) {
  let session = state.session
  if (!session || session.run_id !== input.run_id) return undefined

  let run = await Run.findBy({ public_id: session.run_id })
  if (!run) return undefined

  await appendSessionEvent(run.id, input.event_type, session, input.payload ?? {})
  return session
}

export async function stopTraceSession(input: StopTraceSessionInput = {}) {
  let session = state.session

  if (session?.probe_pid && session.probe_kind !== 'shared') {
    killProcess(session.probe_pid)
  }
  state.session = undefined

  if (session) {
    let run = await Run.findBy({ public_id: session.run_id })
    if (run) {
      await appendSessionEvent(run.id, 'trace_session_finished', session, {
        reason: input.reason ?? 'ended',
      })
      await Run.update(run.id, {
        status: 'finished',
        finished_at: new Date(),
      })
    }
  }

  return session
}

export async function discardTraceSession() {
  let session = await stopTraceSession({ reason: 'discarded' })
  if (!session) return null

  await discardRunRecord(session.run_id)
  return session
}

async function appendSessionEvent(
  runId: number,
  eventType: string,
  session: TraceSession,
  payload: Record<string, unknown>,
) {
  await TraceEvent.create({
    run_id: runId,
    source: SESSION_SOURCE,
    event_type: eventType,
    payload: {
      ...payload,
      run_id: session.run_id,
      target_root: session.target_root,
      target_name: session.target_name,
      path_hash: session.path_hash,
      skill_roots: session.skill_roots,
      trace_mode: session.trace_mode,
      probe_pid: session.probe_pid,
      probe_log_path: session.probe_log_path,
    },
  })
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

export function loadTargetConfig(
  targetRoot: string,
  instructionProfile: InstructionProfile = 'agents_md',
) {
  let configPath = path.join(targetRoot, '.skilltrace.json')
  let config: SkillTraceConfigFile = {}

  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  }

  let defaultSkillRoots = instructionProfile === 'claude_code'
    ? ['.claude/skills']
    : DEFAULT_SKILL_ROOTS
  let skillRoots = config.skill_roots ?? config.skillRoots ?? defaultSkillRoots

  return {
    targetRoot,
    skillRoots: skillRoots.map((skillRoot) =>
      path.resolve(targetRoot, skillRoot),
    ),
  }
}

function selectedInstructionProfile(
  value?: Record<string, unknown>,
): InstructionProfile {
  return value?.selected === 'claude_code' ? 'claude_code' : 'agents_md'
}

function killProcess(pid: number) {
  killProcessTree(pid, 'SIGTERM')

  try {
    process.kill(-pid, 'SIGTERM')
    return
  } catch {}

  try {
    process.kill(pid, 'SIGTERM')
  } catch {}
}

function killProcessTree(pid: number, signal: NodeJS.Signals) {
  for (let childPid of childPids(pid)) {
    killProcessTree(childPid, signal)
  }

  try {
    process.kill(pid, signal)
  } catch {}
}

function childPids(pid: number) {
  let result = spawnSync('pgrep', ['-P', String(pid)], {
    encoding: 'utf8',
  })

  if (result.status !== 0) return []

  return result.stdout
    .split('\n')
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0)
}

function safeName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'repo'
}

export function normalizeTraceMode(value?: unknown): TraceMode {
  if (
    value === 'full' ||
    value === 'passive_reflection' ||
    value === 'passive_only'
  ) {
    return value
  }

  return 'full'
}

type TraceSessionState = {
  session?: TraceSession
}

type StartTraceSessionInput = {
  target_root: string
  instrumentation?: Record<string, unknown>
  instruction_surfaces?: Record<string, unknown>
  instruction_profile?: Record<string, unknown>
  git_snapshot?: Record<string, unknown>
  trace_mode?: unknown
  note?: unknown
  now?: Date
}

type StopTraceSessionInput = {
  reason?: 'ended' | 'replaced' | 'discarded'
}

type AttachProbeInput = {
  run_id: string
  probe_pid: number
  probe_log_path?: string
  probe_kind?: ProbeKind
}

type SessionEventInput = {
  run_id: string
  event_type: string
  payload?: Record<string, unknown>
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
  trace_mode: TraceMode
  note?: string
  started_at: string
  probe_pid?: number
  probe_log_path?: string
  probe_kind?: ProbeKind
}

type SkillTraceConfigFile = {
  skill_roots?: string[]
  skillRoots?: string[]
}

type ProbeKind = 'run' | 'shared'
type InstructionProfile = 'agents_md' | 'claude_code'
export type TraceMode = 'full' | 'passive_reflection' | 'passive_only'

function normalizedNote(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const STATE_KEY = Symbol.for('skilltrace.trace-session-state')
const state = ((globalThis as any)[STATE_KEY] ??= {}) as TraceSessionState

export class ActiveSessionError extends Error {
  session: TraceSession

  constructor(session: TraceSession) {
    super('SkillTrace session is already active')
    this.session = session
  }
}
