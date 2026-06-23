# Type Fix Skill

This is a SkillTrace sandbox skill fixture. It is not an installed Codex skill.

## Applicability

Use this skill when the user asks to fix TypeScript, syntax, or source errors in this sandbox repository.

## Instrumentation

Context instrumentation is expected to happen before this skill is read. If the
`skill_trace_context` MCP tool is available and no run context has been declared
yet, call it before applying this skill.

If the `skill_log_event` MCP tool is available, call it before applying this skill:

```json
{
  "event_type": "skill_use_started",
  "skill_name": "type-fix",
  "skill_version": "0.1.0",
  "skill_path": ".skills/type-fix/SKILL.md",
  "summary": "Using the type-fix skill to repair TypeScript errors.",
  "confidence": "medium",
  "related_artifacts": [
    ".skills/type-fix/references/checklist.md"
  ],
  "data": {
    "why_applicable": "The user asked to fix TypeScript or syntax errors.",
    "expected_steps": "run type check, inspect diagnostics, make minimal fixes, rerun type check"
  }
}
```

When you read a required or recommended supporting reference for this skill,
call `skill_log_event` after reading it with the event type
`skill_reference_read`. Use `skill_name` and `skill_path` for the parent skill,
and put the reference file path in `related_artifacts` and
`data.reference_path`. For this fixture, report the checklist reference read:

```json
{
  "event_type": "skill_reference_read",
  "skill_name": "type-fix",
  "skill_version": "0.1.0",
  "skill_path": ".skills/type-fix/SKILL.md",
  "summary": "Read the type-fix checklist reference.",
  "confidence": "medium",
  "related_artifacts": [
    ".skills/type-fix/references/checklist.md"
  ],
  "data": {
    "reference_path": ".skills/type-fix/references/checklist.md",
    "reference_role": "required checklist"
  }
}
```

After applying this skill, call `skill_log_event` again:

```json
{
  "event_type": "skill_use_finished",
  "skill_name": "type-fix",
  "skill_version": "0.1.0",
  "skill_path": ".skills/type-fix/SKILL.md",
  "summary": "Finished repairing TypeScript errors.",
  "confidence": "medium",
  "data": {
    "steps_applied": "record the concrete steps taken",
    "references_used": [
      ".skills/type-fix/references/checklist.md"
    ],
    "uncertainties": "record anything not verified"
  }
}
```

After `skill_use_finished`, call `skill_trace_reflection` if it is available.
Use it to summarize skill usage, skipped or delayed steps, uncertainties, trace
quality, and possible skill improvements. Do not include hidden chain-of-thought.

If the MCP tool is unavailable, continue normally and mention that SkillTrace instrumentation was unavailable.

## Procedure

1. Run `pnpm tsc`.
2. Read the diagnostics carefully.
3. Check `.skills/type-fix/references/checklist.md`.
4. Fix the smallest number of source lines needed.
5. Run `pnpm tsc` again.
6. Report the files changed and final verification result.

## Constraints

- Do not modify files outside this sandbox repository.
- Do not rewrite working code unnecessarily.
- Prefer direct fixes over abstractions.
- Keep output concise.
