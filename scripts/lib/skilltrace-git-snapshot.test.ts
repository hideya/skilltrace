import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { afterEach, describe, expect, test } from 'vitest'
import { captureGitSnapshot } from './skilltrace-git-snapshot'

let tempDirs: string[] = []

afterEach(() => {
  for (let dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe('captureGitSnapshot', () => {
  test('reports unavailable outside a Git worktree', () => {
    let dir = tempRoot()

    let snapshot = captureGitSnapshot(dir)

    expect(snapshot.available).toBe(false)
    expect(snapshot.reason).toContain('not inside a Git worktree')
  })

  test('captures dirty instruction file contents without capturing other files', () => {
    let dir = gitRepo()
    writeFile(dir, 'AGENTS.md', '# Agent Guidelines\n')
    writeFile(dir, '.agents/skills/type-fix/SKILL.md', '# Type Fix\n')
    writeFile(dir, 'README.md', '# Demo\n')
    git(dir, ['add', '.'])
    git(dir, ['commit', '-m', 'initial'])

    writeFile(dir, '.agents/skills/type-fix/SKILL.md', '# Type Fix\n\nUpdated\n')
    writeFile(dir, 'README.md', '# Demo\n\nUpdated\n')

    let snapshot = captureGitSnapshot(dir)

    expect(snapshot.available).toBe(true)
    expect(snapshot.dirty).toBe(true)
    expect(snapshot.files?.map((file) => file.path)).toEqual(
      expect.arrayContaining(['.agents/skills/type-fix/SKILL.md', 'README.md']),
    )
    expect(snapshot.instruction_files).toEqual(['.agents/skills/type-fix/SKILL.md'])
    expect(snapshot.instruction_diff).toContain('Updated')
    expect(snapshot.instruction_file_contents).toEqual([
      expect.objectContaining({
        path: '.agents/skills/type-fix/SKILL.md',
        target_relative_path: '.agents/skills/type-fix/SKILL.md',
        content: '# Type Fix\n\nUpdated\n',
      }),
    ])
  })

  test('captures untracked instruction files', () => {
    let dir = gitRepo()
    writeFile(dir, 'AGENTS.md', '# Agent Guidelines\n')
    git(dir, ['add', '.'])
    git(dir, ['commit', '-m', 'initial'])

    writeFile(dir, '.agents/skills/new-skill/SKILL.md', '# New Skill\n')

    let snapshot = captureGitSnapshot(dir)

    expect(snapshot.instruction_files).toEqual(['.agents/skills/new-skill/SKILL.md'])
    expect(snapshot.untracked_instruction_files).toEqual([
      {
        path: '.agents/skills/new-skill/SKILL.md',
        content: '# New Skill\n',
        truncated: false,
      },
    ])
  })

  test('stores target-relative instruction paths for nested target repos', () => {
    let dir = gitRepo()
    let target = path.join(dir, 'examples/type-fix-demo')
    writeFile(target, 'AGENTS.md', '# Agent Guidelines\n')
    writeFile(target, '.agents/skills/type-fix/SKILL.md', '# Type Fix\n')
    git(dir, ['add', '.'])
    git(dir, ['commit', '-m', 'initial'])

    writeFile(target, '.agents/skills/type-fix/SKILL.md', '# Type Fix\n\nNested\n')

    let snapshot = captureGitSnapshot(target)

    expect(snapshot.instruction_files).toEqual([
      'examples/type-fix-demo/.agents/skills/type-fix/SKILL.md',
    ])
    expect(snapshot.instruction_file_contents).toEqual([
      expect.objectContaining({
        path: 'examples/type-fix-demo/.agents/skills/type-fix/SKILL.md',
        target_relative_path: '.agents/skills/type-fix/SKILL.md',
      }),
    ])
  })
})

function gitRepo() {
  let dir = tempRoot()
  git(dir, ['init'])
  git(dir, ['config', 'user.email', 'skilltrace@example.test'])
  git(dir, ['config', 'user.name', 'SkillTrace Test'])
  return dir
}

function tempRoot() {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilltrace-git-'))
  tempDirs.push(dir)
  return dir
}

function writeFile(root: string, filePath: string, content: string) {
  let absolutePath = path.join(root, filePath)
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
  fs.writeFileSync(absolutePath, content)
}

function git(cwd: string, args: string[]) {
  let result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(' ')}`)
  }
}
