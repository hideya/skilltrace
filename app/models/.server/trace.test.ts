import { describe, expect, test } from 'vitest'
import {
  passiveEventSchema,
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
