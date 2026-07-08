import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, test } from 'vitest'
import {
  detectInstructionSurfaces,
  type InstructionSurfaceReport,
  instructionProfileReady,
  selectInstructionProfile,
} from './instruction-profile'

let tempDirs: string[] = []

afterEach(() => {
  for (let dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  tempDirs = []
})

describe('instruction profiles', () => {
  test('detects a generic Agent Skills repo', () => {
    let root = tempRoot()
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Agent Guidelines\n')
    fs.mkdirSync(path.join(root, '.agents/skills'), { recursive: true })

    let report = detectInstructionSurfaces(root)
    let selected = selectInstructionProfile(undefined, report)

    expect(report.instruction_profiles).toEqual(['agents'])
    expect(instructionProfileReady('agents', report)).toBe(true)
    expect(selected.selected).toBe('agents')
    expect(selected.reason).toBe('single_detected_profile')
  })

  test('detects an AGENTS.md style repo', () => {
    let root = tempRoot()
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Agent Guidelines\n')
    fs.mkdirSync(path.join(root, '.skills'), { recursive: true })

    let report = detectInstructionSurfaces(root)
    let selected = selectInstructionProfile(undefined, report)

    expect(report.instruction_profiles).toEqual(['agents_md'])
    expect(instructionProfileReady('agents_md', report)).toBe(true)
    expect(selected.selected).toBe('agents_md')
    expect(selected.reason).toBe('single_detected_profile')
  })

  test('detects a Claude Code style repo', () => {
    let root = tempRoot()
    fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# Claude Guidelines\n')
    fs.mkdirSync(path.join(root, '.claude/skills'), { recursive: true })

    let report = detectInstructionSurfaces(root)

    expect(report.instruction_profiles).toEqual(['claude_code'])
    expect(instructionProfileReady('claude_code', report)).toBe(true)
  })

  test('records alias groups for symlinked instruction files', () => {
    let root = tempRoot()
    fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Shared Guidelines\n')
    fs.symlinkSync('AGENTS.md', path.join(root, 'CLAUDE.md'))
    fs.mkdirSync(path.join(root, '.skills'), { recursive: true })
    fs.mkdirSync(path.join(root, '.claude'), { recursive: true })
    fs.symlinkSync('../.skills', path.join(root, '.claude/skills'))

    let report = detectInstructionSurfaces(root)

    expect(report.alias_groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          logical_paths: expect.arrayContaining(['AGENTS.md', 'CLAUDE.md']),
        }),
        expect.objectContaining({
          logical_paths: expect.arrayContaining(['.skills', '.claude/skills']),
        }),
      ]),
    )
  })

  test('auto selection defaults to agents_md when profiles are ambiguous', () => {
    let report: InstructionSurfaceReport = {
      detected_at: '2026-07-02T00:00:00.000Z',
      surfaces: [],
      alias_groups: [],
      instruction_profiles: ['agents_md', 'claude_code'],
    }

    let selected = selectInstructionProfile(undefined, report)

    expect(selected.selected).toBe('agents_md')
    expect(selected.reason).toBe('ambiguous_detected_profiles')
    expect(selected.warnings?.[0]).toContain('Multiple instruction profiles')
  })

  test('auto selection prefers agents over legacy agents_md when both exist', () => {
    let report: InstructionSurfaceReport = {
      detected_at: '2026-07-02T00:00:00.000Z',
      surfaces: [],
      alias_groups: [],
      instruction_profiles: ['agents_md', 'agents', 'claude_code'],
    }

    let selected = selectInstructionProfile(undefined, report)

    expect(selected.selected).toBe('agents')
    expect(selected.reason).toBe('ambiguous_detected_profiles')
    expect(selected.warnings?.[0]).toContain('defaulting to agents')
  })
})

function tempRoot() {
  let dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skilltrace-profile-'))
  tempDirs.push(dir)
  return dir
}
