import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import { providerHistoryBatchSchema } from '../../../app/models/.server/trace'
import {
  collectClaudeProviderHistory,
  parseClaudeProviderHistory,
} from './claude'

let temporaryDirectories: string[] = []

afterEach(() => {
  for (let directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
  temporaryDirectories = []
})

describe('Claude Code provider history adapter', () => {
  test('projects structured reads and file edits', () => {
    let result = parseFixture()

    expect(result.sessionId).toBe('claude-session-1')
    expect(result.clientVersion).toBe('2.1.198')
    expect(result.model).toBe('claude-sonnet-5')
    expect(result.evidenceCount).toBe(2)
    expect(result.operationCount).toBe(6)
    expect(result.operationCounts).toEqual({
      file_read: 2,
      file_edit: 2,
      typecheck: 2,
    })
    expect(result.circularCallCount).toBe(1)
    expect(result.unsupportedCallCount).toBe(0)
    expect(result.recognizedRecordCount).toBe(8)
    expect(result.intentionallyIgnoredRecordCount).toBe(2)
    expect(result.toolCallRecordCount).toBe(10)

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
        path: '.claude/skills/type-fix/SKILL.md',
        artifacts: undefined,
        outcome: 'success',
      },
      {
        type: 'skill_reference_read',
        path: '.claude/skills/type-fix/references/checklist.md',
        artifacts: undefined,
        outcome: 'success',
      },
      {
        type: 'execution_operation_observed',
        path: undefined,
        artifacts: ['.claude/skills/type-fix/references/missing.md'],
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
        artifacts: ['src/generated.ts'],
        outcome: 'failed',
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
      provider: 'claude_code',
      tool_name: 'Read',
      evidence_kind: 'direct_file_read',
      command_classifier: 'claude_read',
      confidence: 'high',
      sidechain: true,
    })

    let edit = result.events.find(
      (event) => event.payload.command_classifier === 'claude_edit',
    )
    expect(edit?.payload).toMatchObject({
      operation_kind: 'file_edit',
      outcome: 'success',
      duration_ms: 1000,
      evidence_status: 'context_only',
    })
  })

  test('projects Claude execution configuration', () => {
    expect(parseFixture().providerEnvironment).toEqual({
      provider: 'claude_code',
      client: 'Claude Code',
      client_version: '2.1.198',
      source: 'cli',
      model: 'claude-sonnet-5',
      working_directory: '/workspace/demo',
      permission_mode: 'default',
      workspace_scope: 'target_root',
    })
  })

  test('matches skill reads through a resolved profile alias', () => {
    let root = fs.mkdtempSync(path.join(os.tmpdir(), 'skilltrace-alias-'))
    temporaryDirectories.push(root)
    let skillRoot = path.join(root, '.agents/skills/type-fix')
    fs.mkdirSync(path.join(skillRoot, 'references'), { recursive: true })
    fs.writeFileSync(path.join(skillRoot, 'SKILL.md'), 'fixture skill\n')
    fs.writeFileSync(
      path.join(skillRoot, 'references/checklist.md'),
      'fixture reference\n',
    )
    fs.symlinkSync('.agents', path.join(root, '.claude'))
    let text = fixtureText()
      .replaceAll(
        '/workspace/demo/.claude/skills',
        `${root}/.agents/skills`,
      )
      .replaceAll('/workspace/demo', root)

    let result = parseClaudeProviderHistory(text, {
      ...runOptions(),
      targetRoot: root,
      skillRoots: [path.join(root, '.claude/skills')],
      matchConfidence: 'high',
    })

    expect(result.evidenceCount).toBe(2)
    expect(
      result.events
        .filter((event) => event.skill?.path)
        .map((event) => event.skill?.path),
    ).toEqual([
      '.agents/skills/type-fix/SKILL.md',
      '.agents/skills/type-fix/references/checklist.md',
    ])
  })

  test('does not project private provider content', () => {
    let projected = JSON.stringify(parseFixture())

    for (let canary of [
      'USER_MESSAGE_PRIVATE_CANARY',
      'PRIVATE_REASONING_CANARY',
      'PRIVATE_SKILL_CONTENT_CANARY',
      'PRIVATE_TOP_LEVEL_FILE_CANARY',
      'PRIVATE_SOURCE_CONTENT_CANARY',
      'PRIVATE_OLD_STRING_CANARY',
      'PRIVATE_NEW_STRING_CANARY',
      'PRIVATE_PATCH_CANARY',
      'PRIVATE_WRITE_BODY_CANARY',
      'PRIVATE_SEARCH_QUERY_CANARY',
      'PRIVATE_BASH_COMMAND_CANARY',
      'PRIVATE_BASH_DESCRIPTION_CANARY',
      'PRIVATE_TYPECHECK_FAILURE_CANARY',
      'PRIVATE_STDOUT_CANARY',
      'PRIVATE_STDERR_CANARY',
      'PRIVATE_SEMANTIC_SUMMARY_CANARY',
      'PRIVATE_SNAPSHOT_CANARY',
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
    let claudeHome = fixtureClaudeHome(fixtureText())
    let result = await collectClaudeProviderHistory({
      ...runOptions(),
      claudeHome,
      stabilityIntervalMs: 1,
      stabilityAttempts: 3,
    })

    expect(result.status).toBe('collected')
    expect(result.summary).toMatchObject({
      provider: 'claude_code',
      match_confidence: 'high',
      completeness: 'stable_at_stop',
      candidate_count: 1,
      source_stable: true,
      provider_environment: {
        client: 'Claude Code',
        client_version: '2.1.198',
        model: 'claude-sonnet-5',
        permission_mode: 'default',
      },
    })
    expect(result.events).toHaveLength(8)
  })

  test('fails closed when exact project sessions are ambiguous', async () => {
    let claudeHome = fixtureClaudeHome(fixtureText())
    let directory = fixtureProjectDirectory(claudeHome)
    fs.writeFileSync(
      path.join(directory, 'second-session.jsonl'),
      fixtureText(),
    )

    let result = await collectClaudeProviderHistory({
      ...runOptions(),
      claudeHome,
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
  return parseClaudeProviderHistory(fixtureText(), {
    ...runOptions(),
    matchConfidence: 'high',
  })
}

function runOptions() {
  return {
    runId: 'demo-run',
    targetRoot: '/workspace/demo',
    skillRoots: ['/workspace/demo/.claude/skills'],
    startedAt: '2026-07-20T10:00:00.000Z',
    stoppedAt: '2026-07-20T10:05:00.000Z',
  }
}

function fixtureText() {
  return fs.readFileSync(
    new URL('./fixtures/claude-session.jsonl', import.meta.url),
    'utf8',
  )
}

function fixtureClaudeHome(text: string) {
  let directory = fs.mkdtempSync(path.join(os.tmpdir(), 'skilltrace-claude-'))
  temporaryDirectories.push(directory)
  let projectDirectory = fixtureProjectDirectory(directory)
  fs.mkdirSync(projectDirectory, { recursive: true })
  fs.writeFileSync(path.join(projectDirectory, 'claude-session-1.jsonl'), text)
  return directory
}

function fixtureProjectDirectory(claudeHome: string) {
  return path.join(claudeHome, 'projects', '-workspace-demo')
}
