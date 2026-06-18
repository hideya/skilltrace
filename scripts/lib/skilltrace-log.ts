export function buildSkillLogEvent(options: BuildSkillLogEventOptions) {
  return {
    run_id: options.runId,
    event_type: options.eventType,
    skill: {
      name: options.skillName,
      version: options.skillVersion,
      path: options.skillPath,
      file_hash: options.skillFileHash,
    },
    summary: options.summary,
    confidence: options.confidence,
    related_artifacts: options.relatedArtifacts ?? [],
    data: options.data ?? {},
  }
}

export function parseKeyValueData(values: string[]) {
  let data: Record<string, string> = {}

  for (let value of values) {
    let index = value.indexOf('=')
    if (index === -1) {
      throw new Error(`Expected --data key=value, got: ${value}`)
    }

    let key = value.slice(0, index).trim()
    if (!key) throw new Error(`Expected --data key=value, got: ${value}`)
    data[key] = value.slice(index + 1)
  }

  return data
}

export type BuildSkillLogEventOptions = {
  runId: string
  eventType: string
  skillName?: string
  skillVersion?: string
  skillPath?: string
  skillFileHash?: string
  summary?: string
  confidence?: string
  relatedArtifacts?: string[]
  data?: Record<string, unknown>
}
