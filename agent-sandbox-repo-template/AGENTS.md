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
5. After calling `skill_log_event` with `skill_use_finished`, if the `skill_trace_reflection` MCP tool is available, call it with a concise post-run diagnostic summary:
   ```json
   {
     "task_outcome": "completed",
     "skills_used": ["type-fix"],
     "steps_followed": ["list the concrete user-visible steps taken"],
     "steps_skipped_or_delayed": [
       {
         "step": "name any skipped or delayed skill step",
         "reason": "brief user-visible reason"
       }
     ],
     "uncertainties": ["list anything not verified"],
     "instrumentation_notes": ["note which SkillTrace MCP calls you attempted and whether any failed or were unavailable"],
     "recommended_skill_changes": ["suggest skill or instrumentation improvements, if any"],
     "summary": "one-sentence reflection summary"
   }
   ```
   Do not include hidden chain-of-thought; report only concise, user-visible diagnostic summaries.
6. Do not modify files outside this repository.

Use the existing source files as the task input for testing the SkillTrace trace loop.
