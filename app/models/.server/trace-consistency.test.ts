import { describe, expect, test } from 'vitest'
import {
  checkTraceConsistency,
  traceConsistencyMatrix,
} from './trace-consistency'

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

  test('passes reflected files that were observed passively', () => {
    let results = checkTraceConsistency([
      passivePath('.skills/type-fix/SKILL.md', 'skill_file_read'),
      passivePath(
        '.skills/type-fix/references/checklist.md',
        'skill_reference_read',
      ),
      reflection({
        skills_read: ['.skills/type-fix/SKILL.md'],
        references_read: ['.skills/type-fix/references/checklist.md'],
        files_believed_to_influence_work: [
          '/repo/',
        ],
      }),
    ])

    expect(results).toEqual([
      {
        status: 'warning',
        title: 'Read but not declared',
        message:
          '.skills/type-fix/SKILL.md was read, but no skill_use_started event was logged.',
        skill: '.skills/type-fix/SKILL.md',
      },
      {
        status: 'warning',
        title: 'Read but not declared',
        message:
          '.skills/type-fix/references/checklist.md was read, but no skill_use_started event was logged.',
        skill: '.skills/type-fix/references/checklist.md',
      },
      {
        status: 'pass',
        title: 'Reflected and observed',
        message:
          '.skills/type-fix/SKILL.md was listed in reflection and observed passively.',
        skill: '.skills/type-fix/SKILL.md',
      },
      {
        status: 'pass',
        title: 'Reflected and observed',
        message:
          '.skills/type-fix/references/checklist.md was listed in reflection and observed passively.',
        skill: '.skills/type-fix/references/checklist.md',
      },
    ])
  })

  test('warns when reflection mentions a file passive probing missed', () => {
    let results = checkTraceConsistency([
      reflection({
        skills_read: ['.skills/type-fix/SKILL.md'],
      }),
    ])

    expect(results).toEqual([
      {
        status: 'warning',
        title: 'Reflected but not observed',
        message:
          '.skills/type-fix/SKILL.md was listed in reflection, but no passive read was observed.',
        skill: '.skills/type-fix/SKILL.md',
      },
    ])
  })

  test('warns when passive probing observed a file reflection omitted', () => {
    let results = checkTraceConsistency([
      passivePath('.skills/type-fix/SKILL.md', 'skill_file_read'),
      reflection({
        skills_read: [],
      }),
    ])

    expect(results).toEqual([
      {
        status: 'warning',
        title: 'Read but not declared',
        message:
          '.skills/type-fix/SKILL.md was read, but no skill_use_started event was logged.',
        skill: '.skills/type-fix/SKILL.md',
      },
      {
        status: 'warning',
        title: 'Observed but not reflected',
        message:
          '.skills/type-fix/SKILL.md was observed passively, but was not listed in reflection.',
        skill: '.skills/type-fix/SKILL.md',
      },
    ])
  })

  test('ignores SkillTrace instrumentation in reflection consistency', () => {
    let results = checkTraceConsistency([
      reflection({
        skills_read: ['.skilltrace/instrumentation.md'],
        references_read: ['.skills/type-fix/references/checklist.md'],
      }),
      passivePath(
        '.skills/type-fix/references/checklist.md',
        'skill_reference_read',
      ),
    ])

    expect(results).toEqual([
      {
        status: 'warning',
        title: 'Read but not declared',
        message:
          '.skills/type-fix/references/checklist.md was read, but no skill_use_started event was logged.',
        skill: '.skills/type-fix/references/checklist.md',
      },
      {
        status: 'pass',
        title: 'Reflected and observed',
        message:
          '.skills/type-fix/references/checklist.md was listed in reflection and observed passively.',
        skill: '.skills/type-fix/references/checklist.md',
      },
    ])
  })

  test('omits SkillTrace instrumentation from the consistency matrix', () => {
    let rows = traceConsistencyMatrix([
      passivePath('.skilltrace/instrumentation.md', 'skill_file_read'),
      reflection({
        skills_read: ['.skilltrace/instrumentation.md'],
      }),
    ])

    expect(rows).toEqual([])
  })

  test('builds a file-oriented consistency matrix', () => {
    let rows = traceConsistencyMatrix([
      passivePath('.skills/type-fix/SKILL.md', 'skill_file_read'),
      semanticPath('.skills/type-fix/SKILL.md', 'skill_use_started'),
      passivePath(
        '.skills/type-fix/references/checklist.md',
        'skill_reference_read',
      ),
      semanticReferencePath('.skills/type-fix/references/checklist.md'),
      reflection({
        skills_read: ['/repo/.skills/type-fix/SKILL.md'],
        references_read: ['/repo/.skills/type-fix/references/checklist.md'],
        files_believed_to_influence_work: ['/repo/'],
      }),
    ])

    expect(rows).toEqual([
      {
        kind: 'Skill',
        file: '/repo/.skills/type-fix/SKILL.md',
        passive: true,
        semantic: true,
        reflection: true,
        issue_count: 0,
        status: 'pass',
      },
      {
        kind: 'Reference',
        file: '/repo/.skills/type-fix/references/checklist.md',
        passive: true,
        semantic: true,
        reflection: true,
        issue_count: 0,
        status: 'pass',
      },
    ])
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

function passivePath(skill_path: string, event_type: string) {
  return {
    source: 'passive_file_harness',
    event_type,
    skill_path,
    payload: {
      file_path: `/repo/${skill_path}`,
    },
  }
}

function semanticPath(skill_path: string, event_type: string) {
  return {
    source: 'mcp_semantic_logger',
    event_type,
    skill_path,
  }
}

function semanticReferencePath(reference_path: string) {
  return {
    source: 'mcp_semantic_logger',
    event_type: 'skill_reference_read',
    payload: {
      data: {
        reference_path,
      },
    },
  }
}

function reflection(data: Record<string, any>) {
  return {
    source: 'mcp_semantic_logger',
    event_type: 'run_reflection_declared',
    timestamp: '2026-06-24T00:00:00Z',
    payload: {
      data,
    },
  }
}
