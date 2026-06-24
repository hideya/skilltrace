import { describe, expect, test } from 'vitest'
import {
  buildMcpSkillLogEvent,
  buildMcpSkillTraceContextEvent,
  buildMcpSkillTraceReflectionEvent,
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

  test('builds a run context event from MCP input', () => {
    let event = buildMcpSkillTraceContextEvent(
      {
        agent: 'codex',
        model: 'gpt-5-codex',
        client: 'Codex CLI',
        cwd: '/tmp/repo',
        task_summary: 'Repair TypeScript errors.',
        data: {
          mode: 'dogfood',
        },
      },
      { runId: 'run_fixture_001' },
    )

    expect(event.run_id).toBe('run_fixture_001')
    expect(event.event_type).toBe('run_context_declared')
    expect(event.summary).toBe('Repair TypeScript errors.')
    expect(event.data.agent).toBe('codex')
    expect(event.data.model).toBe('gpt-5-codex')
    expect(event.data.mode).toBe('dogfood')
  })

  test('builds a run reflection event from MCP input', () => {
    let event = buildMcpSkillTraceReflectionEvent(
      {
        task_outcome: 'completed',
        skills_used: ['type-fix'],
        skills_read: ['.skills/type-fix/SKILL.md'],
        references_read: ['.skills/type-fix/references/checklist.md'],
        files_believed_to_influence_work: [
          '.skills/type-fix/SKILL.md',
          '.skills/type-fix/references/checklist.md',
        ],
        file_usage_uncertainties: [],
        steps_followed: ['declared context', 'fixed source issues'],
        steps_skipped_or_delayed: [
          {
            step: 'read checklist before editing',
            reason: 'read after initial diagnostics',
          },
        ],
        uncertainties: ['model identity was self-declared'],
        instrumentation_notes: ['called context, started, finished, and reflection tools'],
        recommended_skill_changes: ['clarify checklist path'],
        summary: 'Completed task with aligned trace events.',
      },
      { runId: 'run_fixture_001' },
    )

    expect(event.run_id).toBe('run_fixture_001')
    expect(event.event_type).toBe('run_reflection_declared')
    expect(event.summary).toBe('Completed task with aligned trace events.')
    expect(event.data.task_outcome).toBe('completed')
    expect(event.data.skills_used).toEqual(['type-fix'])
    expect(event.data.skills_read).toEqual(['.skills/type-fix/SKILL.md'])
    expect(event.data.references_read).toEqual([
      '.skills/type-fix/references/checklist.md',
    ])
    expect(event.data.files_believed_to_influence_work).toEqual([
      '.skills/type-fix/SKILL.md',
      '.skills/type-fix/references/checklist.md',
    ])
    expect(event.data.instrumentation_notes).toEqual([
      'called context, started, finished, and reflection tools',
    ])
    expect(event.data.steps_skipped_or_delayed).toEqual([
      {
        step: 'read checklist before editing',
        reason: 'read after initial diagnostics',
      },
    ])
  })

  test('requires a run ID', () => {
    expect(() =>
      buildMcpSkillLogEvent({ event_type: 'skill_use_started' }, {}),
    ).toThrow('Missing run_id, SKILLTRACE_RUN_ID, or SKILLTRACE_RUN_STEM')
  })

  test('uses localhost as the default server', () => {
    expect(skillTraceServerUrl({})).toBe('http://localhost:7555')
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
