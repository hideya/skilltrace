import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  readDaemonState,
  removeDaemonState,
  writeDaemonState,
} from './skilltrace-daemon-state'

let tempDirs: string[] = []

afterEach(() => {
  for (let dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe('daemon state', () => {
  test('reads and writes daemon state', () => {
    let filePath = tempStatePath()

    writeDaemonState({
      pid: 123,
      server: 'http://127.0.0.1:7555',
      log_path: '/tmp/skilltrace-daemon.log',
      started_at: '2026-07-06T00:00:00.000Z',
      shared_probe_requested: true,
      shared_probe_pid: 456,
    }, filePath)

    expect(readDaemonState(filePath)).toEqual({
      pid: 123,
      server: 'http://127.0.0.1:7555',
      log_path: '/tmp/skilltrace-daemon.log',
      started_at: '2026-07-06T00:00:00.000Z',
      shared_probe_requested: true,
      shared_probe_pid: 456,
    })
  })

  test('returns null for missing or invalid state', () => {
    let filePath = tempStatePath()

    expect(readDaemonState(filePath)).toBeNull()

    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, 'not json\n')

    expect(readDaemonState(filePath)).toBeNull()
  })

  test('removes daemon state', () => {
    let filePath = tempStatePath()

    writeDaemonState({
      pid: 123,
      server: 'http://127.0.0.1:7555',
      log_path: '/tmp/skilltrace-daemon.log',
      started_at: '2026-07-06T00:00:00.000Z',
    }, filePath)

    removeDaemonState(filePath)

    expect(fs.existsSync(filePath)).toBe(false)
  })
})

function tempStatePath() {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilltrace-daemon-'))
  tempDirs.push(dir)
  return path.join(dir, 'daemon.json')
}
