import { describe, expect, test, vi } from 'vitest'
import {
  childExitCode,
  childFailureMessage,
  childStartFailureMessage,
  runTraceLifecycle,
  shouldDiscardChild,
  spawnForegroundCommand,
} from './skilltrace-run'

describe('SkillTrace foreground command', () => {
  test('returns the child exit code and removes signal listeners', async () => {
    let sigintListeners = process.listenerCount('SIGINT')
    let sigtermListeners = process.listenerCount('SIGTERM')
    let child = spawnForegroundCommand({
      command: process.execPath,
      args: ['-e', 'process.exit(7)'],
      cwd: process.cwd(),
      env: process.env,
    })

    await expect(child.result).resolves.toEqual({
      exitCode: 7,
      signal: null,
    })
    expect(process.listenerCount('SIGINT')).toBe(sigintListeners)
    expect(process.listenerCount('SIGTERM')).toBe(sigtermListeners)
  })

  test('passes the configured working directory and environment', async () => {
    let child = spawnForegroundCommand({
      command: process.execPath,
      args: [
        '-e',
        "process.exit(process.env.SKILLTRACE_RUN_ID === 'run-1' && process.cwd() === process.env.EXPECTED_CWD ? 0 : 9)",
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        EXPECTED_CWD: process.cwd(),
        SKILLTRACE_RUN_ID: 'run-1',
      },
    })

    await expect(child.result).resolves.toEqual({
      exitCode: 0,
      signal: null,
    })
  })

  test('reports a missing executable', async () => {
    let child = spawnForegroundCommand({
      command: 'skilltrace-command-that-does-not-exist',
      args: [],
      cwd: process.cwd(),
      env: process.env,
    })

    await expect(child.result).rejects.toMatchObject({
      code: 'ENOENT',
    })
  })

  test('uses conventional exit codes for signals', () => {
    expect(childExitCode(null, 'SIGHUP')).toBe(129)
    expect(childExitCode(null, 'SIGINT')).toBe(130)
    expect(childExitCode(null, 'SIGQUIT')).toBe(131)
    expect(childExitCode(null, 'SIGTERM')).toBe(143)
    expect(childExitCode(null, null)).toBe(1)
  })

  test('describes failed child outcomes and the selected trace policy', () => {
    expect(
      childFailureMessage(
        'codex',
        {
          exitCode: 2,
          signal: null,
        },
        false,
      ),
    ).toBe('SkillTrace: codex exited with code 2; discarding the trace.')
    expect(
      childFailureMessage(
        'codex',
        {
          exitCode: 130,
          signal: 'SIGINT',
        },
        true,
      ),
    ).toBe(
      'SkillTrace: codex was terminated by SIGINT (exit 130); preserving the trace.',
    )
    expect(
      childFailureMessage('codex', { exitCode: 0, signal: null }, false),
    ).toBeNull()
    expect(childStartFailureMessage('codex', false)).toBe(
      'SkillTrace: codex failed to start; discarding the trace.',
    )
    expect(
      shouldDiscardChild({ exitCode: 137, signal: 'SIGKILL' }, false),
    ).toBe(true)
    expect(shouldDiscardChild({ exitCode: 2, signal: null }, true)).toBe(false)
    expect(shouldDiscardChild({ exitCode: 0, signal: null }, false)).toBe(false)
  })

  test('returns the conventional exit code when the child is terminated', async () => {
    let child = spawnForegroundCommand({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      env: process.env,
    })

    expect(child.pid).toBeTypeOf('number')
    process.kill(child.pid!, 'SIGTERM')

    await expect(child.result).resolves.toEqual({
      exitCode: 143,
      signal: 'SIGTERM',
    })
  })

  test('observes a forcibly killed child so the trace can be discarded', async () => {
    let child = spawnForegroundCommand({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      env: process.env,
    })

    expect(child.pid).toBeTypeOf('number')
    process.kill(child.pid!, 'SIGKILL')

    await expect(child.result).resolves.toEqual({
      exitCode: 137,
      signal: 'SIGKILL',
    })
  })

  test('stops the trace after a nonzero child exit', async () => {
    let stop = vi.fn(async () => {})

    await expect(
      runTraceLifecycle({
        run: async () => 7,
        stop,
      }),
    ).resolves.toBe(7)
    expect(stop).toHaveBeenCalledOnce()
  })

  test('stops the trace and preserves a child startup error', async () => {
    let runError = new Error('command not found')
    let cleanupError = new Error('cleanup failed')
    let onCleanupError = vi.fn()

    await expect(
      runTraceLifecycle({
        run: async () => {
          throw runError
        },
        stop: async () => {
          throw cleanupError
        },
        onCleanupError,
      }),
    ).rejects.toBe(runError)
    expect(onCleanupError).toHaveBeenCalledWith(cleanupError)
  })

  test('reports a cleanup failure after a successful child exit', async () => {
    let cleanupError = new Error('cleanup failed')

    await expect(
      runTraceLifecycle({
        run: async () => 0,
        stop: async () => {
          throw cleanupError
        },
      }),
    ).rejects.toBe(cleanupError)
  })
})
