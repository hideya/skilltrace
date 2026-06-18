import fs from 'fs'
import path from 'path'
import { buildSkillReadEvent } from './skilltrace-read'

export const DEFAULT_SKILL_ROOTS = ['.skills']

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

export function parseOpenSnoopPath(line: string, roots: string[]) {
  for (let root of roots) {
    let index = line.indexOf(root)
    if (index !== -1) return line.slice(index).trim()
  }

  return undefined
}

export function isWatchedSkillPath(filePath: string, roots: string[]) {
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

export function buildProbeReadEvent(options: BuildProbeReadEventOptions) {
  let content = fs.readFileSync(options.filePath, 'utf8')

  return buildSkillReadEvent({
    runId: options.runId,
    filePath: options.filePath,
    content,
    baseDir: options.targetRoot,
    reader: 'skilltrace-probe-mcp',
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
}
