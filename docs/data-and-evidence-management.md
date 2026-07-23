# Data And Evidence Management

Status: current policy plus gated future direction

This document defines how SkillTrace inspects, normalizes, retains, classifies,
derives, shares, and deletes run data. It applies across passive probing,
semantic MCP declarations, agent execution logs, run reflection, Git snapshots,
and future postmortem or skill-improvement analysis.

Client-specific field dispositions remain in
[Agent Execution Log Formats](./provider-history-formats.md). Future analysis
design remains in
[Postmortem And Skill Improvement](./postmortem-and-skill-improvement.md).

## Core Principles

> Be aggressive about semantic coverage, but conservative about retained
> content.

The policy follows these rules:

1. Retain normalized observations, not agent transcripts.
2. Prefer explicit, structured declarations over inferred private reasoning.
3. Treat every source as fallible; no stream is ground truth.
4. Keep observation, evidence status, and interpretation separate.
5. Make durable schemas allowlists, not arbitrary extension bags.
6. Preserve provenance and uncertainty so later policy can reinterpret a run.
7. Keep generated analysis replaceable and subordinate to its cited inputs.
8. Make sensitive inspection local, bounded, and purpose-specific.

## Data Lifecycle

| Layer | Meaning | Normal retention |
| --- | --- | --- |
| Raw source material | Agent log records, tool arguments and output, prompts, responses, reasoning, repository content, and private configuration | Not retained as a SkillTrace transcript; selected fields may be inspected transiently under an explicit allowlist |
| Normalized observation | A bounded fact such as a path, operation kind, timestamp, outcome, source ID, or collection-health signal | Retained with the run |
| Evidence status | A versioned policy judgment such as positive evidence, context-only, circular, excluded, or partially understood | Retained or reproducibly derived without changing the observation |
| Interpretation | A reflection statement, postmortem conclusion, or skill-improvement candidate | Labeled by source; generated interpretations are versioned, replaceable, and must cite observations |
| Research material | Exceptionally sensitive material collected to evaluate a future capability | Not part of normal collection; requires a separate opt-in design and storage boundary |

An adapter may inspect a private value without making it durable. Inspection
does not permit that value to appear in events, logs, errors, fixtures,
snapshots, API payloads, or UI data.

## Current Durable Record

Depending on the trace mode and source availability, SkillTrace may retain:

- normalized skill and reference paths
- operation categories, order, nesting, timestamps, and safe target paths
- normalized success, failure, abort, timeout, and completeness states
- bounded exit codes, durations, confidence, and extraction provenance
- agent, client, model, source format, and safe execution-configuration
  labels
- passive process attribution for retained skill and reference reads
- explicit semantic declarations and concise run reflection fields
- Git provenance and bounded instruction-relevant snapshots
- collection health, unsupported-record counts, and safe warning codes
- generated postmortems or improvement candidates in a future version, with
  analysis version and supporting observation IDs

This list describes eligible categories, not a requirement that every run
contain every category.

## Current Exclusions

Normal SkillTrace collection must not retain or send:

- user prompts or assistant responses
- raw reasoning, thinking blocks, hidden chain-of-thought, encrypted reasoning,
  or agent-client-generated reasoning summaries
- raw tool output, stdout, stderr, or returned file contents
- complete shell commands, arbitrary tool arguments, or agent-client program
  wrappers
- patch bodies, replacement strings, file snapshots, or unrelated repository
  contents
- agent-client-embedded base instructions, developer messages, world-state
  snapshots, or opaque agent-client policy objects
- credentials, cookies, authentication or account state, billing data,
  attachments, telemetry, or unrelated application logs
- absolute paths outside the approved path policy

Client-specific parsers may transiently inspect a bounded subset of raw
fields to identify a session, classify an operation, extract a safe path, or
correlate an outcome. The server must independently validate the resulting
allowlisted event shape.

## Reasoning Content

Raw reasoning can contain useful clues about planning, uncertainty, competing
approaches, instruction conflicts, and why verification changed an action. It
also has an unusually poor risk-to-signal ratio:

- it may reproduce secrets, prompts, source contents, personal data, or
  unrelated context
- agent-client definitions and log formats differ and can change without notice
- it can be large and difficult to redact reliably
- generated reasoning is not guaranteed to be a faithful causal account
- storing it makes run sharing, export, support, and deletion more sensitive
- mining prose encourages weak client-dependent inference

For these reasons, SkillTrace does not currently inspect reasoning for semantic
extraction and does not retain raw reasoning even when an agent log file exposes
it.

`reasoning_effort` or a similar allowlisted execution setting is metadata, not
reasoning content. A normalized setting label may be retained when structurally
available. Reasoning text, summaries, encrypted payloads, and reasoning-token
counts remain excluded.

## Safer Semantic Path

The preferred source of semantic information is an explicit, inspectable
declaration:

- `skill_trace_context` for applicability, assumptions, and initial risks
- `skill_log_event` for lifecycle, deviations, and operation-level notes
- `skill_trace_reflection` for concise retrospective attribution,
  uncertainties, skipped steps, and outcome assessment
- human feedback or an identified evaluator for external judgment

These declarations are self-reports, not objective truth. Their value comes
from comparison with passive observations, execution-log operations, repository
outcomes, and one another.

Future analysis may introduce bounded decision observations such as:

- `plan_revised`
- `uncertainty_expressed`
- `alternative_considered`
- `verification_changed_course`
- `instruction_conflict_identified`
- `failure_hypothesis_formed`
- `failure_hypothesis_rejected`

The first implementation of such signals should derive them from explicit
semantic declarations and deterministic execution transitions. A later
experiment may evaluate transient projection from text exposed in agent logs
only after a separate privacy and quality review.

A retained decision observation must:

- use an allowlisted category rather than a prose excerpt
- identify its source and extraction method
- carry confidence and uncertainty
- reference supporting run observations when applicable
- remain context-only unless a separate evidence policy promotes it
- avoid claims that temporal proximity proves causation

## Research-Mode Gate

Raw reasoning retention is not part of the normal product path. Any future
research mode that evaluates it requires an explicit architecture decision and
threat model before implementation.

At minimum, such a mode would need:

- explicit per-run user consent and an off-by-default setting
- local-only processing and storage
- encryption at rest with a separate storage boundary
- short, enforced retention and complete deletion
- strict size limits and reviewed redaction
- exclusion from normal APIs, screenshots, diagnostics, logs, fixtures, and
  exports
- clear separation from consistency evidence and production run records
- client-specific format, privacy, and false-inference tests
- a demonstrated benefit that cannot be obtained from structured declarations
  or normalized observations

Even under those controls, raw reasoning should be treated as sensitive
research material, not as authoritative evidence or a durable transcript
feature.

## Generated Analysis

Future postmortems and skill-improvement candidates may contain generated prose.
They are interpretations produced by SkillTrace, not agent-client conversation
content and not evidence.

Generated analysis must:

- cite stable observation or event IDs
- state source coverage, disagreement, and uncertainty
- record the analysis policy, schema, model, and prompt version when applicable
- remain replaceable without rewriting source observations
- distinguish operation success from task or evaluated success
- require human acceptance before changing a skill

Agent-client-generated summaries remain excluded from normal collection. This
does not prevent SkillTrace from later storing its own clearly labeled,
versioned analysis derived from retained observations.

## Retention, Export, And Deletion

- Normalized observations follow the lifecycle of their run.
- Deleting or discarding a run must delete its attached observations and
  interpretations.
- `skilltrace stop --discard` must skip execution-log collection.
- Exports must use explicit schemas and exclude transient source material.
- Debug and error paths must emit safe codes, never rejected private values.
- Fixtures must use invented identifiers, paths, and content.
- A future generated analysis should be independently replaceable while still
  being removed when its run is deleted.

Local-first storage reduces exposure but does not make captured data harmless.
Users should review runs before sharing logs, screenshots, exports, or database
copies.

## Review Checklist For New Data

Before adding a retained field or source, answer:

1. What concrete debugging or analysis question requires it?
2. Can a normalized category, count, path, outcome, or reference answer that
   question without retaining content?
3. Is the value an observation, evidence status, interpretation, or research
   material?
4. What makes the source trustworthy enough for that role?
5. Could it contain prompts, responses, reasoning, source code, credentials,
   personal data, or unrelated workspace information?
6. Where is it inspected, validated, stored, displayed, exported, and deleted?
7. How will format drift, ambiguity, partial extraction, and false inference be
   represented?
8. Which privacy, schema, and deletion tests prevent accidental widening?

If these questions do not have bounded answers, the field should remain
excluded.

## Related Documents

- [Architecture Decisions](./architecture-decisions.md)
- [MCP Semantic Logger](./mcp-semantic-logger.md)
- [Agent Execution Log Event Source](./provider-history-event-source.md)
- [Agent Execution Log Formats](./provider-history-formats.md)
- [Postmortem And Skill Improvement](./postmortem-and-skill-improvement.md)
- [Phased Skill Debugging Plan](./phased-skill-debugging-plan.md)
