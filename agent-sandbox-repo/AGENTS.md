# Agent Sandbox Guidelines

This is a fake repository for testing SkillTrace instrumentation. Do not treat files in this repo as production code.

## Commands

- `pnpm tsc` - Run the sandbox type check

## SkillTrace Experiment

When asked to fix TypeScript, syntax, or source errors:

1. Read `.skills/type-fix/SKILL.md`.
2. Follow its instrumentation instructions if the `skill_log_event` MCP tool is available.
3. Make the smallest code changes needed to pass `pnpm tsc`.
4. Do not modify files outside this sandbox repository.

Use the existing source files as intentionally broken fixtures for testing the SkillTrace trace loop.
