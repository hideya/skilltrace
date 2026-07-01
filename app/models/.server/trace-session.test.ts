import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  buildSessionId,
  loadTargetConfig,
  normalizeTraceMode,
  pathHash,
  timestampName,
} from './trace-session'

let tempDirs: string[] = []

afterEach(() => {
  for (let dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe('trace session helpers', () => {
  test('builds a readable session ID from repo name, path hash, and timestamp', () => {
    let targetRoot = '/tmp/agent-sandbox-repo'
    let runId = buildSessionId(
      targetRoot,
      new Date('2026-06-19T04:39:12'),
    )

    expect(runId).toBe(
      `agent-sandbox-repo-${pathHash(targetRoot)}-2026-06-19-04-39-12`,
    )
  })

  test('formats local timestamp names', () => {
    expect(timestampName(new Date(2026, 5, 19, 4, 39, 12))).toBe(
      '2026-06-19-04-39-12',
    )
  })

  test('loads skill roots from .skilltrace.json', () => {
    let root = tempRoot()
    fs.writeFileSync(
      path.join(root, '.skilltrace.json'),
      JSON.stringify({ skill_roots: ['.skills', 'skills'] }),
    )

    let config = loadTargetConfig(root)

    expect(config.skillRoots).toEqual([
      path.join(root, '.skills'),
      path.join(root, 'skills'),
    ])
  })

  test('defaults to .skills when no config exists', () => {
    let root = tempRoot()
    let config = loadTargetConfig(root)

    expect(config.skillRoots).toEqual([path.join(root, '.skills')])
  })

  test('defaults to .claude/skills for Claude Code instruction profile', () => {
    let root = tempRoot()
    let config = loadTargetConfig(root, 'claude_code')

    expect(config.skillRoots).toEqual([path.join(root, '.claude/skills')])
  })

  test('normalizes trace mode values', () => {
    expect(normalizeTraceMode('full')).toBe('full')
    expect(normalizeTraceMode('passive_reflection')).toBe(
      'passive_reflection',
    )
    expect(normalizeTraceMode('passive_only')).toBe('passive_only')
    expect(normalizeTraceMode('unknown')).toBe('full')
    expect(normalizeTraceMode(undefined)).toBe('full')
  })
})

function tempRoot() {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'traceskill-session-'))
  tempDirs.push(dir)
  return dir
}
