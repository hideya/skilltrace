# Agent Guidelines

This repository is used for SkillTrace instrumentation trials.

## Commands

- `pnpm tsc` - Run the type check

## SkillTrace Experiment

When asked to fix TypeScript, syntax, or source errors:

1. If the `skill_trace_context` MCP tool is available, call it before reading or applying any skill:
   ```json
   {
     "model": "your best guess at the LLM model name; append '(uncertain)' if not directly known",
     "client": "your best guess at the client or runtime surface; append '(uncertain)' if not directly known",
     "cwd": "absolute path to this repository",
     "task_summary": "One-sentence summary of the current user request.",
     "notes": "Briefly explain any uncertainty about model or client identity."
   }
   ```
2. Read `.skills/type-fix/SKILL.md`.
3. Follow its instrumentation instructions if the `skill_log_event` MCP tool is available.
4. Make the smallest code changes needed to pass `pnpm tsc`.
5. Do not modify files outside this repository.

Use the existing source files as the task input for testing the SkillTrace trace loop.
