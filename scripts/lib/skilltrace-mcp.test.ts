import { describe, expect, test } from 'vitest'
import {
  buildMcpSkillLogEvent,
  mcpRunId,
  skillTraceServerUrl,
  timestampId,
} from './skilltrace-mcp'

describe('skilltrace MCP helpers', () => {
  test('builds a semantic log event from MCP input', () => {
    let event = buildMcpSkillLogEvent(
      {
        event_type: 'skill_use_started',
        skill_name: 'pr-review',
        skill_version: '0.1.0',
        summary: 'Using PR review fixture.',
        confidence: 'medium',
        related_artifacts: ['artifact_001'],
        data: {
          why_applicable: 'manual test',
        },
      },
      { runId: 'run_fixture_001' },
    )

    expect(event.run_id).toBe('run_fixture_001')
    expect(event.event_type).toBe('skill_use_started')
    expect(event.skill.name).toBe('pr-review')
    expect(event.summary).toBe('Using PR review fixture.')
    expect(event.data.why_applicable).toBe('manual test')
  })

  test('prefers explicit run_id over environment run ID', () => {
    let event = buildMcpSkillLogEvent(
      {
        run_id: 'run_explicit',
        event_type: 'skill_use_finished',
      },
      { runId: 'run_env' },
    )

    expect(event.run_id).toBe('run_explicit')
  })

  test('requires a run ID', () => {
    expect(() =>
      buildMcpSkillLogEvent({ event_type: 'skill_use_started' }, {}),
    ).toThrow('Missing run_id, SKILLTRACE_RUN_ID, or SKILLTRACE_RUN_STEM')
  })

  test('uses localhost as the default server', () => {
    expect(skillTraceServerUrl({})).toBe('http://localhost:5173')
  })

  test('builds a timestamped MCP run ID from a stem', () => {
    let runId = mcpRunId(
      { runStem: 'run_agent_sandbox_type_fix' },
      new Date('2026-06-19T00:15:30Z'),
    )

    expect(runId).toBe('run_agent_sandbox_type_fix_20260619_001530')
  })

  test('prefers fixed run ID over run stem', () => {
    let runId = mcpRunId(
      {
        runId: 'run_fixed',
        runStem: 'run_agent_sandbox_type_fix',
      },
      new Date('2026-06-19T00:15:30Z'),
    )

    expect(runId).toBe('run_fixed')
  })

  test('prefers session run ID over run stem', () => {
    let runId = mcpRunId(
      {
        sessionRunId: 'run_session',
        runStem: 'run_agent_sandbox_type_fix',
      },
      new Date('2026-06-19T00:15:30Z'),
    )

    expect(runId).toBe('run_session')
  })

  test('formats timestamps for run IDs', () => {
    expect(timestampId(new Date('2026-06-19T00:15:30.123Z'))).toBe(
      '20260619_001530',
    )
  })
})
