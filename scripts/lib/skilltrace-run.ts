import { spawn, type ChildProcess } from 'child_process'
import os from 'os'

export async function runTraceLifecycle(input: TraceLifecycleInput) {
  let runError: unknown
  let cleanupError: unknown
  let exitCode = 1

  try {
    exitCode = await input.run()
  } catch (error) {
    runError = error
  }

  try {
    await input.stop()
  } catch (error) {
    cleanupError = error
  }

  if (runError) {
    if (cleanupError) input.onCleanupError?.(cleanupError)
    throw runError
  }
  if (cleanupError) throw cleanupError

  return exitCode
}

export function spawnForegroundCommand(input: ForegroundCommandInput) {
  let child = spawn(input.command, input.args, {
    cwd: input.cwd,
    env: input.env,
    stdio: 'inherit',
  })
  let result = waitForChild(child)

  return {
    pid: child.pid,
    result,
  }
}

function waitForChild(child: ChildProcess): Promise<ForegroundCommandResult> {
  return new Promise((resolve, reject) => {
    let signals: NodeJS.Signals[] = [
      'SIGHUP',
      'SIGINT',
      'SIGQUIT',
      'SIGTERM',
    ]
    let handlers = signals.map((signal) => ({
      signal,
      handler: () => forward(signal),
    }))

    function cleanup() {
      for (let item of handlers) process.off(item.signal, item.handler)
    }

    function forward(signal: NodeJS.Signals) {
      try {
        child.kill(signal)
      } catch {}
    }

    for (let item of handlers) process.on(item.signal, item.handler)

    child.once('error', (error) => {
      cleanup()
      reject(error)
    })
    child.once('close', (code, signal) => {
      cleanup()
      resolve({
        exitCode: childExitCode(code, signal),
        signal,
      })
    })
  })
}

export function childExitCode(
  code: number | null,
  signal: NodeJS.Signals | null,
) {
  if (typeof code === 'number') return code
  if (!signal) return 1

  let signalNumber = os.constants.signals[signal]
  return signalNumber ? 128 + signalNumber : 1
}

export function childFailureMessage(
  command: string,
  result: ForegroundCommandResult,
  keep: boolean,
) {
  if (result.exitCode === 0) return null

  let outcome = result.signal
    ? `was terminated by ${result.signal} (exit ${result.exitCode})`
    : `exited with code ${result.exitCode}`
  let action = keep ? 'preserving' : 'discarding'
  return `SkillTrace: ${command} ${outcome}; ${action} the trace.`
}

export function shouldDiscardChild(
  result: ForegroundCommandResult,
  keep: boolean,
) {
  return result.exitCode !== 0 && !keep
}

export function childStartFailureMessage(command: string, keep: boolean) {
  let action = keep ? 'preserving' : 'discarding'
  return `SkillTrace: ${command} failed to start; ${action} the trace.`
}

export type ForegroundCommandInput = {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
}

export type ForegroundCommandResult = {
  exitCode: number
  signal: NodeJS.Signals | null
}

type TraceLifecycleInput = {
  run: () => Promise<number>
  stop: () => Promise<void>
  onCleanupError?: (error: unknown) => void
}
