# PR Review Fixture Skill

This is a SkillTrace fixture skill for observability testing. It is not a real working Codex skill.

## Applicability

Use this fixture when testing whether SkillTrace can observe a skill-like file being read and declared as used.

## Procedure

1. Read the review checklist in `references/checklist.md`.
2. Identify one likely correctness risk.
3. Identify one likely test coverage gap.
4. Summarize any uncertainty that should be checked by a human.

## Expected Output Shape

- Correctness risk
- Test coverage gap
- Human follow-up

## Debug Instrumentation Fixture

When testing active semantic traces, log `skill_use_started` before applying this fixture and `skill_use_finished` after applying it.
