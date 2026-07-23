# Postmortem And Skill Improvement Design

Status: future design direction; automatic generation is not implemented

This document describes how SkillTrace may later turn retained run observations
into automatic postmortems and skill-improvement candidates. The capture
requirements begin now because discarded execution-log facts cannot be
recovered reliably after local agent logs rotate or formats change.

The execution-log collection design is documented in
[Agent Execution Log Event Source](./provider-history-event-source.md). The
broader project motivation is documented in
[Project Draft](./project-draft.md).

## Core Principle

> Be aggressive about semantic coverage, but conservative about retained
> content.

SkillTrace should preserve a broad set of privacy-safe mechanical facts while
rejecting raw conversational and execution content. Future analysis needs the
sequence of meaningful events, not a transcript.

The cross-source retention and reasoning policy is defined in
[Data And Evidence Management](./data-and-evidence-management.md).

Aggressive semantic coverage does not lower the threshold for consistency
evidence. Failed attempts, retries, edits, searches, and unsupported envelopes
may be useful postmortem context without becoming proof that a skill was used or
caused an outcome.

## Three-Layer Model

### Observation

An observation records what one source mechanically captured and what its
adapter safely normalized. It includes provenance, ordering, extraction method,
confidence, and collection health.

Observations are the durable input to later analysis. They should remain useful
even when SkillTrace changes its consistency or postmortem policy.

### Evidence Status

Evidence status records the current policy decision over an observation. An
observation may qualify as consistency evidence, remain context-only, be
excluded as circular, or be only partially understood.

Evidence policy should be versioned. Reclassifying an observation must not
require changing the original mechanical fact.

### Interpretation

Interpretation is a derived conclusion: a postmortem statement, possible skill
influence, or skill-improvement suggestion. It is revisable and must cite the
observations and uncertainty that support it.

Generated prose is not evidence and must never replace the observations from
which it was produced.

## Analysis Inputs

| Input                            | Contribution                                                | Limitation                                         |
| -------------------------------- | ----------------------------------------------------------- | -------------------------------------------------- |
| Run Git and instruction snapshot | Skill version and authored context seen by the run          | May rely on Git provenance for unchanged files     |
| Passive file access              | Independent mechanical reads                                | Weak operation semantics and intent                |
| Semantic MCP events              | Declared skill lifecycle, applicability, and deviations     | Cooperative agent self-report                      |
| Agent execution logs             | Tool operations, ordering, outcomes, paths, and terminal state | Client-owned and format-unstable                  |
| Final reflection                 | Agent attribution, uncertainty, and outcome assessment      | Retrospective self-report                          |
| Structured decision observations | Plan revisions, uncertainty, conflicts, and changed hypotheses | Future bounded categories, not raw reasoning     |
| Repository outcome               | Changed files, artifacts, and later regression results      | Does not establish why a change happened           |

No source is ground truth. A postmortem should state which inputs were available,
which were incomplete, and where they disagreed.

## Facts Worth Capturing Now

The retained run record should preserve, when structurally available:

- skill and reference consultation, with normalized paths and order
- operation categories and timestamps
- outer and nested tool-call relationships
- searches, reads, edits, patches, and artifact creation as safe categories
- repository-relative affected paths
- tests, typechecks, lints, and builds
- success, failure, abort, timeout, and cancellation outcomes
- failed attempt, correction, retry, and recovery transitions
- exit codes and durations
- agent, model, client version, source format, and adapter version
- normalized recorded execution constraints and operating mode, including
  sandbox, network, approval, reasoning effort, and changed setting names
- source record position and non-content deduplication fingerprint
- extraction method, confidence, completeness, and partial status
- aggregate recognized, unsupported, circular, and intentionally ignored counts

High-signal events should remain individually ordered. Repetitive low-value
activity may be summarized only after preserving failures, recovery,
verification transitions, and other facts whose sequence affects interpretation.

## Retention Boundary

The collector may inspect private agent-log fields transiently to classify a
record, but it must not retain or send:

- prompts, responses, agent-client-generated conversation or reasoning summaries,
  or reasoning content
- raw tool output or error streams
- complete shell commands
- JavaScript or other agent-client program wrappers
- raw arguments or arbitrary agent-log payloads
- complete agent-client policy objects, workspace-root lists, base
  instructions, or embedded developer instructions
- patches, diffs, edited content, or unrelated file contents
- arbitrary absolute paths outside the existing path policy
- credentials, account data, telemetry, attachments, or billing data

The retained schema should be an allowlist. An opaque extension bag is not a
future-proofing mechanism because it silently recreates the agent transcript
inside SkillTrace.

## Reasoning And Decision Signals

Raw reasoning may expose planning, uncertainty, alternatives, instruction
conflicts, or changing failure hypotheses. It is still a poor durable analysis
input because it can contain sensitive unrelated content, varies by agent
client,
is difficult to redact, and is not guaranteed to be a faithful causal account.
Normal SkillTrace collection therefore does not mine or retain it.

The preferred path is to ask for concise structured declarations through run
context, semantic events, and reflection. Future deterministic analysis may
also derive bounded categories such as `plan_revised`,
`verification_changed_course`, or `failure_hypothesis_rejected` from those
declarations and observed execution transitions.

Decision signals are context for interpretation, not automatic consistency
evidence. They must carry source, extraction method, confidence, and supporting
observation references without retaining prose excerpts.

Any future evaluation of reasoning exposed in agent logs must remain a
separately approved, off-by-default research mode. It requires local-only
processing, explicit per-run consent, separate encrypted storage, short
retention, exclusion from normal exports and diagnostics, and evidence that
structured declarations cannot answer the same question.

## Postmortem Construction

A future deterministic preparation stage should:

1. select observations inside the run interval
2. assess collection and extraction health for every source
3. construct an ordered operation graph, including nested and correlated calls
4. identify skill and reference consultation points
5. identify meaningful episodes such as failure, correction, retry, and recovery
6. compare mechanical observations with semantic declarations and reflection
7. attach repository outcomes and verification results
8. expose disagreements and missing evidence before generating prose

An LLM-assisted postmortem may then describe:

- the skill and instruction version in scope
- available evidence and confidence
- the observed execution sequence
- failures, retries, recovery, and verification transitions
- agreement and disagreement between observation and agent report
- affected files or artifacts
- outcome level: operation, verification, repository, task, or evaluated
- parser, collection, and evidence gaps
- candidate follow-up and regression scenarios

The generated result should cite stable run event IDs or observation IDs. It
should never cite raw agent-log lines that SkillTrace intentionally did not
retain.

## Skill-Improvement Candidates

A postmortem may produce a candidate improvement, but it should not edit a skill
automatically. A useful candidate contains:

- target skill path and version or run snapshot reference
- supporting observation IDs
- repeated failure or ambiguity pattern
- proposed change category, such as clarification, ordering, guardrail, example,
  or verification step
- expected benefit and possible downside
- suggested regression scenario
- confidence and unresolved uncertainty
- human disposition: proposed, accepted, rejected, or superseded

Suggestions should prefer concrete patterns such as repeated failed verification
before one missing step. A single temporally adjacent operation is not enough to
claim that the skill caused either the failure or the recovery.

## Causation And Confidence Rules

- Temporal order establishes sequence, not causation.
- Agent execution logs establish what the client recorded, not model intent.
- Reflection establishes what the agent reported, not objective correctness.
- Agreement across independent sources can increase confidence.
- Missing execution-log evidence may indicate collection or extraction gaps.
- A successful command establishes an operation outcome, not task quality.
- Evaluated success requires an external check, human judgment, or another
  explicitly identified evaluator.

Every generated conclusion should distinguish direct observation, policy-based
evidence status, and interpretation.

## Storage And Display

Normalized observations should remain attached to the run and follow its
deletion policy. Generated postmortems and improvement candidates should record
their analysis version and remain replaceable.

The UI does not need to display every retained operation. It can show a compact
execution summary, meaningful transitions, source health, and links to the
supporting timeline. Storage should preserve enough granularity for a later
analysis version to produce a different summary.

## Phased Path

### Phase 1: Capture Foundation

- broaden privacy-safe operation coverage
- preserve ordering, nesting, failures, retries, and extraction health
- keep consistency verdicts unchanged

### Phase 2: Deterministic Episodes

- derive consultation and verification sequences
- identify failure, correction, retry, and recovery episodes
- derive bounded decision categories from explicit declarations and mechanical
  transitions
- expose source disagreement and coverage gaps without generated prose

### Phase 3: Postmortem Drafts

- generate cited drafts from normalized observations
- version the analysis policy and prompt
- compare drafts with agent reflection and human assessment

### Phase 4: Skill-Improvement Candidates

- produce bounded, evidence-linked candidate changes
- require human acceptance
- connect accepted candidates to regression scenarios and skill version lineage

## Open Questions

- Which operation transitions are useful enough to retain individually?
- How should observation and analysis schemas evolve independently?
- What minimum evidence should permit a skill-improvement suggestion?
- How should multiple skills used in one run share or separate influence windows?
- Which external evaluators can establish task-level or evaluated outcomes?
- How should accepted improvements link later runs back to the originating
  failure and postmortem?
- Which decision categories are useful and reliable enough to retain without
  reasoning excerpts?
