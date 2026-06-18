import { describe, expect, test } from 'vitest'
import {
  buildDemoEvents,
  buildDemoRunId,
  demoRunCases,
  runUrl,
} from './skilltrace-demo'

describe('skilltrace demo helpers', () => {
  test('builds stable timestamped run IDs', () => {
    let runId = buildDemoRunId(new Date('2026-06-18T09:30:45Z'))

    expect(runId).toBe('run_fixture_pr_review_20260618_093045')
  })

  test('builds run detail URLs', () => {
    expect(runUrl('http://localhost:5173', 'run_fixture_001')).toBe(
      'http://localhost:5173/app/runs/run_fixture_001',
    )
  })

  test('builds pass and warning run cases by default', () => {
    expect(demoRunCases('both', 'run_fixture_pr_review_demo')).toEqual([
      {
        label: 'Pass run',
        runId: 'run_fixture_pr_review_demo_pass',
        caseName: 'pass',
      },
      {
        label: 'Warning run',
        runId: 'run_fixture_pr_review_demo_warning',
        caseName: 'warning',
      },
    ])
  })

  test('builds warning events without semantic declarations', () => {
    let events = buildDemoEvents({
      runId: 'run_fixture_pr_review_demo_warning',
      caseName: 'warning',
    })

    expect(events.map((event) => event.event_type)).toEqual([
      'skill_file_read',
      'skill_reference_read',
    ])
  })
})
