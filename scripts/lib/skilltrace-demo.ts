import fs from 'fs'
import path from 'path'
import { buildSkillLogEvent } from './skilltrace-log'
import { buildSkillReadEvent } from './skilltrace-read'

const FIXTURE_SKILL = 'pr-review'
const FIXTURE_SKILL_PATH = 'fixtures/skills/pr-review/SKILL.md'
const FIXTURE_REFERENCE_PATH = 'fixtures/skills/pr-review/references/checklist.md'

export function buildDemoRunId(date = new Date()) {
  return `run_fixture_pr_review_${date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace('T', '_')
    .replace('Z', '')}`
}

export function buildDemoEvents(options: DemoEventOptions) {
  let skillPath = path.resolve(options.skillPath ?? FIXTURE_SKILL_PATH)
  let referencePath = path.resolve(
    options.referencePath ?? FIXTURE_REFERENCE_PATH,
  )
  let skillContent = fs.readFileSync(skillPath, 'utf8')
  let referenceContent = fs.readFileSync(referencePath, 'utf8')
  let reads = buildReadEvents({
    runId: options.runId,
    skillPath,
    referencePath,
    skillContent,
    referenceContent,
  })

  if (options.caseName === 'warning') return reads

  return [
    ...reads,
    buildSkillLogEvent({
      runId: options.runId,
      eventType: 'skill_use_started',
      skillName: FIXTURE_SKILL,
      skillPath: path.relative(process.cwd(), skillPath),
      summary: 'Using the PR review fixture for a SkillTrace demo run.',
      confidence: 'medium',
      data: {
        why_applicable: 'manual trace fixture demo run',
      },
    }),
    buildSkillLogEvent({
      runId: options.runId,
      eventType: 'skill_use_finished',
      skillName: FIXTURE_SKILL,
      skillPath: path.relative(process.cwd(), skillPath),
      summary: 'Completed the PR review fixture demo run.',
      confidence: 'medium',
      data: {
        steps_applied: 'read fixture skill and checklist',
      },
    }),
  ]
}

export function demoRunCases(caseName: DemoCase, baseRunId: string) {
  if (caseName === 'pass') {
    return [{ label: 'Pass run', runId: `${baseRunId}_pass`, caseName }]
  }

  if (caseName === 'warning') {
    return [{ label: 'Warning run', runId: `${baseRunId}_warning`, caseName }]
  }

  return [
    { label: 'Pass run', runId: `${baseRunId}_pass`, caseName: 'pass' },
    {
      label: 'Warning run',
      runId: `${baseRunId}_warning`,
      caseName: 'warning',
    },
  ] satisfies DemoRunCase[]
}

export function runUrl(server: string, runId: string) {
  return new URL(`/app/runs/${runId}`, server).toString()
}

function buildReadEvents(options: ReadEventOptions) {
  return [
    buildSkillReadEvent({
      runId: options.runId,
      skillName: FIXTURE_SKILL,
      filePath: options.skillPath,
      content: options.skillContent,
    }),
    buildSkillReadEvent({
      runId: options.runId,
      skillName: FIXTURE_SKILL,
      filePath: options.referencePath,
      content: options.referenceContent,
    }),
  ]
}

export type DemoEventOptions = {
  runId: string
  caseName?: Exclude<DemoCase, 'both'>
  skillPath?: string
  referencePath?: string
}

export type DemoCase = 'pass' | 'warning' | 'both'

export type DemoRunCase = {
  label: string
  runId: string
  caseName: Exclude<DemoCase, 'both'>
}

type ReadEventOptions = {
  runId: string
  skillPath: string
  referencePath: string
  skillContent: string
  referenceContent: string
}
