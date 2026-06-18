export function checkTraceConsistency(events: TraceEventLike[]) {
  let groups = groupBySkill(events)
  let results: ConsistencyResult[] = []

  for (let group of groups.values()) {
    let hasPassive = group.events.some(isPassiveSkillRead)
    let hasStarted = group.events.some(isSkillUseStarted)
    let hasFinished = group.events.some(isSkillUseFinished)
    let skill = group.label

    if (hasPassive && hasStarted && hasFinished) {
      results.push({
        status: 'pass',
        title: 'Observed and declared',
        message: `${skill} was read, started, and finished.`,
        skill,
      })
      continue
    }

    if (hasPassive && !hasStarted) {
      results.push({
        status: 'warning',
        title: 'Read but not declared',
        message: `${skill} was read, but no skill_use_started event was logged.`,
        skill,
      })
    }

    if (!hasPassive && hasStarted) {
      results.push({
        status: 'warning',
        title: 'Declared but not observed',
        message: `${skill} was declared, but no passive skill read was observed.`,
        skill,
      })
    }

    if (hasStarted && !hasFinished) {
      results.push({
        status: 'incomplete',
        title: 'Started but not finished',
        message: `${skill} logged skill_use_started, but no skill_use_finished event was logged.`,
        skill,
      })
    }
  }

  return results
}

function groupBySkill(events: TraceEventLike[]) {
  let groups = new Map<string, SkillEventGroup>()

  for (let event of events) {
    let key = skillKey(event)
    if (!key) continue

    let group = groups.get(key) ?? {
      label: skillLabel(event),
      events: [],
    }
    group.events.push(event)
    groups.set(key, group)
  }

  return groups
}

function skillKey(event: TraceEventLike) {
  return event.skill_name || event.skill_path || event.skill_file_hash || null
}

function skillLabel(event: TraceEventLike) {
  return event.skill_name || event.skill_path || event.skill_file_hash || 'Skill'
}

function isPassiveSkillRead(event: TraceEventLike) {
  return (
    event.source === 'passive_file_harness' &&
    ['skill_file_read', 'skill_reference_read'].includes(event.event_type)
  )
}

function isSkillUseStarted(event: TraceEventLike) {
  return (
    event.source === 'mcp_semantic_logger' &&
    event.event_type === 'skill_use_started'
  )
}

function isSkillUseFinished(event: TraceEventLike) {
  return (
    event.source === 'mcp_semantic_logger' &&
    event.event_type === 'skill_use_finished'
  )
}

export type ConsistencyResult = {
  status: 'pass' | 'warning' | 'incomplete'
  title: string
  message: string
  skill: string
}

type SkillEventGroup = {
  label: string
  events: TraceEventLike[]
}

export type TraceEventLike = {
  source: string
  event_type: string
  skill_name?: string | null
  skill_path?: string | null
  skill_file_hash?: string | null
}
