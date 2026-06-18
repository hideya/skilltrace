import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { Run } from './run'
import { appendPassiveEvent } from './trace'

const DEFAULT_SKILL_ROOTS = ['.skills']

export async function startTraceSession(input: StartTraceSessionInput) {
  let targetRoot = path.resolve(input.target_root)
  let config = loadTargetConfig(targetRoot)

  assertMacOpenSnoopReady()
  await stopTraceSession()

  let runId = buildSessionId(targetRoot, input.now ?? new Date())
  let probe = startOpenSnoopProbe({
    runId,
    targetRoot,
    skillRoots: config.skillRoots,
  })

  let session: TraceSession = {
    run_id: runId,
    target_root: targetRoot,
    target_name: path.basename(targetRoot),
    path_hash: pathHash(targetRoot),
    skill_roots: config.skillRoots,
    started_at: new Date().toISOString(),
    probe_pid: probe.pid,
  }

  state.session = session
  state.probe = probe

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

  bindProcessCleanup()

  return session
}

export async function stopTraceSession() {
  let session = state.session
  let probe = state.probe

  if (probe) killProcessGroup(probe)
  state.probe = undefined
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

function startOpenSnoopProbe(options: OpenSnoopProbeOptions) {
  let probe = spawn('sudo', ['-n', 'opensnoop'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  let deduper = new ProbeDeduper()
  let buffer = ''

  probe.stdout?.setEncoding('utf8')
  probe.stderr?.setEncoding('utf8')

  probe.stdout?.on('data', (chunk) => {
    buffer += chunk
    let lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (let line of lines) {
      void handleOpenSnoopLine(line, options, deduper).catch((error) => {
        console.error(`SkillTrace passive event failed: ${error.message}`)
      })
    }
  })

  probe.stderr?.on('data', (chunk) => {
    process.stderr.write(chunk)
  })

  probe.on('exit', (code, signal) => {
    console.error(`SkillTrace opensnoop exited: code=${code} signal=${signal}`)
    if (state.probe === probe) {
      state.probe = undefined
    }
  })

  return probe
}

async function handleOpenSnoopLine(
  line: string,
  options: OpenSnoopProbeOptions,
  deduper: ProbeDeduper,
) {
  let filePath = parseOpenSnoopPath(line, options.skillRoots)
  if (!filePath) return
  if (!isWatchedSkillPath(filePath, options.skillRoots)) return
  if (deduper.has(filePath)) return
  if (!isReadableFile(filePath)) return

  let content = fs.readFileSync(filePath, 'utf8')
  let absolutePath = path.resolve(filePath)

  await appendPassiveEvent({
    run_id: options.runId,
    event_type: path.basename(absolutePath) === 'SKILL.md'
      ? 'skill_file_read'
      : 'skill_reference_read',
    skill: {
      name: inferSkillName(absolutePath),
      path: path.relative(options.targetRoot, absolutePath),
      file_hash: sha256(content),
    },
    payload: {
      reader: 'traceskill',
      file_path: absolutePath,
      size_bytes: Buffer.byteLength(content),
    },
  })
}

function parseOpenSnoopPath(line: string, roots: string[]) {
  for (let root of roots) {
    let index = line.indexOf(root)
    if (index !== -1) return line.slice(index).trim()
  }

  return undefined
}

function isWatchedSkillPath(filePath: string, roots: string[]) {
  let absolutePath = path.resolve(filePath)

  for (let root of roots) {
    let absoluteRoot = path.resolve(root)
    if (
      absolutePath === absoluteRoot ||
      absolutePath.startsWith(`${absoluteRoot}${path.sep}`)
    ) {
      return true
    }
  }

  return false
}

function inferSkillName(filePath: string) {
  let dir = path.dirname(filePath)
  if (path.basename(filePath) === 'SKILL.md') return path.basename(dir)
  return path.basename(path.dirname(dir))
}

function sha256(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function assertMacOpenSnoopReady() {
  if (process.platform !== 'darwin') {
    throw new Error('traceskill passive probing currently supports macOS only')
  }

  let which = spawnSync('which', ['opensnoop'], { stdio: 'pipe' })
  if (which.status !== 0) {
    throw new Error('opensnoop was not found on PATH')
  }

  let sudo = spawnSync('sudo', ['-n', 'true'], { stdio: 'pipe' })
  if (sudo.status !== 0) {
    throw new Error('sudo is not ready. Run `sudo -v` before traceskill start.')
  }
}

function isReadableFile(filePath: string) {
  try {
    let stat = fs.statSync(filePath)
    return stat.isFile()
  } catch {
    return false
  }
}

function killProcessGroup(child: ChildProcess) {
  if (!child.pid || child.killed) return

  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try {
      child.kill('SIGTERM')
    } catch {}
  }
}

function bindProcessCleanup() {
  if (state.cleanup_bound) return
  state.cleanup_bound = true

  process.on('exit', () => {
    if (state.probe) killProcessGroup(state.probe)
  })
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
  probe?: ChildProcess
  cleanup_bound?: boolean
}

type StartTraceSessionInput = {
  target_root: string
  now?: Date
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
}

type OpenSnoopProbeOptions = {
  runId: string
  targetRoot: string
  skillRoots: string[]
}

type SkillTraceConfigFile = {
  skill_roots?: string[]
  skillRoots?: string[]
}

class ProbeDeduper {
  seen = new Map<string, number>()

  constructor(private ttlMs = 1000) {}

  has(key: string, now = Date.now()) {
    this.prune(now)
    let lastSeen = this.seen.get(key)
    if (lastSeen && now - lastSeen < this.ttlMs) return true
    this.seen.set(key, now)
    return false
  }

  prune(now = Date.now()) {
    for (let [key, timestamp] of this.seen.entries()) {
      if (now - timestamp >= this.ttlMs) {
        this.seen.delete(key)
      }
    }
  }
}

const STATE_KEY = Symbol.for('skilltrace.trace-session-state')
const state = ((globalThis as any)[STATE_KEY] ??= {}) as TraceSessionState
