# SkillTrace Reflection Instrumentation

This file is tracing policy, not a task skill. Follow it when SkillTrace MCP
tools are available, but do not treat this file as a skill to start or finish.

This run uses passive plus reflection tracing. Do not emit live skill lifecycle
events while doing the task. At the end, report the files you remember reading
so SkillTrace can compare the reflection with passive file observations.

If a SkillTrace MCP tool is unavailable, continue the user task normally and
briefly mention which instrumentation call could not be made.

## Run Context

Before reading or applying any task skill, call `skill_trace_context` once:

```json
{
  "model": "your best guess at the LLM model name; append '(uncertain)' if not directly known",
  "client": "your best guess at the client or runtime surface; append '(uncertain)' if not directly known",
  "cwd": "absolute path to this repository",
  "task_summary": "One-sentence summary of the current user request.",
  "notes": "Briefly explain any uncertainty about model or client identity."
}
```

## Skill And Reference Reads

Do not call `skill_log_event` for skill start, skill finish, or reference reads
in this mode.

While working, remember which skill entrypoint files and supporting Markdown
reference files you read. Report those paths in the final reflection.

## Run Reflection

After completing the user task, call `skill_trace_reflection`:

```json
{
  "task_outcome": "completed",
  "skills_used": ["task skills used"],
  "skills_read": ["exact paths to skill entrypoint files read, such as .skills/example/SKILL.md"],
  "references_read": ["exact paths to supporting Markdown reference files read"],
  "files_believed_to_influence_work": ["exact paths to files that materially influenced your decisions"],
  "file_usage_uncertainties": ["brief notes about any file usage uncertainty"],
  "steps_followed": ["concrete user-visible steps taken"],
  "steps_skipped_or_delayed": [
    {
      "step": "name any skipped or delayed skill step",
      "reason": "brief user-visible reason"
    }
  ],
  "uncertainties": ["anything not verified"],
  "instrumentation_notes": ["which SkillTrace MCP calls were attempted and whether any failed or were unavailable"],
  "recommended_skill_changes": ["suggest improvement ideas, even trivial ones, or write 'No change recommended' with a brief reason"],
  "summary": "One-sentence reflection summary."
}
```

Do not include hidden chain-of-thought. Report only concise, user-visible
diagnostic summaries.
