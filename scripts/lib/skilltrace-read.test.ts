import path from 'path'
import { describe, expect, test } from 'vitest'
import {
  buildSkillReadEvent,
  eventTypeForPath,
  inferSkillName,
  sha256,
} from './skilltrace-read'

describe('skilltrace-read helpers', () => {
  test('classifies SKILL.md as a skill file read', () => {
    expect(eventTypeForPath('/tmp/skills/pr-review/SKILL.md')).toBe(
      'skill_file_read',
    )
  })

  test('classifies other files as skill reference reads', () => {
    expect(eventTypeForPath('/tmp/skills/pr-review/reference/checklist.md')).toBe(
      'skill_reference_read',
    )
  })

  test('infers skill name from SKILL.md parent folder', () => {
    expect(inferSkillName('/tmp/skills/pr-review/SKILL.md')).toBe('pr-review')
  })

  test('infers skill name from reference grandparent folder', () => {
    expect(inferSkillName('/tmp/skills/pr-review/reference/checklist.md')).toBe(
      'pr-review',
    )
  })

  test('builds a passive event payload', () => {
    let event = buildSkillReadEvent({
      runId: 'run_manual_001',
      skillName: 'pr-review',
      filePath: path.join(process.cwd(), 'skills/pr-review/SKILL.md'),
      content: '# PR Review',
    })

    expect(event.run_id).toBe('run_manual_001')
    expect(event.event_type).toBe('skill_file_read')
    expect(event.skill.name).toBe('pr-review')
    expect(event.skill.file_hash).toBe(sha256('# PR Review'))
    expect(event.payload.reader).toBe('skilltrace-read')
  })
})
