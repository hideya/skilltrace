import { describe, expect, test } from 'vitest'
import {
  comparisonRows,
  passiveEventSchema,
  providerHistoryBatchSchema,
  runLifecycleResult,
  semanticEventSchema,
} from './trace'

describe('passiveEventSchema', () => {
  test('accepts a passive skill file event', () => {
    let result = passiveEventSchema.safeParse({
      run_id: 'run_manual_001',
      event_type: 'skill_file_read',
      timestamp: '2026-06-18T12:00:00Z',
      skill: {
        name: 'pr-review',
        version: '0.1.0',
        path: 'skills/pr-review/SKILL.md',
        file_hash: 'sha256:test',
      },
      artifact_refs: ['artifact_001'],
      payload: {
        observer: 'manual_curl_test',
      },
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.run_id).toBe('run_manual_001')
    expect(result.data.skill?.name).toBe('pr-review')
    expect(result.data.payload?.observer).toBe('manual_curl_test')
  })

  test('requires run_id', () => {
    let result = passiveEventSchema.safeParse({
      event_type: 'skill_file_read',
    })

    expect(result.success).toBe(false)
  })

  test('requires event_type', () => {
    let result = passiveEventSchema.safeParse({
      run_id: 'run_manual_001',
    })

    expect(result.success).toBe(false)
  })

  test('rejects invalid timestamps', () => {
    let result = passiveEventSchema.safeParse({
      run_id: 'run_manual_001',
      event_type: 'skill_file_read',
      timestamp: 'not a date',
    })

    expect(result.success).toBe(false)
  })

  test('allows minimal valid input', () => {
    let result = passiveEventSchema.safeParse({
      run_id: 'run_manual_001',
      event_type: 'artifact_read',
    })

    expect(result.success).toBe(true)
  })
})

describe('semanticEventSchema', () => {
  test('accepts a semantic skill use event', () => {
    let result = semanticEventSchema.safeParse({
      run_id: 'run_manual_001',
      event_type: 'skill_use_started',
      timestamp: '2026-06-18T12:00:00Z',
      skill: {
        name: 'pr-review',
        version: '0.1.0',
        file_hash: 'sha256:test',
      },
      summary: 'Using pr-review because the task asks for review.',
      confidence: 'medium',
      related_artifacts: ['artifact_001'],
      data: {
        why_applicable: ['user asked for review'],
        assumptions: ['diff is complete'],
      },
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.event_type).toBe('skill_use_started')
    expect(result.data.skill?.name).toBe('pr-review')
    expect(result.data.data?.confidence).toBeUndefined()
  })

  test('requires run_id', () => {
    let result = semanticEventSchema.safeParse({
      event_type: 'skill_use_started',
    })

    expect(result.success).toBe(false)
  })

  test('requires event_type', () => {
    let result = semanticEventSchema.safeParse({
      run_id: 'run_manual_001',
    })

    expect(result.success).toBe(false)
  })

  test('rejects invalid timestamps', () => {
    let result = semanticEventSchema.safeParse({
      run_id: 'run_manual_001',
      event_type: 'skill_use_started',
      timestamp: 'not a date',
    })

    expect(result.success).toBe(false)
  })

  test('allows minimal valid input', () => {
    let result = semanticEventSchema.safeParse({
      run_id: 'run_manual_001',
      event_type: 'skill_use_finished',
    })

    expect(result.success).toBe(true)
  })
})

describe('providerHistoryBatchSchema', () => {
  test('accepts normalized provider events', () => {
    let result = providerHistoryBatchSchema.safeParse({
      run_id: 'run_manual_001',
      events: [
        {
          event_type: 'skill_file_read',
          timestamp: '2026-07-20T10:01:00Z',
          skill: {
            name: 'type-fix',
            path: '.agents/skills/type-fix/SKILL.md',
          },
          payload: {
            provider: 'codex',
            provider_session_id: 'codex-session-1',
            tool_name: 'exec_command',
            tool_call_id: 'call-read',
            outcome: 'success',
            evidence_kind: 'shell_content_read',
            command_classifier: 'cat',
            confidence: 'medium',
            extraction_method: 'direct_envelope',
            extraction_confidence: 'high',
            match_confidence: 'high',
            format: 'codex_rollout_jsonl_v1',
            source_record_index: 3,
            source_fingerprint: `sha256:${'a'.repeat(64)}`,
          },
        },
      ],
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.events[0].payload.outcome).toBe('success')
  })

  test('rejects arbitrary provider event types', () => {
    let result = providerHistoryBatchSchema.safeParse({
      run_id: 'run_manual_001',
      events: [
        {
          event_type: 'raw_transcript',
          payload: {
            provider: 'codex',
            provider_session_id: 'codex-session-1',
            tool_name: 'exec_command',
            tool_call_id: 'call-read',
            outcome: 'success',
            command_classifier: 'cat',
            match_confidence: 'high',
            format: 'codex_rollout_jsonl_v1',
            source_record_index: 3,
            source_fingerprint: `sha256:${'a'.repeat(64)}`,
          },
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  test('requires non-content provenance for every event', () => {
    let result = providerHistoryBatchSchema.safeParse({
      run_id: 'run_manual_001',
      events: [
        {
          event_type: 'execution_operation_observed',
          payload: {
            provider: 'codex',
            provider_session_id: 'codex-session-1',
            tool_name: 'exec_command',
            tool_call_id: 'call-check',
            outcome: 'success',
            operation_kind: 'test',
            command_classifier: 'pnpm_test',
            match_confidence: 'high',
            format: 'codex_rollout_jsonl_v1',
            source_record_index: 3,
          },
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  test('rejects non-allowlisted private payload fields', () => {
    let result = providerHistoryBatchSchema.safeParse({
      run_id: 'run_manual_001',
      events: [
        {
          event_type: 'execution_operation_observed',
          payload: {
            provider: 'codex',
            provider_session_id: 'codex-session-1',
            tool_name: 'exec_command',
            tool_call_id: 'call-check',
            outcome: 'success',
            operation_kind: 'test',
            command_classifier: 'pnpm_test',
            match_confidence: 'high',
            format: 'codex_rollout_jsonl_v1',
            source_record_index: 3,
            source_fingerprint: `sha256:${'a'.repeat(64)}`,
            raw_command: 'PRIVATE_COMMAND_CANARY',
          },
        },
      ],
    })

    expect(result.success).toBe(false)
  })
})

describe('runLifecycleResult', () => {
  test('defers event-only runs to consistency diagnosis', () => {
    let result = runLifecycleResult(
      {
        status: 'active',
        started_at: '2026-06-24T00:00:00Z',
      },
      [
        {
          event_type: 'skill_file_read',
          timestamp: '2026-06-24T00:00:00Z',
        },
      ],
      [],
    )

    expect(result).toBeNull()
  })

  test('shows active unsuperseded runs as running', () => {
    let result = runLifecycleResult(
      {
        status: 'active',
        started_at: '2026-06-24T00:00:00Z',
      },
      [
        {
          event_type: 'trace_session_started',
          timestamp: '2026-06-24T00:00:00Z',
        },
      ],
      [new Date('2026-06-24T00:00:00Z')],
    )

    expect(result).toBe('running')
  })

  test('defers finished runs to final consistency diagnosis', () => {
    let result = runLifecycleResult(
      {
        status: 'finished',
        started_at: '2026-06-24T00:00:00Z',
      },
      [
        {
          event_type: 'trace_session_started',
          timestamp: '2026-06-24T00:00:00Z',
        },
        {
          event_type: 'trace_session_finished',
          timestamp: '2026-06-24T00:10:00Z',
        },
      ],
      [
        new Date('2026-06-24T00:00:00Z'),
        new Date('2026-06-24T01:00:00Z'),
      ],
    )

    expect(result).toBeNull()
  })

  test('marks unstopped runs superseded by any newer session as incomplete', () => {
    let result = runLifecycleResult(
      {
        status: 'active',
        started_at: '2026-06-24T00:00:00Z',
      },
      [
        {
          event_type: 'trace_session_started',
          timestamp: '2026-06-24T00:00:00Z',
        },
      ],
      [
        new Date('2026-06-24T00:00:00Z'),
        new Date('2026-06-24T01:00:00Z'),
      ],
    )

    expect(result).toBe('incomplete')
  })
})

describe('comparisonRows', () => {
  test('shows an agent-log observation without aligning a missing mode', () => {
    let file = '.agents/skills/type-fix/SKILL.md'
    let rows = comparisonRows([
      comparisonRun('full', [
        comparisonRow(file, {
          provider: false,
          status: 'pass',
        }),
      ]),
      comparisonRun('passive_reflection', [
        comparisonRow(file, {
          passive: false,
          semantic: false,
          reflection: false,
          provider: true,
          status: 'provider_only',
        }),
      ]),
    ])

    expect(rows).toEqual([
      expect.objectContaining({
        status: 'different',
        modes: {
          full: expect.objectContaining({
            present: true,
            provider: false,
            provider_status: 'collected',
          }),
          passive_reflection: expect.objectContaining({
            present: false,
            provider: true,
            provider_status: 'collected',
          }),
        },
      }),
    ])
  })

  test('does not create cross-mode rows from agent logs alone', () => {
    let file = '.agents/skills/type-fix/SKILL.md'
    let runs = [
      comparisonRun('full', [
        comparisonRow(file, {
          passive: false,
          semantic: false,
          reflection: false,
          provider: true,
          status: 'provider_only',
        }),
      ]),
      comparisonRun('passive_only', [
        comparisonRow(file, {
          passive: false,
          semantic: false,
          reflection: false,
          provider: true,
          status: 'provider_only',
        }),
      ]),
    ]

    expect(comparisonRows(runs)).toEqual([])
  })
})

function comparisonRun(traceMode, matrix) {
  return {
    run: {},
    trace_mode: traceMode,
    result: 'pass',
    matrix,
    provider_status: 'collected',
    event_count: 0,
    started_at: '2026-07-23T00:00:00Z',
    finished_at: '2026-07-23T00:01:00Z',
  }
}

function comparisonRow(file, overrides) {
  return {
    kind: 'Skill',
    file,
    passive: true,
    semantic: true,
    semantic_started: true,
    semantic_finished: true,
    reflection: true,
    provider: false,
    provider_context: false,
    semantic_state: 'complete',
    passive_expected: true,
    semantic_expected: true,
    reflection_expected: true,
    issue_count: 0,
    status: 'pass',
    ...overrides,
  }
}
