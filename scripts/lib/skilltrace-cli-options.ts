import { isTraceMode, type TraceMode } from '../../app/lib/trace-mode'
import type { InstructionProfileOption } from './instruction-profile'

export function parseStartArgs(args: string[], fail: Fail) {
  return parseArgs(
    args,
    [
      'target',
      'server',
      'debugProbe',
      'note',
      'injectInstructions',
      'mode',
      'instructionProfile',
    ],
    fail,
  )
}

export function parseStopArgs(args: string[], fail: Fail) {
  return parseArgs(args, ['server', 'discard', 'yes'], fail)
}

export function parseStatusArgs(args: string[], fail: Fail) {
  return parseArgs(args, ['server'], fail)
}

export function parseDiagnosticsArgs(args: string[], fail: Fail) {
  return parseArgs(args, ['server', 'verbose'], fail)
}

export function parseMcpArgs(args: string[], verbose: boolean, fail: Fail) {
  return parseArgs(args, verbose ? ['agent', 'verbose'] : ['agent'], fail)
}

export function parseDaemonStartArgs(args: string[], fail: Fail) {
  return parseArgs(args, ['server', 'sharedProbe'], fail)
}

export function parseDaemonServerArgs(args: string[], fail: Fail) {
  return parseArgs(args, ['server'], fail)
}

export function parseDaemonLogsArgs(args: string[], fail: Fail) {
  return parseArgs(args, ['lines'], fail)
}

export function assertNoArgs(args: string[], fail: Fail) {
  if (args[0]) fail(`Unknown option: ${args[0]}`)
}

function parseArgs(args: string[], allowed: OptionKey[], fail: Fail) {
  let options: CliOptions = {}
  let allowedKeys = new Set(allowed)

  for (let index = 0; index < args.length; index += 1) {
    let arg = args[index]
    let key = optionKey(arg)
    if (!key || !allowedKeys.has(key)) fail(`Unknown option: ${arg}`)

    if (key === 'debugProbe') {
      options.debugProbe = true
    } else if (key === 'injectInstructions') {
      options.injectInstructions = arg === '--inject-instructions'
    } else if (key === 'discard') {
      options.discard = true
    } else if (key === 'yes') {
      options.yes = true
    } else if (key === 'sharedProbe') {
      options.sharedProbe = arg === '--shared-probe'
    } else if (key === 'verbose') {
      options.verbose = true
    } else {
      let value = optionValue(args, index, arg, fail)
      index += 1

      if (key === 'target') options.target = value
      if (key === 'server') options.server = value
      if (key === 'note') options.note = value
      if (key === 'agent') options.agent = value
      if (key === 'mode') options.mode = traceMode(value, fail)
      if (key === 'instructionProfile') {
        options.instructionProfile = instructionProfile(value, fail)
      }
      if (key === 'lines') options.lines = lineCount(value, fail)
    }
  }

  return options
}

function optionKey(arg: string): OptionKey | null {
  if (arg === '--target') return 'target'
  if (arg === '--server') return 'server'
  if (arg === '--debug-probe') return 'debugProbe'
  if (arg === '--note' || arg === '-n') return 'note'
  if (arg === '--inject-instructions' || arg === '--no-inject-instructions') {
    return 'injectInstructions'
  }
  if (arg === '--discard') return 'discard'
  if (arg === '--yes' || arg === '-y') return 'yes'
  if (arg === '--mode') return 'mode'
  if (arg === '--instruction-profile') return 'instructionProfile'
  if (arg === '--shared-probe' || arg === '--no-shared-probe') {
    return 'sharedProbe'
  }
  if (arg === '--lines') return 'lines'
  if (arg === '--verbose') return 'verbose'
  if (arg === '--agent') return 'agent'
  return null
}

function optionValue(
  args: string[],
  index: number,
  option: string,
  fail: Fail,
) {
  let value = args[index + 1]
  if (!value || value.startsWith('-')) fail(`Missing value for ${option}`)
  return value
}

function traceMode(value: string, fail: Fail): TraceMode {
  if (isTraceMode(value)) return value
  fail(`Unknown trace mode: ${value}`)
}

function instructionProfile(
  value: string,
  fail: Fail,
): InstructionProfileOption {
  if (value === 'auto' || value === 'agents' || value === 'claude_code') {
    return value
  }
  if (value === 'claude-code') return 'claude_code'
  fail(`Unknown instruction profile: ${value}`)
}

function lineCount(value: string, fail: Fail) {
  let lines = Number(value)
  if (!Number.isInteger(lines) || lines < 1) {
    fail(`Invalid --lines value: ${value}`)
  }
  return lines
}

export type CliOptions = {
  target?: string
  server?: string
  debugProbe?: boolean
  note?: string
  injectInstructions?: boolean
  discard?: boolean
  yes?: boolean
  mode?: TraceMode
  instructionProfile?: InstructionProfileOption
  sharedProbe?: boolean
  lines?: number
  verbose?: boolean
  agent?: string
}

type OptionKey = keyof CliOptions
type Fail = (message: string) => never
