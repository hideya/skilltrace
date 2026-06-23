# Type Fix Skill

This is a SkillTrace sandbox skill fixture. It is not an installed Codex skill.

## Applicability

Use this skill when the user asks to fix TypeScript, syntax, or source errors in this sandbox repository.

## SkillTrace Metadata

Use this metadata with the tracing policy in `.skilltrace/instrumentation.md`.

- `skill_name`: `type-fix`
- `skill_version`: `0.1.0`
- `skill_path`: `.skills/type-fix/SKILL.md`
- start summary: `Using the type-fix skill to repair TypeScript errors.`
- finish summary: `Finished repairing TypeScript errors.`
- why applicable: `The user asked to fix TypeScript or syntax errors.`
- expected steps: `run type check, inspect diagnostics, make minimal fixes, rerun type check`
- required references:
  - path: `.skills/type-fix/references/checklist.md`
  - role: `required checklist`

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
