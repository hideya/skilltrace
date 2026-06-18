# Type Fix Skill

This is a SkillTrace sandbox skill fixture. It is not an installed Codex skill.

## Applicability

Use this skill when the user asks to fix TypeScript, syntax, or source errors in this sandbox repository.

## Instrumentation

If the `skill_log_event` MCP tool is available, call it before applying this skill:

```json
{
  "event_type": "skill_use_started",
  "skill_name": "type-fix",
  "skill_version": "0.1.0",
  "skill_path": ".skills/type-fix/SKILL.md",
  "summary": "Using the type-fix skill to repair TypeScript errors.",
  "confidence": "medium",
  "data": {
    "why_applicable": "The user asked to fix TypeScript or syntax errors.",
    "expected_steps": "run type check, inspect diagnostics, make minimal fixes, rerun type check"
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
    "uncertainties": "record anything not verified"
  }
}
```

If the MCP tool is unavailable, continue normally and mention that SkillTrace instrumentation was unavailable.

## Procedure

1. Run `pnpm tsc`.
2. Read the diagnostics carefully.
3. Check `references/checklist.md`.
4. Fix the smallest number of source lines needed.
5. Run `pnpm tsc` again.
6. Report the files changed and final verification result.

## Constraints

- Do not modify files outside this sandbox repository.
- Do not rewrite working code unnecessarily.
- Prefer direct fixes over abstractions.
- Keep output concise.
