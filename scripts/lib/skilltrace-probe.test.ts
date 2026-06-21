import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  ProbeDeduper,
  discoverProbeConfig,
  findTargetRoot,
  isWatchedSkillPath,
  loadProbeConfig,
  parseOpenSnoopPath,
} from './skilltrace-probe'

let tempDirs: string[] = []

afterEach(() => {
  for (let dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe('skilltrace probe helpers', () => {
  test('finds a target root from a .skilltrace.json marker', () => {
    let root = tempRoot()
    fs.mkdirSync(path.join(root, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(root, '.skilltrace.json'),
      JSON.stringify({ skill_roots: ['.skills'] }),
    )

    expect(findTargetRoot(path.join(root, 'src'))).toBe(root)
  })

  test('loads snake_case skill roots from .skilltrace.json', () => {
    let root = tempRoot()
    fs.writeFileSync(
      path.join(root, '.skilltrace.json'),
      JSON.stringify({ skill_roots: ['.skills', 'skills'] }),
    )

    let config = loadProbeConfig(root)

    expect(config.skillRoots).toEqual([
      path.join(root, '.skills'),
      path.join(root, 'skills'),
    ])
  })

  test('discovers target root from INIT_CWD before cwd', () => {
    let target = tempRoot()
    let other = tempRoot()
    fs.mkdirSync(path.join(target, '.skills'), { recursive: true })

    let config = discoverProbeConfig({
      initCwd: target,
      cwd: other,
    })

    expect(config?.targetRoot).toBe(target)
  })

  test('parses the watched path from an absolute probe line', () => {
    let root = '/tmp/repo/.skills'
    let line = `501 123 Codex 3 ${root}/type-fix/SKILL.md`

    expect(parseOpenSnoopPath(line, [root])).toBe(
      '/tmp/repo/.skills/type-fix/SKILL.md',
    )
  })

  test('parses lowercase fs_usage absolute paths case-insensitively', () => {
    let targetRoot = '/tmp/SkillTraceTest/agent-sandbox-repo'
    let root = path.join(targetRoot, '.skills')
    let lowercasePath =
      '/tmp/skilltracetest/agent-sandbox-repo/.skills/type-fix/SKILL.md'
    let line = [
      '06:58:28.416967 open F=19',
      lowercasePath,
      '0.000031 cat.123',
    ].join(' ')

    expect(parseOpenSnoopPath(line, [root])).toBe(lowercasePath)
  })

  test('parses relative fs_usage paths from the target root', () => {
    let targetRoot = '/tmp/skilltrace-test/agent-sandbox-repo'
    let root = path.join(targetRoot, '.skills')
    let line =
      '06:58:31.134215 open F=3 .skills/type-fix/SKILL.md 0.000055 cat.48931538'

    expect(parseOpenSnoopPath(line, [root], targetRoot)).toBe(
      path.join(targetRoot, '.skills/type-fix/SKILL.md'),
    )
  })

  test('matches only files inside watched skill roots', () => {
    let root = '/tmp/repo/.skills'

    expect(isWatchedSkillPath('/tmp/repo/.skills/type-fix/SKILL.md', [root])).toBe(
      true,
    )
    expect(isWatchedSkillPath('/tmp/repo/.skills-other/SKILL.md', [root])).toBe(
      false,
    )
  })

  test('dedupes repeated events inside the ttl window', () => {
    let deduper = new ProbeDeduper(1000)

    expect(deduper.has('/tmp/repo/.skills/type-fix/SKILL.md', 1000)).toBe(false)
    expect(deduper.has('/tmp/repo/.skills/type-fix/SKILL.md', 1500)).toBe(true)
    expect(deduper.has('/tmp/repo/.skills/type-fix/SKILL.md', 2500)).toBe(false)
  })
})

function tempRoot() {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilltrace-probe-'))
  tempDirs.push(dir)
  return dir
}
