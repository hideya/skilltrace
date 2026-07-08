import fs from 'fs'
import path from 'path'

export function instructionProfileReady(
  profile: InstructionProfile,
  report: InstructionSurfaceReport,
) {
  if (profile === 'agents') {
    return hasSurface(report, 'agents', 'instruction_file') &&
      hasSurface(report, 'agents', 'skill_root')
  }

  return hasSurface(report, 'claude_code', 'instruction_file') &&
    hasSurface(report, 'claude_code', 'skill_root')
}

export function instructionProfileExpectation(profile: InstructionProfile) {
  if (profile === 'claude_code') {
    return 'CLAUDE.md or .claude/CLAUDE.md, and .claude/skills/'
  }
  if (profile === 'agents') return 'AGENTS.md and .agents/skills/'

  return 'AGENTS.md and .agents/skills/'
}

export function detectInstructionSurfaces(
  targetRoot: string,
): InstructionSurfaceReport {
  let surfaces = INSTRUCTION_SURFACE_CANDIDATES
    .map((candidate) => detectInstructionSurface(targetRoot, candidate))
    .filter((surface): surface is InstructionSurface => !!surface)
  let aliasGroups = instructionSurfaceAliasGroups(surfaces)

  return {
    detected_at: new Date().toISOString(),
    surfaces,
    alias_groups: aliasGroups,
    instruction_profiles: readyInstructionProfiles(surfaces),
  }
}

export function selectInstructionProfile(
  requested: InstructionProfileOption | undefined,
  report: InstructionSurfaceReport,
): SelectedInstructionProfile {
  let value = requested ?? 'auto'
  let profiles = report.instruction_profiles

  if (value !== 'auto') {
    return {
      selected: value,
      requested: value,
      reason: 'explicit_profile',
    }
  }

  if (profiles.length === 1) {
    return {
      selected: profiles[0],
      requested: value,
      reason: 'single_detected_profile',
    }
  }

  if (profiles.length === 0) {
    return {
      selected: 'agents',
      requested: value,
      reason: 'no_profile_detected',
      warnings: [
        'No instruction surface was detected; defaulting to agents.',
      ],
    }
  }

  if (profiles.includes('agents')) {
    return {
      selected: 'agents',
      requested: value,
      reason: 'ambiguous_detected_profiles',
      warnings: [
        `Multiple instruction profiles were detected (${profiles.join(', ')}); defaulting to agents.`,
      ],
    }
  }

  return {
    selected: profiles[0],
    requested: value,
    reason: 'first_detected_profile',
    warnings: [
      `Multiple non-agents instruction profiles were detected (${profiles.join(', ')}); using ${profiles[0]}.`,
    ],
  }
}

function detectInstructionSurface(
  targetRoot: string,
  candidate: InstructionSurfaceCandidate,
): InstructionSurface | null {
  let absolutePath = path.join(targetRoot, candidate.logical_path)
  let stat = fs.lstatSync(absolutePath, { throwIfNoEntry: false })
  if (!stat) return null
  let resolved = resolveInstructionSurfacePath(absolutePath)

  return {
    instruction_profile: candidate.instruction_profile,
    kind: candidate.kind,
    logical_path: candidate.logical_path,
    absolute_path: absolutePath,
    resolved_path: resolved.path,
    realpath_error: resolved.error,
    is_symlink: stat.isSymbolicLink(),
    node_type: instructionSurfaceNodeType(stat),
  }
}

function resolveInstructionSurfacePath(absolutePath: string): {
  path?: string
  error?: string
} {
  try {
    return { path: fs.realpathSync(absolutePath) }
  } catch (error) {
    return {
      path: undefined,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function instructionSurfaceNodeType(stat: fs.Stats): InstructionSurfaceNodeType {
  if (stat.isDirectory()) return 'directory'
  if (stat.isFile()) return 'file'
  if (stat.isSymbolicLink()) return 'symlink'
  return 'other'
}

function instructionSurfaceAliasGroups(surfaces: InstructionSurface[]) {
  let byResolvedPath = new Map<string, InstructionSurface[]>()

  for (let surface of surfaces) {
    if (!surface.resolved_path) continue
    let group = byResolvedPath.get(surface.resolved_path) ?? []
    group.push(surface)
    byResolvedPath.set(surface.resolved_path, group)
  }

  return [...byResolvedPath.entries()]
    .filter(([_, group]) => group.length > 1)
    .map(([resolvedPath, group]) => ({
      resolved_path: resolvedPath,
      logical_paths: group.map((surface) => surface.logical_path),
      instruction_profiles: unique(group.map((surface) =>
        surface.instruction_profile
      )),
      kinds: unique(group.map((surface) => surface.kind)),
    }))
}

function hasSurface(
  report: InstructionSurfaceReport,
  profile: InstructionProfile,
  kind: InstructionSurfaceKind,
) {
  return report.surfaces.some((surface) =>
    surface.instruction_profile === profile && surface.kind === kind
  )
}

function readyInstructionProfiles(surfaces: InstructionSurface[]) {
  let profiles = unique(surfaces.map((surface) => surface.instruction_profile))

  return profiles.filter((profile) =>
    surfaces.some((surface) =>
      surface.instruction_profile === profile &&
      surface.kind === 'instruction_file'
    ) &&
    surfaces.some((surface) =>
      surface.instruction_profile === profile &&
      surface.kind === 'skill_root'
    )
  )
}

function unique<T extends string>(values: T[]) {
  return [...new Set(values)]
}

const INSTRUCTION_SURFACE_CANDIDATES: InstructionSurfaceCandidate[] = [
  {
    instruction_profile: 'agents',
    kind: 'instruction_file',
    logical_path: 'AGENTS.md',
  },
  {
    instruction_profile: 'agents',
    kind: 'skill_root',
    logical_path: '.agents/skills',
  },
  {
    instruction_profile: 'claude_code',
    kind: 'instruction_file',
    logical_path: 'CLAUDE.md',
  },
  {
    instruction_profile: 'claude_code',
    kind: 'instruction_file',
    logical_path: '.claude/CLAUDE.md',
  },
  {
    instruction_profile: 'claude_code',
    kind: 'skill_root',
    logical_path: '.claude/skills',
  },
]

export type InstructionProfile = 'agents' | 'claude_code'

export type InstructionProfileOption = InstructionProfile | 'auto'

export type InstructionSurfaceKind = 'instruction_file' | 'skill_root'

export type InstructionSurfaceNodeType = 'file' | 'directory' | 'symlink' | 'other'

type InstructionSurfaceCandidate = {
  instruction_profile: InstructionProfile
  kind: InstructionSurfaceKind
  logical_path: string
}

export type InstructionSurface = InstructionSurfaceCandidate & {
  absolute_path: string
  resolved_path?: string
  realpath_error?: string
  is_symlink: boolean
  node_type: InstructionSurfaceNodeType
}

export type InstructionSurfaceAliasGroup = {
  resolved_path: string
  logical_paths: string[]
  instruction_profiles: InstructionProfile[]
  kinds: InstructionSurfaceKind[]
}

export type InstructionSurfaceReport = {
  detected_at: string
  surfaces: InstructionSurface[]
  alias_groups: InstructionSurfaceAliasGroup[]
  instruction_profiles: InstructionProfile[]
}

export type SelectedInstructionProfile = {
  selected: InstructionProfile
  requested: InstructionProfileOption
  reason: string
  warnings?: string[]
}
