import { describe, expect, test } from 'vitest'
import { buildDogfoodRunId, runUrl } from './skilltrace-dogfood'

describe('skilltrace dogfood helpers', () => {
  test('builds stable timestamped run IDs', () => {
    let runId = buildDogfoodRunId(new Date('2026-06-18T09:30:45Z'))

    expect(runId).toBe('run_fixture_pr_review_20260618_093045')
  })

  test('builds run detail URLs', () => {
    expect(runUrl('http://localhost:5173', 'run_fixture_001')).toBe(
      'http://localhost:5173/app/runs/run_fixture_001',
    )
  })
})
