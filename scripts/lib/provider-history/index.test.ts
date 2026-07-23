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
})

function temporaryDirectory(prefix: string) {
  let directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}
