import { z } from 'zod/v4'
import { buildSkillLogEvent } from './skilltrace-log'

export const skillLogEventInputSchema = {
  run_id: z.string().trim().optional(),
  event_type: z.string().trim().min(1).describe('Semantic event type'),
  skill_name: z.string().trim().optional(),
  skill_version: z.string().trim().optional(),
  skill_path: z.string().trim().optional(),
  skill_file_hash: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  confidence: z.string().trim().optional(),
  related_artifacts: z.array(z.string()).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}

export const skillTraceContextInputSchema = {
  run_id: z.string().trim().optional(),
  agent: z.string().trim().optional(),
  model: z.string().trim().optional(),
  client: z.string().trim().optional(),
  cwd: z.string().trim().optional(),
  task_summary: z.string().trim().optional(),
  notes: z.string().trim().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
}

export function buildMcpSkillLogEvent(
  input: SkillLogEventInput,
  env: SkillTraceMcpEnv,
) {
  let runId = input.run_id || mcpRunId(env)
  if (!runId) {
    throw new Error('Missing run_id, SKILLTRACE_RUN_ID, or SKILLTRACE_RUN_STEM')
  }

  return buildSkillLogEvent({
    runId,
    eventType: input.event_type,
    skillName: input.skill_name,
    skillVersion: input.skill_version,
    skillPath: input.skill_path,
    skillFileHash: input.skill_file_hash,
    summary: input.summary,
    confidence: input.confidence,
    relatedArtifacts: input.related_artifacts,
    data: input.data,
  })
}

export function buildMcpSkillTraceContextEvent(
  input: SkillTraceContextInput,
  env: SkillTraceMcpEnv,
) {
  let runId = input.run_id || mcpRunId(env)
  if (!runId) {
    throw new Error('Missing run_id, SKILLTRACE_RUN_ID, or SKILLTRACE_RUN_STEM')
  }

  return buildSkillLogEvent({
    runId,
    eventType: 'run_context_declared',
    summary: input.task_summary || 'Declared run context.',
    confidence: 'medium',
    data: {
      agent: input.agent,
      model: input.model,
      client: input.client,
      cwd: input.cwd,
      task_summary: input.task_summary,
      notes: input.notes,
      ...(input.data ?? {}),
    },
  })
}

export function skillTraceServerUrl(env: SkillTraceMcpEnv) {
  return env.server || 'http://localhost:5173'
}

export function mcpRunId(env: SkillTraceMcpEnv, date = new Date()) {
  if (env.runId) return env.runId
  if (env.sessionRunId) return env.sessionRunId
  if (!env.runStem) return undefined
  return `${env.runStem}_${timestampId(date)}`
}

export function timestampId(date = new Date()) {
  return date
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace('T', '_')
    .replace('Z', '')
}

export type SkillLogEventInput = {
  run_id?: string
  event_type: string
  skill_name?: string
  skill_version?: string
  skill_path?: string
  skill_file_hash?: string
  summary?: string
  confidence?: string
  related_artifacts?: string[]
  data?: Record<string, unknown>
}

export type SkillTraceContextInput = {
  run_id?: string
  agent?: string
  model?: string
  client?: string
  cwd?: string
  task_summary?: string
  notes?: string
  data?: Record<string, unknown>
}

export type SkillTraceMcpEnv = {
  runId?: string
  sessionRunId?: string
  runStem?: string
  server?: string
}
