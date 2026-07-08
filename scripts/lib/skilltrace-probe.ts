import fs from 'fs'
import path from 'path'
import { buildSkillReadEvent } from './skilltrace-read'

export const DEFAULT_SKILL_ROOTS = ['.agents/skills']

export function discoverProbeConfig(options: DiscoverProbeConfigOptions) {
  let candidates = unique(
    [
      options.targetRoot,
      options.initCwd,
      options.pwd,
      options.cwd,
    ].filter(Boolean) as string[],
  )

  for (let candidate of candidates) {
    let root = findTargetRoot(candidate)
    if (root) return loadProbeConfig(root)
  }

  return undefined
}

export function findTargetRoot(start: string) {
  let current = path.resolve(start)

  while (true) {
    if (
      fs.existsSync(path.join(current, '.skilltrace.json')) ||
      fs.existsSync(path.join(current, '.agents/skills')) ||
      fs.existsSync(path.join(current, '.skills'))
    ) {
      return current
    }

    let parent = path.dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

export function loadProbeConfig(root: string) {
  let configPath = path.join(root, '.skilltrace.json')
  let config: SkillTraceProbeFile = {}

  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  }

  let skillRoots = config.skill_roots ?? config.skillRoots ?? DEFAULT_SKILL_ROOTS

  return {
    targetRoot: root,
    skillRoots: skillRoots.map((skillRoot) => path.resolve(root, skillRoot)),
  }
}

export function parseOpenSnoopPath(
  line: string,
  roots: string[],
  targetRoot?: string,
) {
  let lowerLine = line.toLowerCase()

  for (let root of roots) {
    let index = lowerLine.indexOf(root.toLowerCase())
    if (index !== -1) return firstPathToken(line.slice(index))
  }

  if (targetRoot) {
    for (let root of roots) {
      let relativeRoot = path.relative(targetRoot, root)
      if (!relativeRoot || relativeRoot.startsWith('..')) continue

      let index = lowerLine.indexOf(relativeRoot.toLowerCase())
      if (index !== -1) {
        return path.resolve(targetRoot, firstPathToken(line.slice(index)))
      }
    }
  }

  return undefined
}

export function parseInotifywaitPath(line: string, targetRoot?: string) {
  let filePath = line.trim()
  if (!filePath) return undefined
  if (filePath.startsWith('Setting up watches')) return undefined
  if (filePath === 'Watches established.') return undefined
  if (path.isAbsolute(filePath)) return filePath
  if (targetRoot) return path.resolve(targetRoot, filePath)
  return filePath
}

export function parseFsUsageProcess(line: string) {
  let token = line.trim().split(/\s+/).at(-1)
  if (!token || token.includes('/')) return undefined

  let match = token.match(/^(.+)\.(\d+)$/)
  if (!match) {
    return {
      process: token,
    }
  }

  return {
    process: token,
    name: match[1],
    pid: match[2],
  }
}

export function isFsUsageReadOperation(line: string) {
  let operation = line.trim().split(/\s+/)[1]
  return FS_USAGE_READ_OPERATIONS.has(operation)
}

export function isIgnoredObservedProcess(name?: string) {
  return name === 'git'
}

export function isWatchedSkillPath(filePath: string, roots: string[]) {
  let absolutePath = path.resolve(filePath).toLowerCase()

  for (let root of roots) {
    let absoluteRoot = path.resolve(root).toLowerCase()
    if (
      absolutePath === absoluteRoot ||
      absolutePath.startsWith(`${absoluteRoot}${path.sep}`)
    ) {
      return true
    }
  }

  return false
}

export function buildProbeReadEvent(options: BuildProbeReadEventOptions) {
  let content = fs.readFileSync(options.filePath, 'utf8')

  return buildSkillReadEvent({
    runId: options.runId,
    filePath: options.filePath,
    content,
    baseDir: options.targetRoot,
    reader: 'skilltrace-probe-worker',
    observedProcess: options.observedProcess,
    observedProcessName: options.observedProcessName,
    observedProcessId: options.observedProcessId,
  })
}

export class ProbeDeduper {
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

function unique(values: string[]) {
  return [...new Set(values)]
}

function firstPathToken(value: string) {
  return value.trim().split(/\s+/)[0]
}

const FS_USAGE_READ_OPERATIONS = new Set([
  'open',
  'open_nocancel',
  'openat',
  'openat_nocancel',
])

export type DiscoverProbeConfigOptions = {
  targetRoot?: string
  initCwd?: string
  pwd?: string
  cwd: string
}

export type SkillTraceProbeFile = {
  skill_roots?: string[]
  skillRoots?: string[]
}

export type BuildProbeReadEventOptions = {
  runId: string
  targetRoot: string
  filePath: string
  observedProcess?: string
  observedProcessName?: string
  observedProcessId?: string
}
