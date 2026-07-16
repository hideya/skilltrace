import { spawnSync } from 'child_process'
import {
  expectedMcpServerCommand,
  mcpAgents,
  type McpAgent,
} from './skilltrace-mcp-clients'

export { expectedMcpServerCommand } from './skilltrace-mcp-clients'

export function manageMcpInstall(options: McpManageOptions = {}) {
  let agents = selectedMcpAgents(options)
  let serverCommand = expectedMcpServerCommand(options.devMode)

  console.log(`Installing SkillTrace MCP registrations for: ${serverCommand} mcp serve`)
  console.log('')

  let results = agents.map((agent) => installMcpAgent(agent, serverCommand))
  printMcpManageSummary('install', results)
}

export function manageMcpUninstall(options: McpManageOptions = {}) {
  let agents = selectedMcpAgents(options)

  console.log('Removing SkillTrace MCP registrations.')
  console.log('')

  let results = agents.map((agent) => uninstallMcpAgent(agent))
  printMcpManageSummary('uninstall', results)
}

export function printMcpStatus(options: McpManageOptions = {}) {
  let agents = selectedMcpAgents(options)
  let serverCommand = expectedMcpServerCommand(options.devMode)

  console.log(`Expected SkillTrace MCP command: ${serverCommand} mcp serve`)
  console.log('')

  for (let agent of agents) {
    printMcpAgentStatus(agent, serverCommand, !!options.verbose)
  }
}

export function mcpRegistrationMatches(
  agentKey: string,
  output: string,
  serverCommand: string,
) {
  let agent = mcpAgents().find((item) => item.key === agentKey)
  if (!agent) return false
  return agent.registrationMatches(output, serverCommand)
}

function selectedMcpAgents(options: McpManageOptions) {
  let agents = mcpAgents()
  if (!options.agent) return agents

  let agent = agents.find((item) => item.key === options.agent)
  if (!agent) throw new Error(`Unknown MCP agent: ${options.agent}`)

  return [agent]
}

function installMcpAgent(agent: McpAgent, serverCommand: string) {
  if (!commandExists(agent.command)) {
    return {
      agent,
      status: 'skipped',
      message: `${agent.command} was not found on PATH`,
    } satisfies McpManageResult
  }

  if (agent.removeBeforeInstall) {
    runMcpManageCommand(agent, agent.uninstallArgs, {
      label: 'remove existing registration',
      tolerateFailure: true,
    })
  }

  let result = runMcpManageCommand(
    agent,
    agent.installArgs(serverCommand),
    { label: 'install registration' },
  )

  return {
    agent,
    status: result.ok ? 'ok' : 'warning',
    message: result.ok ? 'registered' : result.message,
  } satisfies McpManageResult
}

function uninstallMcpAgent(agent: McpAgent) {
  if (!commandExists(agent.command)) {
    return {
      agent,
      status: 'skipped',
      message: `${agent.command} was not found on PATH`,
    } satisfies McpManageResult
  }

  let result = runMcpManageCommand(agent, agent.uninstallArgs, {
    label: 'remove registration',
    tolerateFailure: true,
  })

  return {
    agent,
    status: result.ok || result.tolerated ? 'ok' : 'warning',
    message: result.ok
      ? 'removed'
      : result.tolerated
        ? 'remove command returned non-zero; it may already be absent'
        : result.message,
  } satisfies McpManageResult
}

function printMcpAgentStatus(
  agent: McpAgent,
  serverCommand: string,
  verbose: boolean,
) {
  if (!commandExists(agent.command)) {
    console.log(`${agent.name}: not installed`)
    return
  }

  let result = runMcpManageCommand(agent, agent.statusArgs, {
    label: 'check registration',
    quiet: !verbose,
    tolerateFailure: true,
  })
  let output = result.output
  let registered = agent.registrationMatches(output, serverCommand)

  if (registered) {
    console.log(`${agent.name}: ok`)
  } else if (result.ok || result.tolerated) {
    console.log(`${agent.name}: skilltrace registration was not found or did not match`)
  } else {
    console.log(`${agent.name}: ${result.message}`)
  }

  if (verbose && output) {
    console.log(indentLines(output, '  '))
  }
}

function printMcpManageSummary(
  action: 'install' | 'uninstall',
  results: McpManageResult[],
) {
  console.log('')
  console.log(`SkillTrace MCP ${action} summary:`)
  for (let result of results) {
    console.log(`  ${result.agent.key}: ${result.status} - ${result.message}`)
  }
}

function runMcpManageCommand(
  agent: McpAgent,
  args: string[],
  options: McpManageCommandOptions,
) {
  let commandLine = [agent.command, ...args].join(' ')
  if (!options.quiet) {
    console.log(`${agent.name}: ${options.label}`)
    console.log(`  $ ${commandLine}`)
  }

  let result = spawnSync(agent.command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = [result.stderr, result.stdout].filter(Boolean).join('\n').trim()
  let ok = result.status === 0
  let tolerated = !ok && !!options.tolerateFailure

  if (!ok && output && !options.quiet) {
    console.log(indentLines(output, '  '))
  }

  return {
    ok,
    tolerated,
    output,
    message: output || `exit status ${result.status ?? 'unknown'}`,
  }
}

function commandExists(command: string) {
  return spawnSync('which', [command], { stdio: 'pipe' }).status === 0
}

function indentLines(value: string, prefix: string) {
  return value
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n')
}

export type McpManageOptions = {
  agent?: string
  devMode?: boolean
  verbose?: boolean
}

type McpManageResult = {
  agent: McpAgent
  status: 'ok' | 'warning' | 'skipped'
  message: string
}

type McpManageCommandOptions = {
  label: string
  quiet?: boolean
  tolerateFailure?: boolean
}
