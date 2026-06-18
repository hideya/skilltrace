import { describe, expect, test } from 'vitest'
import { checkTraceConsistency } from './trace-consistency'

describe('checkTraceConsistency', () => {
  test('passes when skill read, started, and finished are present', () => {
    let results = checkTraceConsistency([
      passive('pr-review'),
      semantic('pr-review', 'skill_use_started'),
      semantic('pr-review', 'skill_use_finished'),
    ])

    expect(results).toEqual([
      {
        status: 'pass',
        title: 'Observed and declared',
        message: 'pr-review was read, started, and finished.',
        skill: 'pr-review',
      },
    ])
  })

  test('warns when a skill was read but not declared', () => {
    let results = checkTraceConsistency([passive('pr-review')])

    expect(results).toEqual([
      {
        status: 'warning',
        title: 'Read but not declared',
        message:
          'pr-review was read, but no skill_use_started event was logged.',
        skill: 'pr-review',
      },
    ])
  })

  test('warns when a skill was declared but not observed', () => {
    let results = checkTraceConsistency([
      semantic('pr-review', 'skill_use_started'),
      semantic('pr-review', 'skill_use_finished'),
    ])

    expect(results).toEqual([
      {
        status: 'warning',
        title: 'Declared but not observed',
        message:
          'pr-review was declared, but no passive skill read was observed.',
        skill: 'pr-review',
      },
    ])
  })

  test('marks a started skill without finish as incomplete', () => {
    let results = checkTraceConsistency([
      passive('pr-review'),
      semantic('pr-review', 'skill_use_started'),
    ])

    expect(results).toEqual([
      {
        status: 'incomplete',
        title: 'Started but not finished',
        message:
          'pr-review logged skill_use_started, but no skill_use_finished event was logged.',
        skill: 'pr-review',
      },
    ])
  })

  test('matches by path when skill name is unavailable', () => {
    let results = checkTraceConsistency([
      {
        source: 'passive_file_harness',
        event_type: 'skill_file_read',
        skill_path: 'skills/pr-review/SKILL.md',
      },
      {
        source: 'mcp_semantic_logger',
        event_type: 'skill_use_started',
        skill_path: 'skills/pr-review/SKILL.md',
      },
      {
        source: 'mcp_semantic_logger',
        event_type: 'skill_use_finished',
        skill_path: 'skills/pr-review/SKILL.md',
      },
    ])

    expect(results[0].status).toBe('pass')
    expect(results[0].skill).toBe('skills/pr-review/SKILL.md')
  })

  test('ignores unkeyed events', () => {
    let results = checkTraceConsistency([
      {
        source: 'passive_file_harness',
        event_type: 'artifact_read',
      },
    ])

    expect(results).toEqual([])
  })
})

function passive(skill_name: string) {
  return {
    source: 'passive_file_harness',
    event_type: 'skill_file_read',
    skill_name,
  }
}

function semantic(skill_name: string, event_type: string) {
  return {
    source: 'mcp_semantic_logger',
    event_type,
    skill_name,
  }
}
