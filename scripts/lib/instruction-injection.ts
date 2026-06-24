import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'
import { fileURLToPath } from 'url'

const PACKAGE_ROOT = findPackageRoot(path.dirname(fileURLToPath(import.meta.url)))
const INSTRUMENTATION_TEMPLATE_PATH = path.join(PACKAGE_ROOT, 'scripts/templates/instrumentation.md')
const INJECTION_BLOCK =
  'Before starting any task, read and follow `.skilltrace/instrumentation.md` for SkillTrace MCP tracing.\n\n'
const INJECTION_MANIFEST_PATH = '.skilltrace/injection.json'
const INSTRUMENTATION_PATH = '.skilltrace/instrumentation.md'
const PASSIVE_CONFIG_PATH = '.skilltrace.json'
const PASSIVE_CONFIG = {
  skill_roots: ['.skills'],
}

export function injectInstructions(targetRoot: string, runId: string) {
  let warnings: string[] = []
  let skilltraceDir = path.join(targetRoot, '.skilltrace')
  let manifestPath = path.join(targetRoot, INJECTION_MANIFEST_PATH)
  let instrumentationPath = path.join(targetRoot, INSTRUMENTATION_PATH)
  let passiveConfigPath = path.join(targetRoot, PASSIVE_CONFIG_PATH)
  let agentsPath = path.join(targetRoot, 'AGENTS.md')
  let template = fs.readFileSync(INSTRUMENTATION_TEMPLATE_PATH, 'utf8')

  if (fs.existsSync(manifestPath)) {
    warnings.push('Existing SkillTrace injection manifest found; leaving existing injected state unchanged.')
    return injectionResult({
      status: 'warning',
      manifestPath,
      agentsPath,
      instrumentationPath,
      passiveConfigPath,
      insertedAgentsInstruction: false,
      createdInstrumentation: false,
      createdPassiveConfig: false,
      warnings,
    })
  }

  fs.mkdirSync(skilltraceDir, { recursive: true })

  let createdInstrumentation = false
  if (fs.existsSync(instrumentationPath)) {
    warnings.push('.skilltrace/instrumentation.md already exists; preserving existing file.')
  } else {
    fs.writeFileSync(instrumentationPath, template)
    createdInstrumentation = true
  }

  let createdPassiveConfig = false
  if (fs.existsSync(passiveConfigPath)) {
    warnings.push('.skilltrace.json already exists; preserving existing file.')
  } else {
    fs.writeFileSync(passiveConfigPath, `${JSON.stringify(PASSIVE_CONFIG, null, 2)}\n`)
    createdPassiveConfig = true
  }

  let agentsBefore = fs.existsSync(agentsPath)
    ? fs.readFileSync(agentsPath, 'utf8')
    : ''
  let insertedAgentsInstruction = false

  if (agentsBefore.includes(INJECTION_BLOCK.trim())) {
    warnings.push('AGENTS.md already contains the SkillTrace instruction; preserving existing text.')
  } else {
    fs.writeFileSync(agentsPath, `${INJECTION_BLOCK}${agentsBefore}`)
    insertedAgentsInstruction = true
  }

  let manifest: InjectionManifest = {
    version: 1,
    run_id: runId,
    target_root: targetRoot,
    injected_at: new Date().toISOString(),
    instruction_block: INJECTION_BLOCK,
    agents_path: 'AGENTS.md',
    instrumentation_path: INSTRUMENTATION_PATH,
    passive_config_path: PASSIVE_CONFIG_PATH,
    inserted_agents_instruction: insertedAgentsInstruction,
    created_instrumentation: createdInstrumentation,
    created_passive_config: createdPassiveConfig,
    agents_hash_after: hashFileIfExists(agentsPath),
    instrumentation_hash_after: hashFileIfExists(instrumentationPath),
    passive_config_hash_after: hashFileIfExists(passiveConfigPath),
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  return injectionResult({
    status: warnings.length > 0 ? 'warning' : 'ok',
    manifestPath,
    agentsPath,
    instrumentationPath,
    passiveConfigPath,
    insertedAgentsInstruction,
    createdInstrumentation,
    createdPassiveConfig,
    warnings,
  })
}

export function ejectInstructions(targetRoot: string, runId: string) {
  let manifestPath = path.join(targetRoot, INJECTION_MANIFEST_PATH)
  if (!fs.existsSync(manifestPath)) return null

  let warnings: string[] = []
  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as InjectionManifest
  let agentsPath = path.join(targetRoot, manifest.agents_path)
  let instrumentationPath = path.join(targetRoot, manifest.instrumentation_path)
  let passiveConfigPath = manifest.passive_config_path
    ? path.join(targetRoot, manifest.passive_config_path)
    : path.join(targetRoot, PASSIVE_CONFIG_PATH)
  let removedAgentsInstruction = false
  let removedInstrumentation = false
  let removedPassiveConfig = false

  if (manifest.run_id !== runId) {
    warnings.push(`Injection manifest belongs to ${manifest.run_id}; cleaning during ${runId}.`)
  }

  if (manifest.inserted_agents_instruction) {
    if (!fs.existsSync(agentsPath)) {
      warnings.push('AGENTS.md is missing; could not remove injected instruction.')
    } else {
      let content = fs.readFileSync(agentsPath, 'utf8')
      if (!content.includes(manifest.instruction_block)) {
        warnings.push('AGENTS.md no longer contains the exact injected instruction; leaving it unchanged.')
      } else {
        if (manifest.agents_hash_after && hashText(content) !== manifest.agents_hash_after) {
          warnings.push('AGENTS.md changed after injection; removed only the exact injected instruction block.')
        }
        fs.writeFileSync(agentsPath, content.replace(manifest.instruction_block, ''))
        removedAgentsInstruction = true
      }
    }
  }

  if (manifest.created_instrumentation) {
    if (!fs.existsSync(instrumentationPath)) {
      warnings.push('.skilltrace/instrumentation.md is missing; nothing to remove.')
    } else if (
      manifest.instrumentation_hash_after &&
      hashFileIfExists(instrumentationPath) !== manifest.instrumentation_hash_after
    ) {
      warnings.push('.skilltrace/instrumentation.md changed after injection; preserving it.')
    } else {
      fs.rmSync(instrumentationPath)
      removedInstrumentation = true
    }
  }

  if (manifest.created_passive_config) {
    if (!fs.existsSync(passiveConfigPath)) {
      warnings.push('.skilltrace.json is missing; nothing to remove.')
    } else if (
      manifest.passive_config_hash_after &&
      hashFileIfExists(passiveConfigPath) !== manifest.passive_config_hash_after
    ) {
      warnings.push('.skilltrace.json changed after injection; preserving it.')
    } else {
      fs.rmSync(passiveConfigPath)
      removedPassiveConfig = true
    }
  }

  fs.rmSync(manifestPath)
  removeEmptyDir(path.dirname(manifestPath))

  return {
    status: warnings.length > 0 ? 'warning' : 'ok',
    manifest_path: manifestPath,
    agents_path: agentsPath,
    instrumentation_path: instrumentationPath,
    passive_config_path: passiveConfigPath,
    removed_agents_instruction: removedAgentsInstruction,
    removed_instrumentation: removedInstrumentation,
    removed_passive_config: removedPassiveConfig,
    warnings,
  }
}

export function ejectExistingInstructions(targetRoot: string) {
  let manifestPath = path.join(targetRoot, INJECTION_MANIFEST_PATH)
  if (!fs.existsSync(manifestPath)) return null

  let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as InjectionManifest
  return ejectInstructions(targetRoot, manifest.run_id)
}

export function instructionInjectionStatus(targetRoot?: string) {
  if (!targetRoot) return 'unknown'
  let manifestPath = path.join(targetRoot, INJECTION_MANIFEST_PATH)
  if (fs.existsSync(manifestPath)) return 'active'
  return 'inactive'
}

export function assessInstrumentation(targetRoot: string, injectRequested = false) {
  let agentsPath = path.join(targetRoot, 'AGENTS.md')
  let instrumentationPath = path.join(targetRoot, INSTRUMENTATION_PATH)
  let passiveConfigPath = path.join(targetRoot, PASSIVE_CONFIG_PATH)
  let manifestPath = path.join(targetRoot, INJECTION_MANIFEST_PATH)
  let agentsFileExists = fs.existsSync(agentsPath)
  let agentsText = agentsFileExists ? fs.readFileSync(agentsPath, 'utf8') : ''
  let agentsInstructionPresent = agentsText.includes(INJECTION_BLOCK.trim())
  let instrumentationFileExists = fs.existsSync(instrumentationPath)
  let passiveConfigFileExists = fs.existsSync(passiveConfigPath)
  let injectionManifestExists = fs.existsSync(manifestPath)
  let warnings: string[] = []

  if (!agentsFileExists) {
    warnings.push('AGENTS.md is missing; SkillTrace instrumentation is not configured.')
  }
  if (!agentsInstructionPresent) {
    warnings.push('AGENTS.md does not point to .skilltrace/instrumentation.md.')
  }
  if (!instrumentationFileExists) {
    warnings.push('.skilltrace/instrumentation.md is missing.')
  }
  if (!passiveConfigFileExists) {
    warnings.push('.skilltrace.json is missing.')
  }

  let status = warnings.length === 0
    ? 'ready'
    : injectRequested
      ? 'pending_injection'
      : 'not_configured'

  return {
    inject_requested: injectRequested,
    agents_file_exists: agentsFileExists,
    agents_instruction_present: agentsInstructionPresent,
    instrumentation_file_exists: instrumentationFileExists,
    passive_config_file_exists: passiveConfigFileExists,
    injection_manifest_exists: injectionManifestExists,
    status,
    warnings: injectRequested ? [] : warnings,
    pending_warnings: injectRequested ? warnings : [],
  }
}

function injectionResult(input: InjectionResultInput) {
  return {
    status: input.status,
    manifest_path: input.manifestPath,
    agents_path: input.agentsPath,
    instrumentation_path: input.instrumentationPath,
    passive_config_path: input.passiveConfigPath,
    inserted_agents_instruction: input.insertedAgentsInstruction,
    created_instrumentation: input.createdInstrumentation,
    created_passive_config: input.createdPassiveConfig,
    warnings: input.warnings,
  }
}

function hashFileIfExists(filePath: string) {
  if (!fs.existsSync(filePath)) return undefined
  return hashText(fs.readFileSync(filePath, 'utf8'))
}

function hashText(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function removeEmptyDir(dir: string) {
  try {
    if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir)
  } catch {}
}

function findPackageRoot(startDir: string) {
  let dir = startDir

  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir
    let parent = path.dirname(dir)
    if (parent === dir) return startDir
    dir = parent
  }
}

type InjectionResultInput = {
  status: string
  manifestPath: string
  agentsPath: string
  instrumentationPath: string
  passiveConfigPath: string
  insertedAgentsInstruction: boolean
  createdInstrumentation: boolean
  createdPassiveConfig: boolean
  warnings: string[]
}

type InjectionManifest = {
  version: number
  run_id: string
  target_root: string
  injected_at: string
  instruction_block: string
  agents_path: string
  instrumentation_path: string
  passive_config_path?: string
  inserted_agents_instruction: boolean
  created_instrumentation: boolean
  created_passive_config?: boolean
  agents_hash_after?: string
  instrumentation_hash_after?: string
  passive_config_hash_after?: string
}
