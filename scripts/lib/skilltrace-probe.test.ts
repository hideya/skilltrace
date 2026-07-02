import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  ProbeDeduper,
  discoverProbeConfig,
  findTargetRoot,
  isFsUsageReadOperation,
  isIgnoredObservedProcess,
  isWatchedSkillPath,
  loadProbeConfig,
  parseFsUsageProcess,
  parseInotifywaitPath,
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
    let targetRoot = '/tmp/SkillTraceTest/type-fix-demo'
    let root = path.join(targetRoot, '.skills')
    let lowercasePath =
      '/tmp/skilltracetest/type-fix-demo/.skills/type-fix/SKILL.md'
    let line = [
      '06:58:28.416967 open F=19',
      lowercasePath,
      '0.000031 cat.123',
    ].join(' ')

    expect(parseOpenSnoopPath(line, [root])).toBe(lowercasePath)
  })

  test('parses relative fs_usage paths from the target root', () => {
    let targetRoot = '/tmp/skilltrace-test/type-fix-demo'
    let root = path.join(targetRoot, '.skills')
    let line =
      '06:58:31.134215 open F=3 .skills/type-fix/SKILL.md 0.000055 cat.48931538'

    expect(parseOpenSnoopPath(line, [root], targetRoot)).toBe(
      path.join(targetRoot, '.skills/type-fix/SKILL.md'),
    )
  })

  test('parses Claude skill roots from relative fs_usage paths', () => {
    let targetRoot = '/tmp/skilltrace-test/type-fix-demo-claude'
    let root = path.join(targetRoot, '.claude/skills')
    let line =
      '06:58:31.134215 open F=3 .claude/skills/type-fix/SKILL.md 0.000055 claude.48931538'

    expect(parseOpenSnoopPath(line, [root], targetRoot)).toBe(
      path.join(targetRoot, '.claude/skills/type-fix/SKILL.md'),
    )
  })

  test('parses inotifywait absolute paths', () => {
    let filePath = '/tmp/repo/.skills/type-fix/SKILL.md'

    expect(parseInotifywaitPath(filePath)).toBe(filePath)
  })

  test('parses inotifywait relative paths from the target root', () => {
    expect(parseInotifywaitPath('.skills/type-fix/SKILL.md', '/tmp/repo')).toBe(
      '/tmp/repo/.skills/type-fix/SKILL.md',
    )
  })

  test('ignores inotifywait setup messages', () => {
    expect(
      parseInotifywaitPath(
        'Setting up watches.  Beware: since -r was given, this may take a while!',
      ),
    ).toBeUndefined()
    expect(parseInotifywaitPath('Watches established.')).toBeUndefined()
  })

  test('parses the process token from fs_usage lines', () => {
    let line =
      '06:58:31.134215 open F=3 .skills/type-fix/SKILL.md 0.000055 Codex.48931538'

    expect(parseFsUsageProcess(line)).toEqual({
      process: 'Codex.48931538',
      name: 'Codex',
      pid: '48931538',
    })
  })

  test('treats fs_usage open operations as passive read evidence', () => {
    let line =
      '06:58:31.134215 open F=3 .skills/type-fix/SKILL.md 0.000055 Codex.48931538'

    expect(isFsUsageReadOperation(line)).toBe(true)
  })

  test('treats fs_usage openat operations as passive read evidence', () => {
    let line = [
      '07:45:23.301138',
      'openat',
      'F=15',
      '(R______________)',
      '[-2]//tmp/repo/.claude/skills/type-fix/SKILL.md',
      '0.000134',
      'claude.344155',
    ].join(' ')

    expect(isFsUsageReadOperation(line)).toBe(true)
  })

  test('ignores fs_usage stat operations as metadata-only noise', () => {
    let line =
      '06:58:31.134215 stat64 .skills/type-fix/SKILL.md 0.000055 node.48931538'

    expect(isFsUsageReadOperation(line)).toBe(false)
  })

  test('ignores git as passive probe noise', () => {
    expect(isIgnoredObservedProcess('git')).toBe(true)
    expect(isIgnoredObservedProcess('Codex')).toBe(false)
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
