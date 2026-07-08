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
  test('injects and ejects the Agent Skills instruction block and generated template', () => {
    let dir = tempRoot()
    let agentsPath = path.join(dir, 'AGENTS.md')
    fs.mkdirSync(path.join(dir, '.agents/skills'), { recursive: true })
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
    expect(fs.readFileSync(path.join(dir, '.skilltrace.json'), 'utf8')).toContain(
      '.agents/skills',
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

  test('keeps legacy agents_md passive root when requested', () => {
    let dir = tempRoot()
    fs.mkdirSync(path.join(dir, '.skills'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Agent Guidelines\n')

    injectInstructions(dir, 'run_legacy', {
      instructionProfile: 'agents_md',
    })

    let config = JSON.parse(
      fs.readFileSync(path.join(dir, '.skilltrace.json'), 'utf8'),
    )

    expect(config.skill_roots).toEqual(['.skills'])
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

  test('injects reflection-only instrumentation for passive reflection mode', () => {
    let dir = tempRoot()
    let instrumentationPath = path.join(dir, '.skilltrace/instrumentation.md')
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# Agent Guidelines\n')

    let injected = injectInstructions(dir, 'run_reflection', {
      traceMode: 'passive_reflection',
    })
    let content = fs.readFileSync(instrumentationPath, 'utf8')

    expect(injected.status).toBe('ok')
    expect(content).toContain('passive plus reflection tracing')
    expect(content).toContain('Do not call `skill_log_event`')
    expect(content).toContain('call `skill_trace_reflection`')
  })

  test('injects and ejects Claude Code instruction profile', () => {
    let dir = tempRoot()
    let claudePath = path.join(dir, 'CLAUDE.md')
    fs.mkdirSync(path.join(dir, '.claude/skills'), { recursive: true })
    fs.writeFileSync(claudePath, '# Claude Guidelines\n')

    let injected = injectInstructions(dir, 'run_claude', {
      instructionProfile: 'claude_code',
    })

    expect(injected.status).toBe('ok')
    expect(injected.instruction_path).toBe(claudePath)
    expect(fs.readFileSync(claudePath, 'utf8')).toContain(
      'Before starting any task',
    )
    expect(fs.readFileSync(path.join(dir, '.skilltrace.json'), 'utf8')).toContain(
      '.claude/skills',
    )

    let ejected = ejectInstructions(dir, 'run_claude')

    expect(ejected?.status).toBe('ok')
    expect(ejected?.removed_agents_instruction).toBe(true)
    expect(fs.readFileSync(claudePath, 'utf8')).toBe('# Claude Guidelines\n')
    expect(fs.existsSync(path.join(dir, '.skilltrace'))).toBe(false)
    expect(fs.existsSync(path.join(dir, '.skilltrace.json'))).toBe(false)
  })

  test('adds resolved repo-local skill root for symlinked Claude skills', () => {
    let dir = tempRoot()
    fs.mkdirSync(path.join(dir, '.skills/type-fix'), { recursive: true })
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
    fs.symlinkSync('../.skills', path.join(dir, '.claude/skills'))
    fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# Claude Guidelines\n')

    injectInstructions(dir, 'run_claude_symlink', {
      instructionProfile: 'claude_code',
    })

    let config = JSON.parse(
      fs.readFileSync(path.join(dir, '.skilltrace.json'), 'utf8'),
    )

    expect(config.skill_roots).toEqual(['.claude/skills', '.skills'])
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
    let pending = assessInstrumentation(dir, true)

    expect(missing.status).toBe('not_configured')
    expect(missing.warnings.length).toBeGreaterThan(0)
    expect(missing.passive_config_file_exists).toBe(false)
    expect(pending.status).toBe('pending_injection')
    expect(pending.warnings).toEqual([])
    expect(pending.pending_warnings.length).toBeGreaterThan(0)

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
