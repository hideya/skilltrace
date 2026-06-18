# SkillTrace

**SkillTrace is an experimental observability substrate for AI agent skills.**

It correlates passive traces of skill activation, such as `SKILL.md` file access, with active semantic declarations emitted by the model through an MCP logging tool.

The goal is to understand when a natural-language skill is merely read, when it is declared as used, and when it may have actually influenced an agent run.

Long term, SkillTrace aims to help turn AI agent failures into reusable, postmortem-backed procedural knowledge.

> The unit of human knowledge accumulation is shifting from documents to executable work units enriched with failure histories.

---

## Why SkillTrace?

AI agent skills are becoming a new way to package procedural knowledge.

A skill may contain:

- natural-language instructions
- applicability conditions
- constraints
- reference materials
- scripts
- tools
- templates
- organizational context

Unlike traditional documents, skills are not only read by humans. They can be directly consumed and acted upon by AI agents.

This creates a new observability problem.

Tool calls are relatively easy to trace because they cross an external boundary. Skills are harder. A model may read a `SKILL.md` file, absorb it into context, and apply it without producing a clear external event that says:

> “This skill was used here.”

SkillTrace starts from a simple question:

> When a skill fails, do we have enough evidence to reconstruct, analyze, improve, and re-evaluate that failure?

---

## Core idea

SkillTrace separates two kinds of evidence.

### 1. Passive mechanical traces

Facts captured without relying on the model’s self-report.

Examples:

- `SKILL.md` was accessed
- a reference file was accessed
- a script was executed
- a skill file hash was recorded
- an MCP tool was called
- an artifact was read or written

Passive traces help answer:

> What actually happened at the system boundary?

### 2. Active semantic traces

Structured declarations emitted by the model through an MCP logging tool.

Examples:

- why the skill appears applicable
- what assumptions the model is making
- what risks it has identified
- which steps it expects to apply
- which steps it actually applied
- where it deviated from the skill
- what uncertainty remains

Active traces help answer:

> How did the model claim to understand and use the skill?

SkillTrace compares the two.

> Capture mechanical facts passively. Ask models to declare semantic intent actively.

---

## MVP architecture

SkillTrace is currently local-first. The initial product shape is a local
debugging utility:

```bash
pnpm traceskill serve
cd <repo>
pnpm --dir /path/to/skill-trace traceskill start --target "$PWD"
codex
pnpm --dir /path/to/skill-trace traceskill end
```

The local daemon serves the web UI, owns one active trace session globally,
supervises the passive probe, and receives MCP semantic events.

```text
Local LLM environment
  ├─ Agent / LLM client
  ├─ Skills directory
  ├─ traceskill CLI
  │    └─ starts / ends the active local trace session
  ├─ macOS passive probe
  │    └─ watches SKILL.md / references access
  │
  └─ MCP client
       └─ calls skill_log_event MCP tool

SkillTrace local daemon
  ├─ Web UI
  │    ├─ run timeline
  │    ├─ skill access view
  │    ├─ semantic log view
  │    └─ mismatch detection
  │
  ├─ Local HTTP API
  │    ├─ active session lifecycle
  │    ├─ passive event receiver
  │    └─ semantic event receiver
  │
  ├─ MCP server command
  │    └─ skill_log_event
  │
  ├─ Trace store
  │    ├─ mechanical events
  │    ├─ semantic events
  │    └─ artifacts / snapshots
  │
  ├─ Consistency checker
  │    └─ compares passive activation and declared use
```

The initial design avoids introducing a heavy skill runner or remote service.

A strong runner may change the execution environment too much. A remote service
also complicates the best local passive-observation experience. Instead,
SkillTrace keeps normal agent execution as intact as possible and adds
observability around it.

> Keep execution as natural as possible. Add observability around it.

---

## Debug instrumentation

A skill may include debug instrumentation in `SKILL.md`, or the same instructions may be injected through an external instrumentation overlay.

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

This does not attempt to capture hidden chain-of-thought.

It asks the model to emit explicit, inspectable declarations that can be compared with passive traces.

---

## Example semantic event

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

---

## Consistency checks

SkillTrace’s first useful feature is a simple consistency checker.

Examples:

### Observed and declared

- `SKILL.md` was read
- `skill_use_started` was logged
- `skill_use_finished` was logged

Interpretation:

> Activation and declared use are aligned.

### Read but not declared

- `SKILL.md` was read
- no `skill_use_started` event was logged

Possible interpretations:

- the instrumentation instruction was ignored
- the skill was read but not used
- the skill was implicitly applied
- activation and use are hard to distinguish

### Declared but not observed

- no `SKILL.md` read was observed
- `skill_use_started` was logged

Possible interpretations:

- the skill was already in context
- the passive harness missed the access
- the model hallucinated skill use
- an external instrumentation overlay triggered the declaration

### Started but not finished

- `SKILL.md` was read
- `skill_use_started` was logged
- no `skill_use_finished` event was logged

Possible interpretations:

- the task was interrupted
- a tool failed
- the model deviated to another skill
- completion logging was skipped

---

## Initial experiment

The first experiment compares the same skill, same task, and same model under different observability conditions.

### Condition A: No instrumentation

Normal skill execution. Only input and output are saved.

### Condition B: Passive monitoring only

The file access tracking harness is enabled, but no semantic logging is requested.

### Condition C: Passive monitoring + inline debug instrumentation

Debug instrumentation is added inside `SKILL.md`.

### Condition D: Passive monitoring + external instrumentation overlay

The skill file remains unchanged, but instrumentation instructions are injected externally.

### Condition E: Strong debug protocol

The model is strongly instructed to declare skill use before and after execution, including assumptions, risks, deviations, and uncertainties.

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

---

## Initial target skill

The first target skill should be useful in real daily development work.

Recommended starting point:

> PR review skill

Reasons:

- inputs and outputs are concrete
- Git diffs, tests, CI results, and review comments are natural artifacts
- failures are relatively easy to identify
- failures can often be turned into regression cases
- SkillTrace can be dogfooded during its own development

Other possible early skills:

- implementation planning skill
- technical research skill
- test failure triage skill
- DB migration review skill

---

## MVP v0 scope

MVP v0 includes:

- `skill_log_event` MCP tool
- passive file access event receiver
- local file access tracking harness
- trace event store
- run ID correlation
- simple consistency checker
- run timeline web UI
- instrumentation ON/OFF comparison support

MVP v0 does not include:

- advanced postmortem generation
- automatic regression test generation
- skill trust cards
- public skill registry
- complex permission management
- multi-user collaboration
- supply-chain security
- full OpenTelemetry integration

The first milestone is not to manage skills.

It is to observe them.

---

## Long-term vision

Most agent and skill discussions focus on:

- making agents more autonomous
- improving tool use
- increasing task success rates
- automating workflows
- packaging reusable prompts or procedures

SkillTrace focuses on a different question:

> Can a skill failure become reusable collective knowledge?

Long term, SkillTrace may evolve toward:

- skill incident schemas
- skill postmortem schemas
- skill trust cards
- known failure modes
- regression case registries
- skill version lineage
- GitHub PR integration
- OpenTelemetry integration
- skill reliability metrics
- public and private skill trace sharing
- LLM-assisted postmortem drafting
- postmortem-backed skill registries

The goal is not merely a skill repository.

The goal is:

> A system for attaching failure histories and improvement histories to executable knowledge.

---

## Slogan

> Trace skill activation passively.  
> Ask models to declare skill use actively.  
> Compare the two.  
> Turn failures into reusable procedural knowledge.
