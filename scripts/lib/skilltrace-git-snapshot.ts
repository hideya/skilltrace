import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'

const GIT_SNAPSHOT_TEXT_LIMIT = 200_000

export function captureGitSnapshot(targetRoot: string): GitSnapshot {
  let root = gitOutput(targetRoot, ['rev-parse', '--show-toplevel'])
  if (!root.ok) {
    return {
      available: false,
      reason: 'target is not inside a Git worktree',
    }
  }

  let gitRoot = root.stdout
  let head = gitOutput(gitRoot, ['rev-parse', 'HEAD'])
  let branch = gitOutput(gitRoot, ['branch', '--show-current'])
  let status = gitOutput(
    gitRoot,
    ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
    false,
  )
  let targetPrefix = gitRelativeTargetPrefix(gitRoot, targetRoot)
  let files = status.ok
    ? parseGitStatus(status.stdout).map((file) =>
      enrichGitSnapshotFile(file, targetPrefix)
    )
    : []
  let instructionFiles = instructionRelevantFiles(files)
  let untrackedInstructionFiles = files
    .filter((file) => file.status === '??')
    .map((file) => file.path)
    .filter((file) => instructionFiles.includes(file))
  let instructionDiff = instructionFiles.length > 0
    ? gitDiff(gitRoot, instructionFiles)
    : ''

  return {
    available: true,
    captured_at: new Date().toISOString(),
    root: gitRoot,
    head: head.ok ? head.stdout : null,
    branch: branch.ok && branch.stdout ? branch.stdout : null,
    dirty: files.length > 0,
    files,
    instruction_files: instructionFiles,
    instruction_diff: truncateSnapshotText(instructionDiff),
    instruction_diff_truncated: instructionDiff.length > GIT_SNAPSHOT_TEXT_LIMIT,
    instruction_file_contents: captureInstructionFileContents(
      gitRoot,
      files.filter((file) => instructionFiles.includes(file.path)),
    ),
    untracked_instruction_files: captureUntrackedInstructionFiles(
      gitRoot,
      untrackedInstructionFiles,
    ),
  }
}

function gitOutput(cwd: string, args: string[], trim = true) {
  let result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  })

  return {
    ok: result.status === 0,
    stdout: trim ? (result.stdout ?? '').trim() : result.stdout ?? '',
  }
}

function gitDiff(cwd: string, files: string[]) {
  let args = ['diff', 'HEAD', '--', ...files]
  let result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  })

  if (result.status === 0 || result.status === 1) return result.stdout ?? ''
  return ''
}

function captureUntrackedInstructionFiles(cwd: string, files: string[]) {
  return files.map((file) => {
    let absolutePath = path.join(cwd, file)
    let content = readSnapshotFileContent(absolutePath)

    return {
      path: file,
      content: truncateSnapshotText(content),
      truncated: content.length > GIT_SNAPSHOT_TEXT_LIMIT,
    }
  })
}

function captureInstructionFileContents(cwd: string, files: GitSnapshotFile[]) {
  return files.map((file) => {
    let absolutePath = path.join(cwd, file.path)
    let content = readSnapshotFileContent(absolutePath)

    return {
      path: file.path,
      target_relative_path: file.target_relative_path,
      status: file.status,
      content: truncateSnapshotText(content),
      truncated: content.length > GIT_SNAPSHOT_TEXT_LIMIT,
    }
  })
}

function readSnapshotFileContent(filePath: string) {
  if (!fs.existsSync(filePath)) return ''
  if (!fs.statSync(filePath).isFile()) return ''
  return fs.readFileSync(filePath, 'utf8')
}

function parseGitStatus(output: string) {
  let entries = output.split('\0').filter(Boolean)
  let files: GitSnapshotFile[] = []

  for (let index = 0; index < entries.length; index += 1) {
    let entry = entries[index]
    let status = entry.slice(0, 2)
    let filePath = entry.slice(3)

    if (status.includes('R') || status.includes('C')) {
      let previousPath = entries[++index]
      files.push({
        path: filePath,
        status,
        previous_path: previousPath,
      })
      continue
    }

    files.push({ path: filePath, status })
  }

  return files
}

function gitRelativeTargetPrefix(gitRoot: string, targetRoot: string) {
  let relative = path
    .relative(realPath(gitRoot), realPath(targetRoot))
    .replaceAll(path.sep, '/')
  if (!relative || relative === '.') return ''
  return `${relative.replace(/\/+$/, '')}/`
}

function realPath(filePath: string) {
  try {
    return fs.realpathSync(filePath)
  } catch {
    return path.resolve(filePath)
  }
}

function enrichGitSnapshotFile(file: GitSnapshotFile, targetPrefix: string) {
  if (!targetPrefix) {
    return {
      ...file,
      target_relative_path: file.path,
    }
  }

  if (!file.path.startsWith(targetPrefix)) return file

  return {
    ...file,
    target_relative_path: file.path.slice(targetPrefix.length),
  }
}

function instructionRelevantFiles(files: GitSnapshotFile[]) {
  return files
    .filter((file) => isInstructionRelevantFile(file.target_relative_path))
    .map((file) => file.path)
}

function isInstructionRelevantFile(file?: string) {
  return (
    file === 'AGENTS.md' ||
    file === 'CLAUDE.md' ||
    file === '.skilltrace.json' ||
    !!file?.startsWith('.agents/') ||
    !!file?.startsWith('.skills/') ||
    !!file?.startsWith('.claude/') ||
    !!file?.startsWith('.skilltrace/')
  )
}

function truncateSnapshotText(value: string) {
  if (value.length <= GIT_SNAPSHOT_TEXT_LIMIT) return value
  return `${value.slice(0, GIT_SNAPSHOT_TEXT_LIMIT)}\n[SkillTrace truncated snapshot text]\n`
}

export type GitSnapshot = {
  available: boolean
  reason?: string
  captured_at?: string
  root?: string
  head?: string | null
  branch?: string | null
  dirty?: boolean
  files?: GitSnapshotFile[]
  instruction_files?: string[]
  instruction_diff?: string
  instruction_diff_truncated?: boolean
  instruction_file_contents?: GitSnapshotInstructionFile[]
  untracked_instruction_files?: GitSnapshotUntrackedFile[]
}

export type GitSnapshotFile = {
  path: string
  status: string
  previous_path?: string
  target_relative_path?: string
}

export type GitSnapshotUntrackedFile = {
  path: string
  content: string
  truncated: boolean
}

export type GitSnapshotInstructionFile = {
  path: string
  target_relative_path?: string
  status: string
  content: string
  truncated: boolean
}
