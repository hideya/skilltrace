
# AI Agent Skills Observability Project Draft  
## Toward Executable Collective Intelligence with Failure Histories

## 1. Background

AI agents and agent skills are beginning to change the structure of knowledge.

Historically, the primary unit of human knowledge accumulation has been the document: books, papers, manuals, specifications, design notes, blog posts, and operating procedures. These artifacts are read by humans, interpreted by humans, and then translated into action by humans.

Agent skills are different.

A skill is not merely a document. It may contain natural-language instructions, procedural steps, applicability conditions, constraints, reference materials, scripts, tools, templates, and organizational context. More importantly, it can be directly consumed and acted upon by an AI agent.

In this sense, knowledge is beginning to shift from something that is only read to something that can be executed.

This project starts from the following hypothesis:

> The unit of human knowledge accumulation is shifting from documents to executable work units enriched with failure histories.

This is not merely a change in AI agent performance. It is a broader shift in how knowledge, experience, failure, improvement, and trust may be stored, shared, and reused.

## 2. Problem Statement

AI agent skills may become reusable units of individual and organizational expertise. They may encode not only what people know, but how people act, decide, review, check, and recover.

But a skill does not become collective intelligence merely by being shared. To become a trustworthy, executable unit of collective intelligence, a skill must accumulate failure histories, incorporate them into its evolution, and clearly expose the conditions under which it fails.

However, current skill systems have a fundamental observability problem.

In many agent environments, it is difficult to know:

- when a skill was actually read
- whether a skill was actually used or merely referenced
- which assumptions, risks, or procedural steps influenced the run
- whether the model followed, skipped, or deviated from the skill
- whether a failure can be reconstructed after the fact
- whether the failure can be connected to a skill patch, postmortem, or regression test
- whether the maturity of a skill can be evaluated through its failure history

Tool calls and MCP interactions are relatively observable because they cross an external boundary.

Skills are different. A natural-language skill can dissolve into the LLM context. The model reads the skill, interprets it, and may incorporate it into its behavior without producing a clear external event that says: “this skill was used here.”

Therefore, the first technical problem for this project is:

> How can we trace the activation and use of natural-language agent skills when they are absorbed into the LLM execution context?

## 3. Project Principle

This project does not start by building a generic skill marketplace or a large-scale registry.

Instead, it starts from a small, practical loop:

1. create a skill
2. use it in real work
3. observe failures
4. record the failure
5. write a postmortem
6. improve the skill
7. add a regression case
8. use the skill again

The goal is to discover the real requirements of skill governance from actual failures, not from abstract design.

The initial principle is:

> Do not design skill governance abstractly. Grow it from real skill failures.

However, this loop requires one thing first: enough evidence to reconstruct what happened when a skill failed.

Therefore, the first MVP is not a postmortem platform. It is a skill observability substrate.

## 4. MVP Focus

The MVP focuses on tracing skill activation and declared skill use.

The central question is:

> When a skill fails, do we have enough evidence to reconstruct, analyze, improve, and re-evaluate that failure?

More specifically:

> Can we correlate passive traces of skill activation with active semantic declarations of skill use?

Tool calls are relatively easy to observe.

Skills are harder because the model may read a `SKILL.md` file and then incorporate its instructions naturally into the run. There may be no explicit event indicating whether the skill was actually applied.

The MVP therefore separates two kinds of traces:

- Passive mechanical traces
- Active semantic traces

The core idea is to collect both and compare them at the run level.

## 5. Passive Mechanical Trace

A passive mechanical trace records observable facts without relying on the model’s self-report.

Examples include:

- `SKILL.md` was accessed
- a reference file was accessed
- a script was executed
- a skill file hash was recorded
- an MCP tool was called
- an artifact was read
- an artifact was written
- a local file was accessed during the run

This trace answers the question:

> What actually happened at the system boundary?

For skills, the most important initial signal is skill file access.

If the agent reads `skills/pr-review/SKILL.md`, we can treat that as evidence of skill activation. However, activation is not the same as use. A skill may be read, considered, partially used, ignored, or superseded by another skill.

Therefore, passive trace should be treated as evidence of activation, not proof of actual skill use.

## 6. Active Semantic Trace

An active semantic trace records declarations made by the model about how it intends to use, or has used, a skill.

Examples include:

- why the skill appears applicable
- what assumptions the model is making
- what risks it has identified
- which steps it expects to apply
- which steps it actually applied
- where it deviated from the skill
- what uncertainty remains
- what should be escalated to a human

This trace answers the question:

> How did the model claim to understand and use the skill?

This is not meant to capture the model’s hidden chain of thought. The goal is not to log private reasoning. The goal is to obtain explicit, structured, inspectable declarations that help reconstruct failures and improve skills.

The guiding principle is:

> Capture mechanical facts passively. Ask models to declare semantic intent actively.

## 7. Debug Instrumentation

To obtain active semantic traces, each `SKILL.md` may include a debug
instrumentation section, or the same instructions may be provided through an
external instrumentation overlay. The current prototype favors a pluggable
overlay:

```md
Before starting any task, read and follow `.skilltrace/instrumentation.md` for SkillTrace MCP tracing.
```

In this pattern, `.skilltrace/instrumentation.md` contains generic tracing
policy, while each task skill keeps only task-specific metadata such as skill
name, version, path, summaries, applicability reason, expected steps, and
required references.

Example:

```md
## Debug instrumentation

When instrumentation is enabled:

Before applying this skill, call the `skill_log_event` MCP tool with:
- event_type: "skill_use_started"
- skill_name
- skill_version
- why_applicable
- assumptions
- expected_steps
- risk_flags

After applying this skill, call the `skill_log_event` MCP tool with:
- event_type: "skill_use_finished"
- skill_name
- skill_version
- steps_applied
- deviations_from_skill
- uncertainties
- artifacts_created
- recommended_followup

If instrumentation is unavailable, continue the task normally and report that instrumentation was unavailable.
```

This instrumentation asks the model to declare skill use before and after applying the skill.

However, instrumentation may change model behavior. The act of asking the model to log its assumptions and risks may make it more careful, slower, more verbose, or more conservative.

Therefore, the MVP should compare multiple conditions:

- no instrumentation
- inline instrumentation inside `SKILL.md`
- external instrumentation overlay
- stronger debug protocol

The goal is not to assume instrumentation is neutral. The goal is to measure its effect.

## 8. MVP Architecture

The MVP, tentatively called **SkillTrace**, consists of a local observation harness and a server that receives both passive and active events.

The purpose of SkillTrace is:

> To correlate passive skill activation with declared skill use.

High-level architecture:

```text
Local LLM environment
  ├─ Agent / LLM client
  ├─ Skills directory
  ├─ File access tracking harness
  │    └─ watches SKILL.md / references / scripts access
  │
  └─ MCP client
       └─ calls skill_log_event MCP tool

SkillTrace server
  ├─ MCP server
  │    └─ skill_log_event
  │
  ├─ Passive event receiver
  │    └─ receives file access events from local harness
  │
  ├─ Trace store
  │    ├─ mechanical events
  │    ├─ semantic events
  │    └─ artifacts / snapshots
  │
  ├─ Consistency checker
  │    └─ compares passive activation and declared use
  │
  └─ Web app
       ├─ run timeline
       ├─ run context view
       ├─ run reflection view
       ├─ mismatch detection
       └─ later: LLM-assisted log analysis
```

A key design choice is to avoid introducing a heavy skill runner at the beginning.

A strong runner may change the execution environment too much. Instead, the initial design keeps the normal agent execution as intact as possible and adds observability from the side.

The design principle is:

> Keep execution as natural as possible. Add observability around it.

## 9. Local File Access Tracking Harness

The local environment includes a lightweight file access tracking harness.

Its role is not to interpret or analyze the run. Its role is to record mechanical observations and send them to the SkillTrace server.

Initial responsibilities:

- detect access to `SKILL.md`
- detect access to reference files
- detect script execution
- compute file hashes
- attach a `run_id`
- send events to the passive event receiver

Example event:

```json
{
  "run_id": "run_2026_001",
  "source": "passive_file_harness",
  "event_type": "skill_file_read",
  "skill": {
    "name": "pr-review",
    "path": "skills/pr-review/SKILL.md",
    "file_hash": "sha256:..."
  },
  "timestamp": "2026-06-18T12:00:00Z"
}
```

For the initial MVP, practical experimentation is more important than perfect non-invasiveness.

Possible implementation approaches include:

- file read wrapper
- filesystem watcher
- mirrored skill directory
- proxy skill directory
- virtual filesystem
- MCP resource-based skill loading

The first version can start with a lightweight wrapper or monitoring harness. More accurate and less invasive mechanisms can be explored later.

## 10. MCP Semantic Logging Tool

The SkillTrace server also hosts an MCP server.

The model uses the `skill_log_event` MCP tool to emit semantic events.

Minimal schema:

```json
{
  "run_id": "run_2026_001",
  "event_type": "skill_use_started",
  "skill": {
    "name": "pr-review",
    "version": "0.1.0",
    "file_hash": "sha256:..."
  },
  "summary": "Using pr-review because the task asks for review of a pull request diff.",
  "data": {
    "why_applicable": [
      "input contains a pull request diff",
      "user asks for review rather than modification"
    ],
    "assumptions": [
      "diff is complete",
      "test results are unavailable"
    ],
    "risk_flags": [
      "possible breaking change",
      "insufficient test coverage"
    ],
    "expected_steps": [
      "check API compatibility",
      "check migration risk",
      "check test coverage"
    ]
  },
  "related_artifacts": [],
  "confidence": "medium"
}
```

Example completion event:

```json
{
  "run_id": "run_2026_001",
  "event_type": "skill_use_finished",
  "skill": {
    "name": "pr-review",
    "version": "0.1.0"
  },
  "summary": "Completed PR review, but runtime behavior could not be verified.",
  "data": {
    "steps_applied": [
      "checked API compatibility",
      "checked test coverage"
    ],
    "deviations_from_skill": [
      "skipped performance review because no benchmark data was available"
    ],
    "uncertainties": [
      "CI result was not available",
      "runtime behavior was not verified"
    ],
    "recommended_followup": [
      "ask human to run integration tests"
    ]
  },
  "confidence": "medium"
}
```

These semantic logs should not be trusted in isolation. They are self-reports. Their value comes from being compared with passive traces and human evaluation.

## 11. Run Identity

To correlate passive monitoring and MCP semantic logging, every event must be associated with the same `run_id`.

The simplest initial approach is an environment variable:

```bash
SKILLTRACE_RUN_ID=run_2026_001
```

Both the local file access harness and the MCP semantic logger use this value.

Future options:

- SkillTrace server creates a run session
- a CLI command starts a run and exports the run ID
- a `get_run_context` MCP tool returns the current run ID
- multiple agents, skills, and MCP servers can be associated with the same run

For MVP v0, an environment variable or local session file is sufficient.

## 12. Trace Event Model

The MVP uses a common event envelope with a flexible payload.

```ts
type TraceEvent = {
  id: string
  runId: string
  timestamp: string

  source:
    | "passive_file_harness"
    | "mcp_semantic_logger"
    | "mcp_proxy"
    | "human_feedback"

  eventType: string

  skill?: {
    name?: string
    version?: string
    path?: string
    fileHash?: string
  }

  artifactRefs?: string[]
  payload: Record<string, unknown>
}
```

Initial passive event types:

- `skill_file_read`
- `skill_reference_read`
- `skill_script_executed`
- `artifact_read`
- `artifact_written`
- `mcp_tool_called`

Initial semantic event types:

- `run_context_declared`
- `skill_use_started`
- `skill_reference_read`
- `skill_use_finished`
- `run_reflection_declared`
- `assumption_declared`
- `risk_declared`
- `deviation_declared`
- `uncertainty_declared`
- `failure_signal_declared`

Initial human or evaluation event types:

- `human_feedback_added`
- `run_marked_success`
- `run_marked_failure`
- `incident_candidate_created`

## 13. Consistency Checker

The most important MVP feature is a consistency checker that compares passive activation traces with active semantic declarations.

### Case A: Observed and declared

- `SKILL.md` was read
- `skill_use_started` was logged
- `skill_use_finished` was logged

Interpretation:

- Activation and declared use are aligned.
- Instrumentation appears to be working.

### Case B: Read but not declared

- `SKILL.md` was read
- no `skill_use_started` event was logged

Possible interpretations:

- the instrumentation instruction was ignored
- the skill was read but not used
- the skill was implicitly applied
- the boundary between activation and use is unclear

### Case C: Declared but not observed

- no `SKILL.md` read was observed
- `skill_use_started` was logged

Possible interpretations:

- the skill was already in context
- the passive harness missed the access
- the model hallucinated skill use
- an external instrumentation overlay triggered the declaration

### Case D: Started but not finished

- `SKILL.md` was read
- `skill_use_started` was logged
- no `skill_use_finished` event was logged

Possible interpretations:

- the task was interrupted
- the model deviated to another skill
- a tool failed
- completion logging was skipped
- the model abandoned the skill midway

### Case E: Read and output resembles skill use, but no semantic log

- `SKILL.md` was read
- no semantic event was logged
- the final output appears to follow the skill

Possible interpretations:

- implicit skill use
- instrumentation compliance failure
- the skill influenced the output but the debug instruction was ignored

The MVP should display these results per run.

## 14. Web App

The SkillTrace server provides a small web application.

Initial views:

### Run Timeline

Shows all events in chronological order.

- passive file events
- semantic MCP events
- tool events
- human feedback

### Skill Access View

Shows which skill files were accessed.

- skill name
- path
- file hash
- timestamp
- related run

### Semantic Log View

Shows model-declared skill use.

- why applicable
- assumptions
- risk flags
- expected steps
- applied steps
- deviations
- uncertainties
- recommended follow-up

### Consistency Check View

Shows mismatches between passive and active traces.

Example:

```text
WARNING: skills/pr-review/SKILL.md was read, but no skill_use_started event was logged.
WARNING: skill_use_started was logged for db-migration-review, but no file access was observed.
PASS: pr-review was read, started, and finished.
```

Later versions may include LLM-assisted log analysis and postmortem drafting. MVP v0 only needs simple consistency checks.

## 15. Initial Experiment Plan

The first experiment compares the same skill, same task, and same model under different observability conditions.

### Condition A: No instrumentation

- normal skill execution
- only input and output are saved

### Condition B: Passive monitoring only

- file access tracking harness is enabled
- no semantic logging

### Condition C: Passive monitoring + inline debug instrumentation

- debug instrumentation is added inside `SKILL.md`
- model uses the `skill_log_event` MCP tool

### Condition D: Passive monitoring + external instrumentation overlay

- `SKILL.md` remains unchanged
- instrumentation is injected externally

### Condition E: Strong debug protocol

- model is strongly instructed to declare skill use before and after execution
- assumptions, risks, deviations, and uncertainties are required

Evaluation dimensions:

- output quality
- tool call count
- latency
- token usage
- skill access frequency
- logging compliance
- passive / active trace consistency
- failure reconstructability
- postmortem draftability
- regression case extractability
- behavior drift caused by instrumentation

This experiment should help answer:

- Does instrumentation change model behavior?
- Does inline instrumentation work better than external instrumentation?
- How often does the model ignore semantic logging instructions?
- How reliable is passive file access monitoring?
- How much can we infer by comparing passive traces and active declarations?
- Which logs are actually useful for future postmortems?

## 16. Initial Target Skill

The first target skill should be one that is useful in daily development work.

Candidates:

- PR review skill
- implementation planning skill
- technical research skill
- test failure triage skill
- DB migration review skill

The recommended first target is a PR review skill.

Reasons:

- input and output are concrete
- Git diffs, tests, CI results, and review comments are natural artifacts
- failures are relatively easy to identify
- failures can often be converted into regression cases
- the project can be dogfooded during its own development

## 17. MVP v0 Scope

MVP v0 includes:

- `skill_log_event` MCP tool
- passive file access event receiver
- local file access tracking harness
- trace event store
- run ID correlation
- simple consistency checker
- run timeline web UI
- instrumentation ON/OFF comparison support

MVP v0 excludes:

- advanced postmortem generation
- automatic regression test generation
- skill trust cards
- public skill registry
- complex permission management
- multi-user collaboration
- supply-chain security
- full OpenTelemetry integration

The first milestone is not to manage skills. It is to observe them.

## 18. Project Differentiation

Most agent and skill discussions focus on:

- making agents more autonomous
- improving tool use
- increasing task success rates
- automating workflows
- packaging reusable prompts or procedures

This project focuses on a different question:

> Can a skill failure become reusable collective knowledge?

The first step toward that goal is to observe:

- when a skill was activated
- when the model declared it was using the skill
- whether the declared use matched the passive trace
- whether enough evidence remains to reconstruct a failure
- whether the failure can later become a postmortem, patch, and regression case

In this framing:

> Skills are executable procedural knowledge units that should mature through failures.

## 19. Long-Term Vision

Beyond the MVP, the project may evolve toward:

- skill incident schema
- skill postmortem schema
- skill trust cards
- known failure modes
- regression case registry
- skill version lineage
- GitHub PR integration
- OpenTelemetry integration
- skill reliability metrics
- public and private skill trace sharing
- LLM-assisted postmortem drafting
- postmortem-backed skill registry

The long-term goal is not merely a skill repository.

The goal is:

> A system for attaching failure histories and improvement histories to executable knowledge.

This would combine ideas from:

- books and documents
- software engineering
- open source development
- SRE postmortem culture
- accident investigation
- quality management
- AI agent observability
- collective intelligence

## 20. Slogan

> Trace skill activation passively.  
> Ask models to declare skill use actively.  
> Compare the two.  
> Turn failures into reusable procedural knowledge.
