# Agent Sandbox Guidelines

This is a fake repository for testing SkillTrace instrumentation. Do not treat files in this repo as production code.

## Commands

- `pnpm tsc` - Run the sandbox type check

## SkillTrace Experiment

When asked to fix TypeScript, syntax, or source errors:

1. If the `skill_trace_context` MCP tool is available, call it before reading or applying any skill:
   ```json
   {
     "agent": "codex",
     "model": "unknown if not available",
     "client": "Codex CLI, Codex Desktop, or unknown",
     "cwd": "absolute path to this sandbox repository",
     "task_summary": "One-sentence summary of the current user request.",
     "notes": "Mention any uncertainty about the agent, model, or client."
   }
   ```
2. Read `.skills/type-fix/SKILL.md`.
3. Follow its instrumentation instructions if the `skill_log_event` MCP tool is available.
4. Make the smallest code changes needed to pass `pnpm tsc`.
5. Do not modify files outside this sandbox repository.

Use the existing source files as intentionally broken fixtures for testing the SkillTrace trace loop.
