import fs from 'fs'
import path from 'path'
import { buildSkillLogEvent } from './skilltrace-log'
import { buildSkillReadEvent } from './skilltrace-read'

const FIXTURE_SKILL = 'pr-review'
const FIXTURE_SKILL_PATH = 'fixtures/skills/pr-review/SKILL.md'
const FIXTURE_REFERENCE_PATH = 'fixtures/skills/pr-review/references/checklist.md'

export function buildDogfoodRunId(date = new Date()) {
  return `run_fixture_pr_review_${date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace('T', '_')
    .replace('Z', '')}`
}

export function buildDogfoodEvents(options: DogfoodEventOptions) {
  let skillPath = path.resolve(options.skillPath ?? FIXTURE_SKILL_PATH)
  let referencePath = path.resolve(
    options.referencePath ?? FIXTURE_REFERENCE_PATH,
  )
  let skillContent = fs.readFileSync(skillPath, 'utf8')
  let referenceContent = fs.readFileSync(referencePath, 'utf8')

  return [
    buildSkillReadEvent({
      runId: options.runId,
      skillName: FIXTURE_SKILL,
      filePath: skillPath,
      content: skillContent,
    }),
    buildSkillReadEvent({
      runId: options.runId,
      skillName: FIXTURE_SKILL,
      filePath: referencePath,
      content: referenceContent,
    }),
    buildSkillLogEvent({
      runId: options.runId,
      eventType: 'skill_use_started',
      skillName: FIXTURE_SKILL,
      skillPath: path.relative(process.cwd(), skillPath),
      summary: 'Using the PR review fixture for SkillTrace dogfooding.',
      confidence: 'medium',
      data: {
        why_applicable: 'manual fixture dogfood run',
      },
    }),
    buildSkillLogEvent({
      runId: options.runId,
      eventType: 'skill_use_finished',
      skillName: FIXTURE_SKILL,
      skillPath: path.relative(process.cwd(), skillPath),
      summary: 'Completed the PR review fixture dogfood run.',
      confidence: 'medium',
      data: {
        steps_applied: 'read fixture skill and checklist',
      },
    }),
  ]
}

export function runUrl(server: string, runId: string) {
  return new URL(`/app/runs/${runId}`, server).toString()
}

export type DogfoodEventOptions = {
  runId: string
  skillPath?: string
  referencePath?: string
}
