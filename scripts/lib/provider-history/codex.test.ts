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

  test('projects bounded static calls from the program-like exec envelope', () => {
    let result = parseCodexProviderHistory(customExecFixture(), {
      ...runOptions(),
      matchConfidence: 'high',
    })

    expect(result.model).toBe('gpt-5.6')
    expect(result.evidenceCount).toBe(1)
    expect(result.operationCount).toBe(3)
    expect(result.operationCounts).toEqual({
      typecheck: 1,
      file_edit: 1,
      lint: 1,
    })
    expect(result.circularCallCount).toBe(1)
    expect(result.unsupportedCallCount).toBe(2)
    expect(result.recognizedRecordCount).toBe(3)
    expect(result.partiallyExtractedRecordCount).toBe(1)
    expect(result.unsupportedRecordCount).toBe(1)
    expect(result.intentionallyIgnoredRecordCount).toBe(1)
    expect(result.extractionMethodCounts).toEqual({
      static_js: 3,
      direct_envelope: 2,
    })

    let read = result.events.find(
      (event) => event.event_type === 'skill_file_read',
    )
    expect(read).toMatchObject({
      skill: { path: '.agents/skills/type-fix/SKILL.md' },
      payload: {
        parent_tool_call_id: 'outer-read',
        tool_call_id: 'outer-read:nested:0',
        outcome: 'success',
        extraction_method: 'static_js',
        extraction_confidence: 'medium',
      },
    })

    let edit = result.events.find(
      (event) => event.payload.operation_kind === 'file_edit',
    )
    expect(edit).toMatchObject({
      artifact_refs: ['src/example.ts'],
      payload: {
        parent_tool_call_id: 'outer-multi',
        outcome: 'unknown',
        command_classifier: 'apply_patch',
        evidence_status: 'context_only',
      },
    })
    let typecheck = result.events.find(
      (event) =>
        event.payload.operation_kind === 'typecheck' &&
        event.payload.parent_tool_call_id === 'outer-multi',
    )
    expect(typecheck?.payload).toMatchObject({
      outcome: 'success',
      exit_code: 0,
    })
    expect(typecheck?.payload.duration_ms).toBeUndefined()
    expect(
      providerHistoryBatchSchema.safeParse({
        run_id: 'demo-run',
        events: result.events,
      }).success,
    ).toBe(true)
  })

  test('does not retain custom JavaScript, patch bodies, or tool output', () => {
    let projected = JSON.stringify(
      parseCodexProviderHistory(customExecFixture(), {
        ...runOptions(),
        matchConfidence: 'high',
      }),
    )

    expect(projected).not.toContain('CUSTOM_JS_PRIVATE_CANARY')
    expect(projected).not.toContain('CUSTOM_OUTPUT_PRIVATE_CANARY')
    expect(projected).not.toContain('PATCH_BODY_PRIVATE_CANARY')
    expect(projected).not.toContain('pnpm tsc')
    expect(projected).not.toContain('tools.exec_command')
  })

  test('projects provider execution configuration and tracks setting changes', () => {
    let result = parseCodexProviderHistory(providerEnvironmentFixture(), {
      ...runOptions(),
      matchConfidence: 'high',
    })

    expect(result.model).toBe('gpt-5.7')
    expect(result.providerEnvironment).toEqual({
      provider: 'codex',
      client: 'codex-tui',
      client_version: '0.143.0',
      source: 'cli',
      model_provider: 'openai',
      model: 'gpt-5.6',
      working_directory: '/workspace/demo',
      approval_policy: 'on-request',
      sandbox: 'workspace-write',
      permission_profile: 'managed',
      file_system_policy: 'restricted',
      network_policy: 'restricted',
      network_access: false,
      reasoning_effort: 'low',
      personality: 'pragmatic',
      collaboration_mode: 'default',
      multi_agent_mode: 'explicitRequestOnly',
      multi_agent_version: 'v2',
      effective_date: '2026-07-20',
      timezone: 'Asia/Tokyo',
      workspace_scope: 'target_root',
      changed_fields: [
        'model',
        'network_access',
        'reasoning_effort',
        'workspace_scope',
      ],
    })

    let projected = JSON.stringify(result)
    expect(projected).not.toContain('PRIVATE_BASE_INSTRUCTIONS_CANARY')
    expect(projected).not.toContain('PRIVATE_SUMMARY_CANARY')
    expect(projected).not.toContain('PRIVATE_DEVELOPER_INSTRUCTIONS_CANARY')
    expect(projected).not.toContain('PRIVATE_WORKSPACE_ROOT_CANARY')
    expect(projected).not.toContain('PRIVATE_WORLD_STATE_CANARY')
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
      provider_environment: {
        provider: 'codex',
        client_version: '0.143.0',
        source: 'cli',
        model: 'gpt-5-codex',
        working_directory: '/workspace/demo',
      },
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

function customExecFixture() {
  let rows = [
    {
      timestamp: '2026-07-20T10:00:05.000Z',
      type: 'session_meta',
      payload: {
        id: 'codex-custom-session-1',
        cwd: '/workspace/demo',
        cli_version: '0.143.0',
      },
    },
    {
      timestamp: '2026-07-20T10:00:06.000Z',
      type: 'turn_context',
      payload: { cwd: '/workspace/demo', model: 'gpt-5.6' },
    },
    {
      timestamp: '2026-07-20T10:01:00.000Z',
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        name: 'exec',
        call_id: 'outer-read',
        input: [
          "const note = 'CUSTOM_JS_PRIVATE_CANARY tools.apply_patch()'",
          "const args = { cmd: 'cat .agents/skills/type-fix/SKILL.md', workdir: '/workspace/demo' }",
          'const result = await tools.exec_command(args)',
          'text(result.output)',
        ].join('\n'),
      },
    },
    {
      timestamp: '2026-07-20T10:01:01.000Z',
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'outer-read',
        output: {
          exit_code: 0,
          output: 'CUSTOM_OUTPUT_PRIVATE_CANARY',
        },
      },
    },
    {
      timestamp: '2026-07-20T10:02:00.000Z',
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        name: 'exec',
        call_id: 'outer-multi',
        input: [
          "const patch = '*** Begin Patch\\n*** Update File: src/example.ts\\n@@\\n-PATCH_BODY_PRIVATE_CANARY\\n+changed\\n*** End Patch'",
          'const results = await Promise.all([',
          "  tools.exec_command({ cmd: 'pnpm tsc', workdir: '/workspace/demo' }),",
          '  tools.apply_patch(patch),',
          "  tools.mcp__skilltrace__skill_trace_context({ run_id: 'demo-run' }),",
          '])',
          'text(results.length)',
        ].join('\n'),
      },
    },
    {
      timestamp: '2026-07-20T10:02:02.000Z',
      type: 'response_item',
      payload: {
        type: 'custom_tool_call_output',
        call_id: 'outer-multi',
        output: {
          exit_code: 0,
          output: 'CUSTOM_OUTPUT_PRIVATE_CANARY',
        },
      },
    },
    {
      timestamp: '2026-07-20T10:03:00.000Z',
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        name: 'exec',
        call_id: 'outer-partial',
        input: [
          "const args = { cmd: 'pnpm lint', workdir: '/workspace/demo' }",
          'await tools.exec_command(args)',
          'await tools.exec_command(makeArgs())',
        ].join('\n'),
      },
    },
    {
      timestamp: '2026-07-20T10:03:20.000Z',
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'wait',
        call_id: 'call-wait',
        arguments: '{"cell_id":"cell-1"}',
      },
    },
    {
      timestamp: '2026-07-20T10:03:30.000Z',
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        name: 'unknown_tool',
        call_id: 'call-unknown',
        input: 'CUSTOM_JS_PRIVATE_CANARY',
      },
    },
  ]

  return rows.map((row) => JSON.stringify(row)).join('\n')
}

function providerEnvironmentFixture() {
  let firstContext = {
    cwd: '/workspace/demo',
    model: 'gpt-5.6',
    approval_policy: 'on-request',
    sandbox_policy: {
      type: 'workspace-write',
      network_access: false,
    },
    permission_profile: {
      type: 'managed',
      file_system: {
        type: 'restricted',
        roots: ['PRIVATE_WORKSPACE_ROOT_CANARY'],
      },
      network: 'restricted',
    },
    effort: 'low',
    personality: 'pragmatic',
    collaboration_mode: {
      mode: 'default',
      settings: {
        developer_instructions: 'PRIVATE_DEVELOPER_INSTRUCTIONS_CANARY',
      },
    },
    multi_agent_mode: 'explicitRequestOnly',
    multi_agent_version: 'v2',
    current_date: '2026-07-20',
    timezone: 'Asia/Tokyo',
    workspace_roots: ['/workspace/demo'],
    summary: 'PRIVATE_SUMMARY_CANARY',
  }
  let rows = [
    {
      timestamp: '2026-07-20T10:00:05.000Z',
      type: 'session_meta',
      payload: {
        id: 'codex-environment-session-1',
        cwd: '/workspace/demo',
        cli_version: '0.143.0',
        source: 'cli',
        originator: 'codex-tui',
        model_provider: 'openai',
        base_instructions: 'PRIVATE_BASE_INSTRUCTIONS_CANARY',
      },
    },
    {
      timestamp: '2026-07-20T10:00:06.000Z',
      type: 'world_state',
      payload: { state: 'PRIVATE_WORLD_STATE_CANARY' },
    },
    {
      timestamp: '2026-07-20T10:00:07.000Z',
      type: 'turn_context',
      payload: firstContext,
    },
    {
      timestamp: '2026-07-20T10:00:08.000Z',
      type: 'turn_context',
      payload: {
        ...firstContext,
        model: 'gpt-5.7',
        effort: 'high',
        sandbox_policy: {
          type: 'workspace-write',
          network_access: true,
        },
        workspace_roots: [
          '/workspace/demo',
          '/private/PRIVATE_WORKSPACE_ROOT_CANARY',
        ],
      },
    },
  ]

  return rows.map((row) => JSON.stringify(row)).join('\n')
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
