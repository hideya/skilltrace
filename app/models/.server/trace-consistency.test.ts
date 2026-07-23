import { describe, expect, test } from 'vitest'
import {
  summarizeConsistencyMatrix,
  traceConsistencyMatrix,
} from './trace-consistency'

const SKILL = '.agents/skills/type-fix/SKILL.md'
const REFERENCE = '.agents/skills/type-fix/references/checklist.md'

describe('traceConsistencyMatrix', () => {
  test('builds passing file rows from complete evidence', () => {
    let rows = traceConsistencyMatrix([
      passivePath(SKILL, 'skill_file_read'),
      semanticPath(SKILL, 'skill_use_started'),
      semanticPath(SKILL, 'skill_use_finished'),
      passivePath(REFERENCE, 'skill_reference_read'),
      semanticReferencePath(REFERENCE),
      reflection({
        skills_read: [`/repo/${SKILL}`],
        references_read: [`/repo/${REFERENCE}`],
      }),
    ])

    expect(rows).toHaveLength(2)
    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'Skill',
        file: `/repo/${SKILL}`,
        passive: true,
        semantic: true,
        reflection: true,
        issue_count: 0,
        status: 'pass',
      }),
      expect.objectContaining({
        kind: 'Reference',
        file: `/repo/${REFERENCE}`,
        passive: true,
        semantic: true,
        reflection: true,
        issue_count: 0,
        status: 'pass',
      }),
    ])
  })

  test('adds provider observations without changing passing verdicts', () => {
    let rows = traceConsistencyMatrix([
      passivePath(SKILL, 'skill_file_read'),
      semanticPath(SKILL, 'skill_use_started'),
      semanticPath(SKILL, 'skill_use_finished'),
      reflection({ skills_read: [SKILL] }),
      providerPath(SKILL, 'skill_file_read'),
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        provider: true,
        issue_count: 0,
        status: 'pass',
      }),
    ])
    expect(summarizeConsistencyMatrix(rows)).toBe('pass')
  })

  test('keeps provider-only observations neutral', () => {
    let rows = traceConsistencyMatrix([
      providerPath(SKILL, 'skill_file_read'),
      providerPath(REFERENCE, 'skill_reference_read'),
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'Skill',
        provider: true,
        passive_expected: false,
        semantic_expected: false,
        reflection_expected: false,
        issue_count: 0,
        status: 'provider_only',
      }),
      expect.objectContaining({
        kind: 'Reference',
        provider: true,
        passive_expected: false,
        semantic_expected: false,
        reflection_expected: false,
        issue_count: 0,
        status: 'provider_only',
      }),
    ])
    expect(summarizeConsistencyMatrix(rows)).toBe('unknown')
  })

  test('does not let provider observations replace expected evidence', () => {
    let rows = traceConsistencyMatrix([
      semanticPath(SKILL, 'skill_use_started'),
      semanticPath(SKILL, 'skill_use_finished'),
      reflection({ skills_read: [SKILL] }),
      providerPath(SKILL, 'skill_file_read'),
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        provider: true,
        passive: false,
        issue_count: 1,
        status: 'warning',
      }),
    ])
    expect(summarizeConsistencyMatrix(rows)).toBe('warning')
  })

  test('classifies entrypoint-only scans as discovery', () => {
    let rows = traceConsistencyMatrix([passivePath(SKILL, 'skill_file_read')])

    expect(rows).toEqual([
      expect.objectContaining({
        kind: 'Skill',
        status: 'discovered',
        semantic_expected: false,
        reflection_expected: false,
        issue_count: 0,
      }),
    ])
    expect(summarizeConsistencyMatrix(rows)).toBe('pass')
  })

  test('does not classify a skill with reference activity as discovery', () => {
    let rows = traceConsistencyMatrix([
      passivePath(SKILL, 'skill_file_read'),
      passivePath(REFERENCE, 'skill_reference_read'),
    ])

    expect(rows.map((row) => row.status)).toEqual(['error', 'error'])
    expect(summarizeConsistencyMatrix(rows)).toBe('warning')
  })

  test('omits SkillTrace instrumentation', () => {
    let rows = traceConsistencyMatrix([
      passivePath('.skilltrace/instrumentation.md', 'skill_file_read'),
      reflection({
        skills_read: ['.skilltrace/instrumentation.md'],
      }),
    ])

    expect(rows).toEqual([])
  })

  test('uses passive-only expectations', () => {
    let rows = traceConsistencyMatrix(
      [passivePath(REFERENCE, 'skill_reference_read')],
      { traceMode: 'passive_only' },
    )

    expect(rows).toEqual([
      expect.objectContaining({
        status: 'pass',
        passive_expected: true,
        semantic_expected: false,
        reflection_expected: false,
      }),
    ])
  })

  test('uses passive plus reflection expectations', () => {
    let rows = traceConsistencyMatrix(
      [
        passivePath(SKILL, 'skill_file_read'),
        reflection({ skills_read: [SKILL] }),
      ],
      { traceMode: 'passive_reflection' },
    )

    expect(rows).toEqual([
      expect.objectContaining({
        status: 'pass',
        semantic_expected: false,
        reflection_expected: true,
      }),
    ])
  })

  test('marks an incomplete semantic lifecycle as partial', () => {
    let rows = traceConsistencyMatrix([
      passivePath(SKILL, 'skill_file_read'),
      semanticPath(SKILL, 'skill_use_started'),
      reflection({ skills_read: [SKILL] }),
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        semantic: false,
        semantic_state: 'partial',
        issue_count: 1,
        status: 'warning',
      }),
    ])
  })

  test('supports Claude Code skill roots', () => {
    let skill = '.claude/skills/review/SKILL.md'
    let rows = traceConsistencyMatrix([
      passivePath(skill, 'skill_file_read'),
      semanticPath(skill, 'skill_use_started'),
      semanticPath(skill, 'skill_use_finished'),
      reflection({ skills_read: [skill] }),
    ])

    expect(rows[0]).toEqual(expect.objectContaining({ status: 'pass' }))
  })

  test('summarizes empty, passing, and warning matrices', () => {
    let passing = traceConsistencyMatrix([
      passivePath(SKILL, 'skill_file_read'),
      semanticPath(SKILL, 'skill_use_started'),
      semanticPath(SKILL, 'skill_use_finished'),
      reflection({ skills_read: [SKILL] }),
    ])
    let warning = traceConsistencyMatrix([
      passivePath(SKILL, 'skill_file_read'),
      semanticPath(SKILL, 'skill_use_started'),
      reflection({ skills_read: [SKILL] }),
    ])

    expect(summarizeConsistencyMatrix([])).toBe('unknown')
    expect(summarizeConsistencyMatrix(passing)).toBe('pass')
    expect(summarizeConsistencyMatrix(warning)).toBe('warning')
  })
})

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

function providerPath(skill_path: string, event_type: string) {
  return {
    source: 'provider_history',
    event_type,
    skill_path,
  }
}

function reflection(data: Record<string, any>) {
  return {
    source: 'mcp_semantic_logger',
    event_type: 'run_reflection_declared',
    timestamp: '2026-06-24T00:00:00Z',
    payload: { data },
  }
}
