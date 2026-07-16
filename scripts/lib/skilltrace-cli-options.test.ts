import { describe, expect, test } from 'vitest'
import {
  assertNoArgs,
  parseDaemonLogsArgs,
  parseStartArgs,
  parseStatusArgs,
} from './skilltrace-cli-options'

const fail = (message: string): never => {
  throw new Error(message)
}

describe('SkillTrace CLI options', () => {
  test('parses start options', () => {
    expect(
      parseStartArgs(
        [
          '--target',
          '/repo',
          '--mode',
          'passive_only',
          '--instruction-profile',
          'claude-code',
        ],
        fail,
      ),
    ).toEqual({
      target: '/repo',
      mode: 'passive_only',
      instructionProfile: 'claude_code',
    })
  })

  test('rejects irrelevant command options', () => {
    expect(() => parseStatusArgs(['--discard'], fail)).toThrow(
      'Unknown option: --discard',
    )
  })

  test('rejects missing option values', () => {
    expect(() => parseStartArgs(['--target'], fail)).toThrow(
      'Missing value for --target',
    )
  })

  test('validates daemon log line counts', () => {
    expect(parseDaemonLogsArgs(['--lines', '25'], fail)).toEqual({ lines: 25 })
    expect(() => parseDaemonLogsArgs(['--lines', 'none'], fail)).toThrow(
      'Invalid --lines value: none',
    )
  })

  test('rejects arguments for commands without options', () => {
    expect(() => assertNoArgs(['--verbose'], fail)).toThrow(
      'Unknown option: --verbose',
    )
  })
})
