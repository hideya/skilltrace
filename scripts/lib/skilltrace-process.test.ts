import { describe, expect, test } from 'vitest'
import {
  commandExists,
  parseProcessLine,
  processAlive,
  processOwnsServer,
  sharedProbeServer,
} from './skilltrace-process'

describe('skilltrace process helpers', () => {
  test('parses ps output lines', () => {
    expect(parseProcessLine('  1234 node dist/traceskill-probe-worker.js --shared')).toEqual({
      pid: 1234,
      command: 'node dist/traceskill-probe-worker.js --shared',
    })
    expect(parseProcessLine('not a process')).toBeNull()
  })

  test('extracts shared probe server argument', () => {
    expect(
      sharedProbeServer(
        'node traceskill-probe-worker.js --shared --server http://127.0.0.1:7555',
      ),
    ).toBe('http://127.0.0.1:7555')
    expect(sharedProbeServer('node traceskill-probe-worker.js --shared')).toBeUndefined()
  })

  test('checks basic process liveness', () => {
    expect(processAlive(process.pid)).toBe(true)
    expect(processAlive()).toBe(false)
  })

  test('checks whether a command is executable', () => {
    expect(commandExists('node')).toBe(true)
    expect(commandExists('skilltrace-command-that-does-not-exist')).toBe(false)
  })

  test('treats matching server pid as owned by parent process', () => {
    expect(processOwnsServer(process.pid, process.pid)).toBe(true)
    expect(processOwnsServer(process.pid)).toBe(false)
  })
})
