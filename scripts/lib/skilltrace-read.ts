import path from 'path'
import { createHash } from 'crypto'

export function buildSkillReadEvent(options: BuildSkillReadEventOptions) {
  let absolutePath = path.resolve(options.filePath)
  let skillName = options.skillName || inferSkillName(absolutePath)
  let baseDir = options.baseDir ?? process.cwd()
  let reader = options.reader ?? 'skilltrace-read'

  return {
    run_id: options.runId,
    event_type: eventTypeForPath(absolutePath),
    skill: {
      name: skillName,
      path: path.relative(baseDir, absolutePath),
      file_hash: sha256(options.content),
    },
    payload: {
      reader,
      file_path: absolutePath,
      size_bytes: Buffer.byteLength(options.content),
    },
  }
}

export function eventTypeForPath(filePath: string) {
  return path.basename(filePath) === 'SKILL.md'
    ? 'skill_file_read'
    : 'skill_reference_read'
}

export function inferSkillName(filePath: string) {
  let dir = path.dirname(filePath)
  if (path.basename(filePath) === 'SKILL.md') return path.basename(dir)
  return path.basename(path.dirname(dir))
}

export function sha256(content: string) {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

export type BuildSkillReadEventOptions = {
  runId: string
  skillName?: string
  filePath: string
  content: string
  baseDir?: string
  reader?: string
}
