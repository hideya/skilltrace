import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import { providerHistoryBatchSchema } from '../../../app/models/.server/trace'
import {
  collectGeminiProviderHistory,
  parseGeminiProviderHistory,
} from './gemini'

const FIXTURE_ROOT = path.resolve('examples/type-fix-demo')
let temporaryDirectories: string[] = []

afterEach(() => {
  for (let directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
  temporaryDirectories = []
})

describe('Gemini CLI provider history adapter', () => {
  test('projects structured reads, edits, outcomes, and verification', () => {
    let result = parseFixture()

    expect(result.sessionId).toBe('gemini-session-1')
    expect(result.model).toBe('gemini-3.5-flash')
    expect(result.lastUpdated).toBe('2026-07-20T10:02:00.000Z')
    expect(result.evidenceCount).toBe(2)
    expect(result.operationCount).toBe(5)
    expect(result.operationCounts).toEqual({
      file_read: 2,
      file_edit: 1,
      typecheck: 2,
    })
    expect(result.circularCallCount).toBe(1)
    expect(result.unsupportedCallCount).toBe(0)
    expect(result.duplicateCallCount).toBe(1)
    expect(result.recognizedRecordCount).toBe(6)
    expect(result.intentionallyIgnoredRecordCount).toBe(4)
    expect(result.toolCallRecordCount).toBe(9)

    expect(
      result.events.map((event) => ({
        type: event.event_type,
        path: event.skill?.path,
        artifacts: event.artifact_refs,
        outcome: event.payload.outcome,
      })),
    ).toEqual([
      {
        type: 'skill_file_read',
        path: '.agents/skills/type-fix/SKILL.md',
        artifacts: undefined,
        outcome: 'success',
      },
      {
        type: 'skill_reference_read',
        path: '.agents/skills/type-fix/references/checklist.md',
        artifacts: undefined,
        outcome: 'success',
      },
      {
        type: 'execution_operation_observed',
        path: undefined,
        artifacts: ['.agents/skills/type-fix/references/missing.md'],
        outcome: 'failed',
      },
      {
        type: 'execution_operation_observed',
        path: undefined,
        artifacts: ['src/profile.ts'],
        outcome: 'success',
      },
      {
        type: 'execution_operation_observed',
        path: undefined,
        artifacts: ['src/profile.ts'],
        outcome: 'success',
      },
      {
        type: 'execution_operation_observed',
        path: undefined,
        artifacts: [],
        outcome: 'failed',
      },
      {
        type: 'execution_operation_observed',
        path: undefined,
        artifacts: [],
        outcome: 'success',
      },
    ])

    let reference = result.events.find(
      (event) => event.event_type === 'skill_reference_read',
    )
    expect(reference?.payload).toMatchObject({
      provider: 'gemini_cli',
      tool_name: 'read_file',
      evidence_kind: 'direct_file_read',
      command_classifier: 'gemini_read_file',
      confidence: 'high',
      outcome: 'success',
    })

    let activation = result.events.find(
      (event) =>
        event.payload.command_classifier === 'gemini_activate_skill',
    )
    expect(activation).toMatchObject({
      event_type: 'skill_file_read',
      skill: {
        name: 'type-fix',
        path: '.agents/skills/type-fix/SKILL.md',
      },
      payload: {
        provider: 'gemini_cli',
        tool_name: 'activate_skill',
        evidence_kind: 'direct_skill_activation',
        confidence: 'high',
        outcome: 'success',
      },
    })

    let edit = result.events.find(
      (event) => event.payload.command_classifier === 'gemini_replace',
    )
    expect(edit?.payload).toMatchObject({
      operation_kind: 'file_edit',
      outcome: 'success',
      evidence_status: 'context_only',
    })
  })

  test('projects Gemini execution configuration', () => {
    expect(parseFixture().providerEnvironment).toEqual({
      provider: 'gemini_cli',
      client: 'Gemini CLI',
      model: 'gemini-3.5-flash',
      working_directory: FIXTURE_ROOT,
      workspace_scope: 'target_root',
      session_kind: 'main',
    })
  })

  test('does not project private provider content or snapshots', () => {
    let projected = JSON.stringify(parseFixture())

    for (let canary of [
      'USER_MESSAGE_PRIVATE_CANARY',
      'PRIVATE_RESPONSE_CANARY',
      'PRIVATE_REASONING_CANARY',
      'PRIVATE_ACTIVATION_DESCRIPTION_CANARY',
      'PRIVATE_READ_DESCRIPTION_CANARY',
      'PRIVATE_SKILL_CONTENT_CANARY',
      'PRIVATE_SKILL_DISPLAY_CANARY',
      'PRIVATE_REFERENCE_CONTENT_CANARY',
      'PRIVATE_READ_ERROR_CANARY',
      'PRIVATE_SOURCE_CONTENT_CANARY',
      'PRIVATE_OLD_STRING_CANARY',
      'PRIVATE_NEW_STRING_CANARY',
      'PRIVATE_EDIT_INSTRUCTION_CANARY',
      'PRIVATE_EDIT_RESULT_CANARY',
      'PRIVATE_EDIT_DISPLAY_CANARY',
      'PRIVATE_SHELL_COMMAND_CANARY',
      'PRIVATE_SHELL_DESCRIPTION_CANARY',
      'PRIVATE_TYPECHECK_FAILURE_CANARY',
      'PRIVATE_STDERR_CANARY',
      'PRIVATE_STDOUT_CANARY',
      'PRIVATE_DIRECTORY_QUERY_CANARY',
      'PRIVATE_DIRECTORY_RESULT_CANARY',
      'PRIVATE_SEMANTIC_SUMMARY_CANARY',
      'PRIVATE_MCP_RESULT_CANARY',
      'PRIVATE_DUPLICATE_RESULT_CANARY',
      'PRIVATE_SNAPSHOT_CANARY',
      'SNAPSHOT_PATH_CANARY',
      'PRIVATE_SNAPSHOT_RESULT_CANARY',
    ]) {
      expect(projected).not.toContain(canary)
    }
  })

  test('matches the server-side normalized event contract', () => {
    let result = providerHistoryBatchSchema.safeParse({
      run_id: 'demo-run',
      events: parseFixture().events,
    })

    expect(result.success).toBe(true)
  })

  test('discovers an exact project session using the run ID', async () => {
    let geminiHome = fixtureGeminiHome(fixtureText())
    let result = await collectGeminiProviderHistory({
      ...runOptions(),
      geminiHome,
      stabilityIntervalMs: 1,
      stabilityAttempts: 3,
    })

    expect(result.status).toBe('collected')
    expect(result.summary).toMatchObject({
      provider: 'gemini_cli',
      match_confidence: 'high',
      completeness: 'stable_at_stop',
      candidate_count: 1,
      source_stable: true,
      provider_last_updated: '2026-07-20T10:02:00.000Z',
      provider_environment: {
        client: 'Gemini CLI',
        model: 'gemini-3.5-flash',
        session_kind: 'main',
      },
    })
    expect(result.events).toHaveLength(7)
  })

  test('fails closed when exact project sessions are ambiguous', async () => {
    let geminiHome = fixtureGeminiHome(fixtureText())
    let chats = fixtureChatsDirectory(geminiHome)
    fs.writeFileSync(path.join(chats, 'second-session.jsonl'), fixtureText())

    let result = await collectGeminiProviderHistory({
      ...runOptions(),
      geminiHome,
      stabilityIntervalMs: 1,
      stabilityAttempts: 3,
    })

    expect(result.status).toBe('ambiguous')
    expect(result.events).toEqual([])
    expect(result.summary).toMatchObject({
      match_confidence: 'unknown',
      candidate_count: 2,
      warnings: ['multiple_run_id_matches'],
    })
  })
})

function parseFixture() {
  return parseGeminiProviderHistory(fixtureText(), {
    ...runOptions(),
    matchConfidence: 'high',
  })
}

function runOptions() {
  return {
    runId: 'demo-run',
    targetRoot: FIXTURE_ROOT,
    skillRoots: [path.join(FIXTURE_ROOT, '.agents/skills')],
    startedAt: '2026-07-20T10:00:00.000Z',
    stoppedAt: '2026-07-20T10:05:00.000Z',
  }
}

function fixtureText() {
  return fs
    .readFileSync(
      new URL('./fixtures/gemini-session.jsonl', import.meta.url),
      'utf8',
    )
    .replaceAll('/workspace/demo', FIXTURE_ROOT)
}

function fixtureGeminiHome(text: string) {
  let directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skilltrace-gemini-'))
  temporaryDirectories.push(directory)
  let project = path.join(directory, 'tmp', 'fixture-project')
  let chats = path.join(project, 'chats')
  fs.mkdirSync(chats, { recursive: true })
  fs.writeFileSync(path.join(project, '.project_root'), `${FIXTURE_ROOT}\n`)
  fs.writeFileSync(path.join(chats, 'gemini-session-1.jsonl'), text)
  return directory
}

function fixtureChatsDirectory(geminiHome: string) {
  return path.join(geminiHome, 'tmp', 'fixture-project', 'chats')
}
