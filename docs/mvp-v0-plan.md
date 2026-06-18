# SkillTrace MVP v0 Plan

## Summary

SkillTrace v0 builds the smallest useful loop for observing AI agent skill use:

1. capture passive evidence that a skill was activated
2. capture active declarations from the model about skill use
3. correlate both by run ID
4. show mismatches in a simple web UI

The first milestone is not skill governance, postmortem automation, or a marketplace. The first milestone is enough trace evidence to reconstruct what happened when a skill appears to succeed, fail, or be ignored.

## Goal

Build a local SkillTrace server and web app that can answer these questions for a single agent run:

- Which skill files were mechanically observed?
- Which skills did the model explicitly declare it used?
- Did declared use match passive activation evidence?
- Is there enough information to inspect the run timeline after the fact?

## MVP v0 Features

- Trace event model for passive, semantic, and human or evaluation events.
- Run ID correlation shared across event sources.
- Passive event receiver for local file access harness events.
- Semantic logging endpoint aligned with a future `skill_log_event` MCP tool.
- Trace event store for runs and chronological events.
- Consistency checker for passive activation and declared use.
- Run timeline UI.
- Skill access and semantic log views.
- Instrumentation comparison support for early experiments.

## Initial Data Model

Use a small schema with two core tables.

### `runs`

Stores one observed agent run.

Suggested fields:

- `id`
- `name`
- `description`
- `status`
- `started_at`
- `finished_at`
- `created_at`
- `updated_at`

### `trace_events`

Stores all passive, semantic, and human or evaluation events.

Suggested fields:

- `id`
- `run_id`
- `timestamp`
- `source`
- `event_type`
- `skill_name`
- `skill_version`
- `skill_path`
- `skill_file_hash`
- `artifact_refs`
- `payload`
- `created_at`

Keep `payload` flexible JSON so v0 can evolve through real experiments without overfitting the schema too early.

Do not run `drizzle-kit` or `atlas schema apply` automatically. Schema changes should be written in code and documented for manual application by the developer.

## Initial Event Types

Passive mechanical events:

- `skill_file_read`
- `skill_reference_read`
- `skill_script_executed`
- `artifact_read`
- `artifact_written`
- `mcp_tool_called`

Active semantic events:

- `skill_use_started`
- `skill_use_finished`
- `assumption_declared`
- `risk_declared`
- `deviation_declared`
- `uncertainty_declared`
- `failure_signal_declared`

Human or evaluation events:

- `human_feedback_added`
- `run_marked_success`
- `run_marked_failure`
- `incident_candidate_created`

## Initial API Shape

Keep the API intentionally small.

### Passive event ingestion

Receives observations from a local file access harness.

Minimum behavior:

- require `run_id`
- accept `event_type`, timestamp, optional skill metadata, artifact references, and payload
- create the run if it does not already exist
- append the event without interpreting it

### Semantic event ingestion

Receives model-declared skill use events and should match the future MCP tool contract.

Minimum behavior:

- require `run_id`
- accept `skill_use_started` and `skill_use_finished`
- accept summary, confidence, skill metadata, related artifacts, and structured data
- create the run if it does not already exist
- append the event as a semantic trace

### Run detail and timeline

Loads a single run with:

- chronological events
- passive skill access events
- semantic skill declarations
- consistency check results

## Initial UI

Use the existing React Router v7, daisyUI v5, and Tailwind CSS v4 setup.

Required views:

- Run list showing recent runs and status.
- Run timeline showing all events in chronological order.
- Consistency summary showing pass, warning, or incomplete states.
- Passive skill access panel showing skill path, file hash, timestamp, and run.
- Semantic declarations panel showing why applicable, assumptions, risk flags, applied steps, deviations, uncertainties, and recommended follow-up.

The UI should be operational and scannable rather than decorative.

## Consistency Checker

Implement simple per-run checks first.

- Observed and declared: `SKILL.md` was read, `skill_use_started` exists, and `skill_use_finished` exists.
- Read but not declared: skill file was read, but no `skill_use_started` event exists.
- Declared but not observed: semantic use was declared, but no matching passive skill file read exists.
- Started but not finished: `skill_use_started` exists, but no `skill_use_finished` event exists.

The checker should produce human-readable messages for the UI. It should not try to infer hidden reasoning or determine actual skill influence.

## First Experiment

Use a PR review skill as the first dogfooding target.

Compare the same skill, task, and model across these conditions:

- No instrumentation.
- Passive monitoring only.
- Passive monitoring plus inline debug instrumentation in `SKILL.md`.
- Passive monitoring plus external instrumentation overlay.
- Strong debug protocol requiring start and finish declarations.

Track:

- output quality
- tool call count
- latency
- token usage
- skill access frequency
- logging compliance
- passive and active trace consistency
- failure reconstructability
- postmortem draftability
- regression case extractability
- behavior drift caused by instrumentation

## Non-goals

MVP v0 does not include:

- public or private skill marketplace
- advanced postmortem generation
- automatic regression test generation
- skill trust cards
- complex permission management
- multi-user collaboration
- supply-chain security
- full OpenTelemetry integration
- automated schema migration execution by the agent

## Implementation Notes

- Follow the existing auth-starter structure and code style.
- Prefer simple server-side route loaders and actions.
- Keep single-use components and helpers colocated with their route.
- Keep event ingestion append-only in v0.
- Use structured APIs and JSON payloads instead of ad hoc string parsing.
- Run `pnpm tsc` after code edits.
- After type checking, hand dev-server and visual verification to the collaborating developer.

## Acceptance Criteria

- `docs/mvp-v0-plan.md` exists.
- The document is concise enough to guide immediate implementation.
- MVP v0 is clearly separated from long-term vision.
- The first milestone is skill observability, not skill governance.
- The first dogfooding experiment is PR review skill tracing.
- The document does not instruct the agent to run `drizzle-kit` or `atlas schema apply`.
