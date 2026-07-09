---
name: type-fix
description: Fix TypeScript, syntax, or source errors in this repository. Use when asked to repair compiler diagnostics or broken source code.
---

## Applicability

Use this skill when the user asks to fix TypeScript, syntax, or source errors in this repository.

## Procedure

1. Run `npm run tsc`.
2. Read the diagnostics carefully.
3. Check `.agents/skills/type-fix/references/checklist.md`.
4. Fix the smallest number of source lines needed.
5. Run `npm run tsc` again.
6. Report the files changed and final verification result.

## Constraints

- Do not modify files outside this repository.
- Do not rewrite working code unnecessarily.
- Prefer direct fixes over abstractions.
- Keep output concise.
