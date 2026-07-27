import { describe, expect, test } from 'vitest'
import {
  assertNoArgs,
  parseDaemonLogsArgs,
  parseRunArgs,
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

  test('separates run options from the child command', () => {
    expect(
      parseRunArgs(
        [
          '--mode',
          'passive_only',
          '--',
          'codex',
          '--model',
          'gpt-5.6',
          'fix the errors',
        ],
        fail,
      ),
    ).toEqual({
      traceArgs: ['--mode', 'passive_only'],
      command: 'codex',
      commandArgs: ['--model', 'gpt-5.6', 'fix the errors'],
      keepOnError: false,
    })
  })

  test('parses the run error policy before the command separator', () => {
    expect(
      parseRunArgs(
        ['--keep-on-error', '--', 'codex', '--keep-on-error'],
        fail,
      ),
    ).toEqual({
      traceArgs: [],
      command: 'codex',
      commandArgs: ['--keep-on-error'],
      keepOnError: true,
    })
  })

  test('requires a run command separator and executable', () => {
    expect(() => parseRunArgs(['codex'], fail)).toThrow(
      'Missing -- before the command to run',
    )
    expect(() => parseRunArgs(['--'], fail)).toThrow(
      'Missing command after --',
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
