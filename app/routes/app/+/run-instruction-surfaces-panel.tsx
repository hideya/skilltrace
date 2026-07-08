import { CompactDetailsPanel, EmptyPanel, StatTile } from './run-detail-ui'

export function InstructionSurfacesPanel({
  profile,
  report,
}: InstructionSurfacesPanelProps) {
  let surfaces = Array.isArray(report?.surfaces) ? report.surfaces : []
  let aliasGroups = Array.isArray(report?.alias_groups)
    ? report.alias_groups
    : []
  let warnings = Array.isArray(profile?.warnings) ? profile.warnings : []
  let infoWarnings = warnings.filter(isInstructionProfileDefaultWarning)
  let warningWarnings = warnings.filter(
    (warning) => !isInstructionProfileDefaultWarning(warning),
  )

  return (
    <CompactDetailsPanel
      summary={instructionSurfaceSummary(profile, surfaces)}
      title="Instruction surfaces"
    >
      {surfaces.length > 0 ? (
        <div className="space-y-4">
          {profile ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile
                label="Instruction profile"
                value={instructionProfileLabel(profile.selected)}
              />
              <StatTile
                label="Requested"
                value={instructionProfileRequestLabel(profile.requested)}
              />
              <StatTile label="Reason" value={profile.reason || 'unknown'} />
            </div>
          ) : null}

          {infoWarnings.length > 0 ? (
            <div className="p-1 text-sm font-semibold text-info">
              <ul className="list-disc pl-5">
                {infoWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {warningWarnings.length > 0 ? (
            <div className="alert text-sm alert-warning">
              <ul className="list-disc pl-5">
                {warningWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Instruction profile</th>
                  <th>Kind</th>
                  <th>Logical path</th>
                  <th>Resolved path</th>
                  <th>Symlink</th>
                </tr>
              </thead>
              <tbody>
                {surfaces.map((surface, index) => {
                  let resolvedPath =
                    surface.resolved_path ?? surface.realpath_error ?? 'unknown'

                  return (
                    <tr
                      key={`${surface.instruction_profile}:${surface.logical_path}:${index}`}
                    >
                      <td>
                        <span className="badge badge-outline badge-sm">
                          {instructionProfileLabel(surface.instruction_profile)}
                        </span>
                      </td>
                      <td>{surfaceKindLabel(surface.kind)}</td>
                      <td className="font-mono text-xs break-words">
                        {surface.logical_path}
                      </td>
                      <td className="font-mono text-xs break-words text-base-content/60">
                        {resolvedPath}
                      </td>
                      <td>{surface.is_symlink ? 'yes' : 'no'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {aliasGroups.length > 0 ? (
            <div className="rounded-box border border-base-300 bg-base-200 p-3">
              <h3 className="text-sm font-semibold text-base-content/70">
                Shared resolved targets
              </h3>
              <ul className="mt-2 space-y-2">
                {aliasGroups.map((group, index) => (
                  <li
                    className="text-sm"
                    key={`${group.resolved_path}:${index}`}
                  >
                    <div className="font-mono text-xs break-words">
                      {group.logical_paths.join(' -> ')}
                    </div>
                    <div className="mt-1 font-mono text-xs break-words text-base-content/50">
                      {group.resolved_path}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyPanel>No instruction surfaces detected.</EmptyPanel>
      )}
    </CompactDetailsPanel>
  )
}

function isInstructionProfileDefaultWarning(warning: string) {
  return warning.startsWith('Multiple instruction profiles were detected')
}

function instructionSurfaceSummary(
  profile?: SelectedInstructionProfile | null,
  surfaces: InstructionSurface[] = [],
) {
  let profileLabel = instructionProfileLabel(profile?.selected)
  let requested = instructionProfileRequestLabel(profile?.requested)
  let suffix = surfaces.length === 0 ? ' / no surfaces' : ''

  return `${profileLabel} / ${requested}${suffix}`
}

function instructionProfileRequestLabel(profile?: string) {
  if (!profile || profile === 'auto') return 'auto'
  return instructionProfileLabel(profile)
}

function instructionProfileLabel(profile?: string) {
  if (profile === 'agents') return 'Agent Skills'
  if (profile === 'agents_md') return 'Legacy AGENTS.md'
  if (profile === 'claude_code') return 'Claude Code'
  return profile || 'unknown'
}

function surfaceKindLabel(kind?: string) {
  if (kind === 'instruction_file') return 'Instruction'
  if (kind === 'skill_root') return 'Skill root'
  return kind || 'unknown'
}

type InstructionSurfacesPanelProps = {
  profile?: SelectedInstructionProfile | null
  report?: InstructionSurfaceReport | null
}

type SelectedInstructionProfile = {
  selected?: string
  requested?: string
  reason?: string
  warnings?: string[]
}

type InstructionSurfaceReport = {
  surfaces?: InstructionSurface[]
  alias_groups?: InstructionSurfaceAliasGroup[]
}

type InstructionSurface = {
  instruction_profile?: string
  kind?: string
  logical_path?: string
  resolved_path?: string
  realpath_error?: string
  is_symlink?: boolean
}

type InstructionSurfaceAliasGroup = {
  resolved_path?: string
  logical_paths: string[]
}
