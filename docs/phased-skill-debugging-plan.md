# Phased Skill Debugging Plan

## Summary

SkillTrace should support skill development by gradually reducing tracing
intervention while checking whether the observed skill behavior stays
consistent.

The goal is not only to capture more events. The goal is to understand whether
the instrumentation itself is changing the agent's behavior.

## Core Idea

Use three evidence channels:

1. passive file observations
2. live semantic MCP declarations
3. final run reflection

Then compare them across runs that use different levels of intervention.

If a skill behaves consistently when moving from full instrumentation to
reflection-only tracing and then to passive-only tracing, we gain confidence
that SkillTrace is observing the normal behavior rather than creating an
artificial one.

## Mode 1: Full Trace

Evidence:

- passive file observations
- `skill_trace_context`
- live `skill_log_event` lifecycle declarations
- final `skill_trace_reflection`

Purpose:

- debug skill instructions
- debug SkillTrace instrumentation wording
- confirm that task-specific skill metadata is clear enough for the agent
- inspect whether passive observations and live semantic declarations align

Expected use:

- early skill development
- sandbox tests
- real-repo trials where the user is comfortable with stronger tracing

Tradeoff:

- most informative
- most likely to perturb the agent because the agent is asked to emit events
  during the task

## Mode 2: Passive Plus Reflection

Evidence:

- passive file observations
- final `skill_trace_reflection`

Purpose:

- reduce intervention during task execution
- still ask the agent what it believes it read and used after the work is done
- compare passive observations with the agent's retrospective self-report

Expected use:

- validating a skill after Mode 1 looks healthy
- checking real repositories with less task-time interference
- investigating whether live semantic declarations changed behavior

Tradeoff:

- less intrusive than Mode 1
- still produces useful self-report evidence
- reflection remains a model self-report, not objective proof

This is the most distinctive mode. It asks after the task, so it should perturb
task decisions less than live lifecycle logging while still producing enough
structured evidence for consistency checks.

## Mode 3: Passive Only

Evidence:

- passive file observations

Purpose:

- observe the lowest-intervention version of a run
- compare skill and reference access patterns against Mode 1 and Mode 2
- approximate a normal real-world agent run

Expected use:

- final confidence checks
- repeated runs where the user wants minimal tracing pressure
- baseline comparisons

Tradeoff:

- least intrusive
- cannot tell whether the model believed a read file influenced its work
- consistency checks must be weaker and more mechanical

## Reflection File Lists

Mode 2 depends on concrete file lists in the reflection. The reflection should
ask the agent for paths, not just prose.

Proposed reflection fields:

```json
{
  "skills_read": [
    ".skills/type-fix/SKILL.md"
  ],
  "references_read": [
    ".skills/type-fix/references/checklist.md"
  ],
  "files_believed_to_influence_work": [
    ".skills/type-fix/SKILL.md",
    ".skills/type-fix/references/checklist.md"
  ],
  "file_usage_uncertainties": [
    "I may have read other project Markdown files for context, but they were not task skill references."
  ]
}
```

Definitions:

- `skills_read`: skill entrypoint files the agent believes it read.
- `references_read`: Markdown reference files the agent believes it read as
  support for a skill.
- `files_believed_to_influence_work`: files the agent believes materially
  affected its decisions.
- `file_usage_uncertainties`: short notes about uncertainty or ambiguous files.

These fields should be concrete enough for automated comparison but humble
enough to avoid pretending the model has perfect memory.

## Consistency Questions

Within one run:

- Did passive probing observe the skill files listed in reflection?
- Did passive probing observe the reference files listed in reflection?
- Did live semantic declarations match reflection file lists?
- Did reflection omit files that passive probing observed?
- Did reflection mention files that passive probing missed?

Across modes:

- Does Mode 2 reflection agree with Mode 1 live semantic declarations?
- Does Mode 2 passive access resemble Mode 1 passive access?
- Does Mode 3 passive access resemble Mode 1 and Mode 2 passive access?
- Do repeated lower-intervention runs continue reading the same core skill and
  reference files?

## UI Direction

The run detail page should eventually expose a consistency mode selector:

- full run
- passive plus reflection
- passive only

Each mode should make its evidence boundary explicit. A passive-only result
should not look as strong as a full-trace result. It should say what it can
support, and what it cannot.

Current implementation note:

- The consistency matrix treats skill files and reference files as evidence
  rows. SkillTrace's own `.skilltrace/instrumentation.md` is intentionally
  ignored because it is read before semantic tracing can begin and is not a
  target skill/reference file.

- runs record lightweight trace mode metadata without a database migration
- current default `traceskill start` records `full`
- `traceskill start --mode passive_reflection` records `passive_reflection` and
  injects the reduced reflection template
- `traceskill start --mode passive_only` and
  `traceskill start --no-inject-instructions` record `passive_only`
- the run detail page shows the recorded mode in the top metrics
- passive-only runs that capture expected passive evidence are labeled
  `Captured` in the UI instead of `Pass`
- mode-specific instrumentation still writes the target repo file as
  `.skilltrace/instrumentation.md`; bundled templates vary internally while the
  injected AGENTS.md instruction stays stable
- the runs page offers `Compare Modes` when a run group has at least two
  successful modes; the first report compares the latest successful run per mode
  by normalized skill/reference files

Possible result labels:

- `aligned`
- `partially aligned`
- `captured`
- `reflection mismatch`
- `semantic mismatch`
- `insufficient evidence`

## Implementation Notes

Near-term changes:

- extend `.skilltrace/instrumentation.md` reflection guidance with concrete
  file-list fields
- extend `skill_trace_reflection` examples with `skills_read`,
  `references_read`, and `files_believed_to_influence_work`
- show reflected file lists as first-class sections in the Run Reflection panel

Later changes:

- continue refining path normalization for passive, semantic, and reflected file
  comparisons as real repositories expose edge cases
- expand consistency checks that compare passive observations with reflection
  file lists
- add UI mode selection for full, passive-plus-reflection, and passive-only
  checking
- add run comparison support so multiple attempts from the same repo stem can be
  compared across intervention levels

## Non-Goals

- do not try to recover hidden chain-of-thought
- do not treat reflection as objective truth
- do not make passive-only checks claim semantic intent
- do not require all real-repo runs to use full semantic lifecycle logging

## Product Rationale

Mode 1 is useful because it gives the richest debugging trace.

Mode 3 is useful because it gives the lowest-intervention observation.

Mode 2 is the bridge. It gives SkillTrace a practical way to ask the agent what
it believes happened only after the work is done. That makes it less likely to
shape task-time decisions while still giving the consistency checker more than
raw filesystem events.

This phased approach makes SkillTrace a tool for developing and validating
skills, not only logging them.
