import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import { collectProviderHistory } from '.'

let temporaryDirectories: string[] = []

afterEach(() => {
  for (let directory of temporaryDirectories) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
  temporaryDirectories = []
})

describe('provider history dispatcher', () => {
  test('selects the uniquely matched Claude Code session', async () => {
    let codexHome = temporaryDirectory('skilltrace-empty-codex-')
    let claudeHome = temporaryDirectory('skilltrace-dispatch-claude-')
    let project = path.join(claudeHome, 'projects', '-workspace-demo')
    fs.mkdirSync(project, { recursive: true })
    fs.copyFileSync(
      new URL('./fixtures/claude-session.jsonl', import.meta.url),
      path.join(project, 'claude-session-1.jsonl'),
    )

    let result = await collectProviderHistory({
      runId: 'demo-run',
      targetRoot: '/workspace/demo',
      skillRoots: ['/workspace/demo/.claude/skills'],
      startedAt: '2026-07-20T10:00:00.000Z',
      stoppedAt: '2026-07-20T10:05:00.000Z',
      codexHome,
      claudeHome,
      geminiHome: temporaryDirectory('skilltrace-empty-gemini-'),
      stabilityIntervalMs: 1,
      stabilityAttempts: 3,
    })

    expect(result.status).toBe('collected')
    expect(result.summary.provider).toBe('claude_code')
    expect(result.events).toHaveLength(8)
  })

  test('returns one neutral unavailable result when no provider matches', async () => {
    let result = await collectProviderHistory({
      runId: 'demo-run',
      targetRoot: '/workspace/demo',
      skillRoots: ['/workspace/demo/.agents/skills'],
      startedAt: '2026-07-20T10:00:00.000Z',
      stoppedAt: '2026-07-20T10:05:00.000Z',
      codexHome: temporaryDirectory('skilltrace-empty-codex-'),
      claudeHome: temporaryDirectory('skilltrace-empty-claude-'),
      geminiHome: temporaryDirectory('skilltrace-empty-gemini-'),
    })

    expect(result).toMatchObject({
      status: 'unavailable',
      events: [],
      summary: {
        status: 'unavailable',
        provider: 'unknown',
      },
    })
  })

  test('selects the uniquely matched Gemini CLI session', async () => {
    let geminiHome = temporaryDirectory('skilltrace-dispatch-gemini-')
    let targetRoot = path.resolve('examples/type-fix-demo')
    let project = path.join(geminiHome, 'tmp', 'fixture-project')
    let chats = path.join(project, 'chats')
    fs.mkdirSync(chats, { recursive: true })
    fs.writeFileSync(path.join(project, '.project_root'), `${targetRoot}\n`)
    fs.writeFileSync(
      path.join(chats, 'gemini-session-1.jsonl'),
      fs
        .readFileSync(
          new URL('./fixtures/gemini-session.jsonl', import.meta.url),
          'utf8',
        )
        .replaceAll('/workspace/demo', targetRoot),
    )

    let result = await collectProviderHistory({
      runId: 'demo-run',
      targetRoot,
      skillRoots: [path.join(targetRoot, '.agents/skills')],
      startedAt: '2026-07-20T10:00:00.000Z',
      stoppedAt: '2026-07-20T10:05:00.000Z',
      codexHome: temporaryDirectory('skilltrace-empty-codex-'),
      claudeHome: temporaryDirectory('skilltrace-empty-claude-'),
      geminiHome,
      stabilityIntervalMs: 1,
      stabilityAttempts: 3,
    })

    expect(result.status).toBe('collected')
    expect(result.summary.provider).toBe('gemini_cli')
    expect(result.events).toHaveLength(7)
  })
})

function temporaryDirectory(prefix: string) {
  let directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}
