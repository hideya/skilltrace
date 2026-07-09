# Passive Skill Discovery

Status: implemented

This note describes how SkillTrace should interpret passive reads of skill
files when an agent client scans available skills before doing the main task.

## Problem

Passive probing observes file access. It does not know why the file was opened.

In repositories with multiple skills, some agent clients appear to read many or
all top-level `SKILL.md` files near the beginning of a session. This can happen
before the model has selected a specific skill for the user's task.

For example, a run in this repository may observe:

```text
.agents/skills/model/SKILL.md
.agents/skills/route/SKILL.md
```

Those reads may mean "the agent is building a catalog of available skills," not
"the agent materially used both skills." If SkillTrace treats every passive
`SKILL.md` read as a required semantic declaration, normal discovery behavior
can make otherwise useful runs look like warnings.

Reference files are different. A later read such as:

```text
.agents/skills/route/page.md
```

is a stronger signal that the agent followed a skill's progressive disclosure
and consulted task-specific guidance.

## Interpretation

SkillTrace should distinguish these passive-read meanings:

| Evidence | Interpretation | Strength |
| --- | --- | --- |
| Passive `SKILL.md` read only | Skill was discovered or evaluated | Weak |
| Passive `SKILL.md` read plus semantic lifecycle | Skill was declared and used | Strong |
| Passive reference read | Skill guidance was consulted | Strong |
| Passive reference read plus semantic reference event | Reference consultation was declared and observed | Strongest |
| Reflection lists a skill or reference | Agent later attributed influence to it | Self-report |

The timeline should keep all observed events. The classification affects
summaries and consistency verdicts, not data retention.

## Proposed Classification

Top-level skill entrypoint reads should be classified as `discovered` when all
of these are true:

- the passive event is `skill_file_read`
- the path basename is `SKILL.md`
- no matching semantic `skill_use_started` or `skill_use_finished` exists
- no matching reflection entry lists that same skill file
- no reference file under the same skill was read or declared

`discovered` means "SkillTrace saw the agent client read this skill entrypoint,
but there is not enough evidence to call it use."

The following should remain normal consistency evidence:

- reference reads under a skill directory
- semantic skill lifecycle events
- semantic reference read events
- reflection entries
- partial semantic lifecycle events
- files that reflection claims but passive probing missed

## Run Result Policy

A `discovered` skill should not make the run result `warning`.

The run result should be based on material evidence:

- `pass`: all expected material evidence aligns
- `captured`: passive-only mode captured passive evidence
- `warning`: material evidence is missing, partial, or contradictory
- `incomplete`: the run lifecycle is incomplete
- `unknown`: no useful evidence is present

This keeps multi-skill repository scans from making every run look suspicious,
while preserving warnings for meaningful trace gaps.

## UI Treatment

The timeline should continue to show every passive read, including discovered
`SKILL.md` files.

The consistency matrix shows discovered rows with a neutral status:

```text
discovered
```

Discovered rows are omitted from run-result and mode-comparison warning
calculations while remaining visible in run details. The row copy should avoid
judgmental language:

```text
Skill entrypoint was read passively. No later evidence showed material use.
```

Reference rows should keep their current stronger treatment. A passive
reference read without expected semantic or reflection support can still be a
warning in modes that ask for those signals.

## Examples

### Startup Catalog Scan

Observed:

```text
.agents/skills/model/SKILL.md
.agents/skills/route/SKILL.md
```

No semantic lifecycle, no reflection, no reference reads.

Expected interpretation:

```text
model/SKILL.md: discovered
route/SKILL.md: discovered
run result: pass or captured, depending on mode and other evidence
```

### Material Skill Use

Observed:

```text
.agents/skills/route/SKILL.md
.agents/skills/route/page.md
```

Expected interpretation:

```text
route/SKILL.md: discovered or used, depending on semantic/reflection evidence
route/page.md: consulted
```

If full mode expected semantic reference logging and it is missing, the
reference row may still warn.

### Semantic Declaration Without Passive Observation

Observed:

```text
skill_use_started route
skill_use_finished route
```

No matching passive read.

Expected interpretation:

```text
route: warning
```

This is still useful because it means the agent declared usage that passive
probing did not observe.

## Open Questions

- Should `SKILL.md` reads become material evidence when they happen after the
  first task-specific event rather than during startup?
- Should multiple `SKILL.md` reads within the first few seconds of a run be
  labeled as a catalog scan explicitly?
- Should reflection listing a `SKILL.md` upgrade that row from `discovered` to
  material evidence?

## Implementation

The implementation keeps passive event capture unchanged and adds
classification in the consistency layer:

- identify passive-only `SKILL.md` rows with no later matching evidence
- mark them as neutral discovery rows
- exclude neutral discovery rows from `summarizeConsistencyMatrix`
- exclude neutral discovery rows from mode comparison rows
- keep reference rows and semantic/reflection mismatches warning-capable

This avoids hiding data while making the run verdict better match what users
actually need to know.
