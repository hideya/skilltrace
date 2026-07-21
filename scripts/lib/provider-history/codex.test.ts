import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import { providerHistoryBatchSchema } from '../../../app/models/.server/trace'
import { collectCodexProviderHistory, parseCodexProviderHistory } from './codex'

let temporaryDirectories: string[] = []

afterEach(() => {
  for (let directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
  temporaryDirectories = []
})

describe('Codex provider history adapter', () => {
  test('projects skill reads and verification outcomes', () => {
    let result = parseFixture()

    expect(result.sessionId).toBe('codex-session-1')
    expect(result.clientVersion).toBe('0.143.0')
    expect(result.model).toBe('gpt-5-codex')
    expect(result.completeness).toBe('explicit_aborted')
    expect(result.circularCallCount).toBe(1)
    expect(result.evidenceCount).toBe(2)
    expect(result.operationCount).toBe(1)
    expect(result.operationCounts).toEqual({ typecheck: 1 })

    expect(
      result.events.map((event) => ({
        type: event.event_type,
        path: event.skill?.path,
      })),
    ).toEqual([
      {
        type: 'skill_file_read',
        path: '.agents/skills/type-fix/SKILL.md',
      },
      {
        type: 'skill_reference_read',
        path: '.agents/skills/type-fix/references/checklist.md',
      },
      {
        type: 'execution_operation_observed',
        path: undefined,
      },
    ])

    let operation = result.events.find(
      (event) => event.event_type === 'execution_operation_observed',
    )
    expect(operation?.payload).toMatchObject({
      operation_kind: 'typecheck',
      command_classifier: 'pnpm_tsc',
      outcome: 'failed',
      exit_code: 1,
      duration_ms: 2000,
    })
  })

  test('does not project private provider content', () => {
    let projected = JSON.stringify(parseFixture())

    expect(projected).not.toContain('USER_MESSAGE_PRIVATE_CANARY')
    expect(projected).not.toContain('PRIVATE_REASONING_CANARY')
    expect(projected).not.toContain('PRIVATE_TOOL_OUTPUT_CANARY')
    expect(projected).not.toContain('PRIVATE_TYPECHECK_OUTPUT_CANARY')
    expect(projected).not.toContain('PRIVATE_ABORT_REASON_CANARY')
    expect(projected).not.toContain('SESSION_META_PRIVATE_CANARY')
    expect(projected).not.toContain('cat .agents')
    expect(projected).not.toContain('pnpm tsc')
  })

  test('matches the server-side normalized event contract', () => {
    let result = providerHistoryBatchSchema.safeParse({
      run_id: 'demo-run',
      events: parseFixture().events,
    })

    expect(result.success).toBe(true)
  })

  test('does not treat write destinations or in-place edits as reads', () => {
    let result = parseFixture()
    let reads = result.events.filter((event) =>
      ['skill_file_read', 'skill_reference_read'].includes(event.event_type),
    )

    expect(reads).toHaveLength(2)
  })

  test('recognizes scoped package verification scripts', () => {
    let result = parseCodexProviderHistory(
      fixtureText().replace('pnpm tsc', 'pnpm test:unit'),
      {
        ...runOptions(),
        matchConfidence: 'high',
      },
    )
    let operation = result.events.find(
      (event) => event.event_type === 'execution_operation_observed',
    )

    expect(operation?.payload).toMatchObject({
      operation_kind: 'test',
      command_classifier: 'pnpm_test_unit',
    })
  })

  test('discovers one exact-directory session without requiring a run ID', async () => {
    let codexHome = fixtureCodexHome(
      fixtureText().replace('demo-run', 'other-run'),
    )
    let result = await collectCodexProviderHistory({
      ...runOptions(),
      codexHome,
      stabilityIntervalMs: 1,
      stabilityAttempts: 3,
    })

    expect(result.status).toBe('collected')
    expect(result.summary).toMatchObject({
      match_confidence: 'medium',
      candidate_count: 1,
      source_stable: true,
    })
    expect(result.events).toHaveLength(3)
  })

  test('fails closed when same-directory candidates are ambiguous', async () => {
    let text = fixtureText().replace('demo-run', 'other-run')
    let codexHome = fixtureCodexHome(text)
    let directory = fixtureSessionDirectory(codexHome)
    fs.writeFileSync(path.join(directory, 'rollout-second.jsonl'), text)

    let result = await collectCodexProviderHistory({
      ...runOptions(),
      codexHome,
      stabilityIntervalMs: 1,
      stabilityAttempts: 3,
    })

    expect(result.status).toBe('ambiguous')
    expect(result.events).toEqual([])
    expect(result.summary).toMatchObject({
      match_confidence: 'unknown',
      candidate_count: 2,
      warnings: ['multiple_time_and_cwd_matches'],
    })
  })

  test('fails closed when required Codex provenance is missing', async () => {
    let text = fixtureText().replace('"id":"codex-session-1",', '')
    let codexHome = fixtureCodexHome(text)
    let result = await collectCodexProviderHistory({
      ...runOptions(),
      codexHome,
      stabilityIntervalMs: 1,
      stabilityAttempts: 3,
    })

    expect(result.status).toBe('unsupported_format')
    expect(result.events).toEqual([])
    expect(result.summary).toMatchObject({
      warnings: ['missing_provider_session_id'],
    })
  })
})

function parseFixture() {
  return parseCodexProviderHistory(fixtureText(), {
    ...runOptions(),
    matchConfidence: 'high',
  })
}

function runOptions() {
  return {
    runId: 'demo-run',
    targetRoot: '/workspace/demo',
    skillRoots: ['/workspace/demo/.agents/skills'],
    startedAt: '2026-07-20T10:00:00.000Z',
    stoppedAt: '2026-07-20T10:05:00.000Z',
  }
}

function fixtureText() {
  return fs.readFileSync(
    new URL('./fixtures/codex-rollout.jsonl', import.meta.url),
    'utf8',
  )
}

function fixtureCodexHome(text: string) {
  let directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skilltrace-codex-'))
  temporaryDirectories.push(directory)
  let sessionDirectory = fixtureSessionDirectory(directory)
  fs.mkdirSync(sessionDirectory, { recursive: true })
  fs.writeFileSync(path.join(sessionDirectory, 'rollout-test.jsonl'), text)
  return directory
}

function fixtureSessionDirectory(codexHome: string) {
  return path.join(codexHome, 'sessions', '2026', '07', '20')
}
