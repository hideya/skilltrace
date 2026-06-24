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

  results.push(...checkReflectionFileConsistency(events))

  return results
}

function checkReflectionFileConsistency(events: TraceEventLike[]) {
  let reflection = latestReflection(events)
  if (!reflection) return []

  let passivePaths = passiveObservedPaths(events)
  let reflectedPaths = reflectedFilePaths(reflection)
  let results: ConsistencyResult[] = []

  for (let reflected of reflectedPaths) {
    if (pathSetHas(passivePaths, reflected)) {
      results.push({
        status: 'pass',
        title: 'Reflected and observed',
        message: `${reflected} was listed in reflection and observed passively.`,
        skill: reflected,
      })
    } else {
      results.push({
        status: 'warning',
        title: 'Reflected but not observed',
        message: `${reflected} was listed in reflection, but no passive read was observed.`,
        skill: reflected,
      })
    }
  }

  for (let observed of passivePaths) {
    if (pathSetHas(reflectedPaths, observed)) continue

    results.push({
      status: 'warning',
      title: 'Observed but not reflected',
      message: `${observed} was observed passively, but was not listed in reflection.`,
      skill: observed,
    })
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

function latestReflection(events: TraceEventLike[]) {
  return events
    .filter((event) => event.event_type === 'run_reflection_declared')
    .toSorted((a, b) =>
      new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime()
    )[0]?.payload?.data
}

function passiveObservedPaths(events: TraceEventLike[]) {
  let paths = events
    .filter(isPassiveSkillRead)
    .map(passivePath)
    .filter(Boolean)

  return unique(paths)
}

function passivePath(event: TraceEventLike) {
  return passivePathCandidates(event)[0]
}

function passivePathCandidates(event: TraceEventLike) {
  return [
    event.skill_path,
    event.payload?.file_path,
    event.payload?.path,
    event.payload?.skill_path,
  ].filter((value): value is string => typeof value === 'string' && !!value)
}

function reflectedFilePaths(reflection: Record<string, any>) {
  return unique([
    ...stringList(reflection.skills_read),
    ...stringList(reflection.references_read),
    ...stringList(reflection.files_believed_to_influence_work),
  ])
}

function pathSetHas(paths: string[], candidate: string) {
  let normalized = normalizePath(candidate)
  return paths.some((path) => pathsMatch(normalizePath(path), normalized))
}

function pathsMatch(left: string, right: string) {
  if (left === right) return true
  return left.endsWith(`/${right}`) || right.endsWith(`/${left}`)
}

function normalizePath(value: string) {
  return value
    .trim()
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/\/+/g, '/')
    .toLowerCase()
}

function stringList(value: any) {
  if (!Array.isArray(value)) return []
  return value.filter((item) => typeof item === 'string' && item.trim())
}

function unique(values: string[]) {
  return [...new Set(values)]
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
  timestamp?: Date | string
  skill_name?: string | null
  skill_path?: string | null
  skill_file_hash?: string | null
  payload?: Record<string, any> | null
}
