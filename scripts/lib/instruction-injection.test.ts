import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  assessInstrumentation,
  ejectExistingInstructions,
  ejectInstructions,
  injectInstructions,
  instructionInjectionStatus,
} from './instruction-injection'

let tempDirs: string[] = []

afterEach(() => {
  for (let dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe('instruction injection', () => {
  test('injects and ejects the instruction block and generated template', () => {
    let dir = tempRoot()
    let agentsPath = path.join(dir, 'AGENTS.md')
    fs.writeFileSync(agentsPath, '# Agent Guidelines\n')

    let injected = injectInstructions(dir, 'run_001')

    expect(injected.status).toBe('ok')
    expect(injected.inserted_agents_instruction).toBe(true)
    expect(injected.created_instrumentation).toBe(true)
    expect(injected.created_passive_config).toBe(true)
    expect(instructionInjectionStatus(dir)).toBe('active')
    expect(fs.readFileSync(agentsPath, 'utf8')).toContain(
      'Before starting any task',
    )
    expect(fs.existsSync(path.join(dir, '.skilltrace/instrumentation.md'))).toBe(true)
    expect(fs.readFileSync(path.join(dir, '.skilltrace.json'), 'utf8')).toContain(
      '"skill_roots"',
    )

    let ejected = ejectInstructions(dir, 'run_001')

    expect(ejected?.status).toBe('ok')
    expect(ejected?.removed_agents_instruction).toBe(true)
    expect(ejected?.removed_instrumentation).toBe(true)
    expect(ejected?.removed_passive_config).toBe(true)
    expect(instructionInjectionStatus(dir)).toBe('inactive')
    expect(fs.readFileSync(agentsPath, 'utf8')).toBe('# Agent Guidelines\n')
    expect(fs.existsSync(path.join(dir, '.skilltrace'))).toBe(false)
    expect(fs.existsSync(path.join(dir, '.skilltrace.json'))).toBe(false)
  })

  test('preserves pre-existing instrumentation and warns', () => {
    let dir = tempRoot()
    let skilltraceDir = path.join(dir, '.skilltrace')
    let instrumentationPath = path.join(skilltraceDir, 'instrumentation.md')
    fs.mkdirSync(skilltraceDir, { recursive: true })
    fs.writeFileSync(instrumentationPath, 'user policy\n')

    let injected = injectInstructions(dir, 'run_002')
    let ejected = ejectInstructions(dir, 'run_002')

    expect(injected.status).toBe('warning')
    expect(injected.created_instrumentation).toBe(false)
    expect(injected.warnings.join('\n')).toContain('already exists')
    expect(ejected?.removed_instrumentation).toBe(false)
    expect(fs.readFileSync(instrumentationPath, 'utf8')).toBe('user policy\n')
  })

  test('preserves pre-existing passive config and warns', () => {
    let dir = tempRoot()
    let configPath = path.join(dir, '.skilltrace.json')
    fs.writeFileSync(configPath, '{ "skill_roots": ["custom-skills"] }\n')

    let injected = injectInstructions(dir, 'run_config')
    let ejected = ejectInstructions(dir, 'run_config')

    expect(injected.status).toBe('warning')
    expect(injected.created_passive_config).toBe(false)
    expect(injected.warnings.join('\n')).toContain('.skilltrace.json already exists')
    expect(ejected?.removed_passive_config).toBe(false)
    expect(fs.readFileSync(configPath, 'utf8')).toBe(
      '{ "skill_roots": ["custom-skills"] }\n',
    )
  })

  test('reports instrumentation readiness', () => {
    let dir = tempRoot()

    let missing = assessInstrumentation(dir)

    expect(missing.status).toBe('not_configured')
    expect(missing.warnings.length).toBeGreaterThan(0)
    expect(missing.passive_config_file_exists).toBe(false)

    injectInstructions(dir, 'run_003')

    let ready = assessInstrumentation(dir, true)

    expect(ready.status).toBe('ready')
    expect(ready.inject_requested).toBe(true)
    expect(ready.passive_config_file_exists).toBe(true)
    expect(ready.warnings).toEqual([])
  })

  test('ejects existing injection using manifest run id', () => {
    let dir = tempRoot()
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Agent Guidelines\n')

    injectInstructions(dir, 'run_old')

    let ejected = ejectExistingInstructions(dir)

    expect(ejected?.status).toBe('ok')
    expect(instructionInjectionStatus(dir)).toBe('inactive')
    expect(fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8')).toBe(
      '# Agent Guidelines\n',
    )
  })
})

function tempRoot() {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilltrace-injection-'))
  tempDirs.push(dir)
  return dir
}
