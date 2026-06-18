import { describe, expect, test } from 'vitest'
import { buildSkillLogEvent, parseKeyValueData } from './skilltrace-log'

describe('skilltrace-log helpers', () => {
  test('builds a semantic event payload', () => {
    let event = buildSkillLogEvent({
      runId: 'run_manual_001',
      eventType: 'skill_use_started',
      skillName: 'pr-review',
      skillVersion: '0.1.0',
      skillFileHash: 'sha256:test',
      summary: 'Using PR review fixture.',
      confidence: 'medium',
      relatedArtifacts: ['artifact_001'],
      data: {
        why_applicable: 'manual fixture test',
      },
    })

    expect(event.run_id).toBe('run_manual_001')
    expect(event.event_type).toBe('skill_use_started')
    expect(event.skill.name).toBe('pr-review')
    expect(event.summary).toBe('Using PR review fixture.')
    expect(event.related_artifacts).toEqual(['artifact_001'])
    expect(event.data.why_applicable).toBe('manual fixture test')
  })

  test('parses key value data', () => {
    let data = parseKeyValueData([
      'why_applicable=manual fixture test',
      'risk=missing tests',
    ])

    expect(data).toEqual({
      why_applicable: 'manual fixture test',
      risk: 'missing tests',
    })
  })

  test('rejects invalid key value data', () => {
    expect(() => parseKeyValueData(['invalid'])).toThrow(
      'Expected --data key=value',
    )
  })
})
