import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  readActiveSession,
  removeActiveSession,
  sessionFilePath,
  writeActiveSession,
} from './skilltrace-session'

let tempDirs: string[] = []

afterEach(() => {
  for (let dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe('skilltrace session helpers', () => {
  test('uses explicit session file env when present', () => {
    expect(sessionFilePath({ sessionFile: '/tmp/session.json' })).toBe(
      '/tmp/session.json',
    )
  })

  test('writes, reads, and removes an active session', () => {
    let dir = tempRoot()
    let filePath = path.join(dir, 'skilltrace-session.json')

    writeActiveSession(
      {
        run_id: 'run_session_001',
        server: 'http://localhost:7555',
        target_root: '/tmp/repo',
        skill_roots: ['/tmp/repo/.skills'],
        started_at: '2026-06-19T00:15:30.000Z',
      },
      filePath,
    )

    expect(readActiveSession(filePath)?.run_id).toBe('run_session_001')

    removeActiveSession(filePath)

    expect(readActiveSession(filePath)).toBeUndefined()
  })
})

function tempRoot() {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilltrace-session-'))
  tempDirs.push(dir)
  return dir
}
