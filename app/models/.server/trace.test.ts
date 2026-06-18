import { describe, expect, test } from 'vitest'
import { passiveEventSchema } from './trace'

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
