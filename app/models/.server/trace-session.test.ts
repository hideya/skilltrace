import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  buildSessionId,
  loadTargetConfig,
  normalizeTraceMode,
  pathHash,
  resolveTraceSession,
  timestampName,
} from './trace-session'

let tempDirs: string[] = []

afterEach(() => {
  let state = (globalThis as any)[Symbol.for('skilltrace.trace-session-state')]
  if (state) state.session = undefined

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
      JSON.stringify({ skill_roots: ['custom-skills', 'skills'] }),
    )

    let config = loadTargetConfig(root)

    expect(config.skillRoots).toEqual([
      path.join(root, 'custom-skills'),
      path.join(root, 'skills'),
    ])
  })

  test('defaults to .agents/skills when no config exists', () => {
    let root = tempRoot()
    let config = loadTargetConfig(root)

    expect(config.skillRoots).toEqual([path.join(root, '.agents/skills')])
  })

  test('defaults to .claude/skills for Claude Code instruction profile', () => {
    let root = tempRoot()
    let config = loadTargetConfig(root, 'claude_code')

    expect(config.skillRoots).toEqual([path.join(root, '.claude/skills')])
  })

  test('includes the resolved skill root behind a profile alias', () => {
    let root = tempRoot()
    fs.mkdirSync(path.join(root, '.agents/skills'), { recursive: true })
    fs.symlinkSync('.agents', path.join(root, '.claude'))

    let config = loadTargetConfig(root, 'claude_code')

    expect(config.skillRoots).toEqual([
      path.join(root, '.claude/skills'),
      fs.realpathSync(path.join(root, '.agents/skills')),
    ])
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

  test('resolves the active session only for its target repository', () => {
    let targetRoot = path.resolve('/tmp/skilltrace-target')
    let state = (globalThis as any)[
      Symbol.for('skilltrace.trace-session-state')
    ]
    state.session = {
      run_id: 'run-1',
      target_root: targetRoot,
    }

    expect(resolveTraceSession({ target_root: targetRoot })?.run_id).toBe(
      'run-1',
    )
    expect(
      resolveTraceSession({ target_root: '/tmp/another-target' }),
    ).toBeUndefined()
  })
})

function tempRoot() {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'traceskill-session-'))
  tempDirs.push(dir)
  return dir
}
