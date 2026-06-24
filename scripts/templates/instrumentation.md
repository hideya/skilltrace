# SkillTrace Instrumentation

This file is tracing policy, not a task skill. Follow it when SkillTrace MCP
tools are available, but do not treat this file as a skill to start or finish.

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

## Skill Lifecycle

When applying a task skill, emit `skill_log_event` before the skill-guided work
starts:

```json
{
  "event_type": "skill_use_started",
  "skill_name": "skill name from the task skill metadata",
  "skill_version": "skill version from the task skill metadata",
  "skill_path": "path to the task skill file",
  "summary": "Why this skill is being used for the current task.",
  "confidence": "medium",
  "related_artifacts": ["required or recommended reference paths"],
  "data": {
    "why_applicable": "Brief reason the skill applies.",
    "expected_steps": "Brief expected procedure."
  }
}
```

When the skill-guided work is complete, emit `skill_log_event` again:

```json
{
  "event_type": "skill_use_finished",
  "skill_name": "skill name from the task skill metadata",
  "skill_version": "skill version from the task skill metadata",
  "skill_path": "path to the task skill file",
  "summary": "What the skill-guided work completed.",
  "confidence": "medium",
  "data": {
    "steps_applied": "Concrete steps taken.",
    "references_used": ["supporting references actually used"],
    "uncertainties": "Anything not verified."
  }
}
```

## Skill References

When you read a required or recommended supporting reference for a task skill,
emit `skill_log_event` after reading it:

```json
{
  "event_type": "skill_reference_read",
  "skill_name": "parent skill name",
  "skill_version": "parent skill version",
  "skill_path": "path to the parent task skill file",
  "summary": "Read a supporting reference for the skill.",
  "confidence": "medium",
  "related_artifacts": ["path to the reference file"],
  "data": {
    "reference_path": "path to the reference file",
    "reference_role": "why the reference matters"
  }
}
```

Do not emit separate skill lifecycle events for supporting reference files
unless they are standalone skills with their own `SKILL.md`.

## Run Reflection

After emitting `skill_use_finished`, call `skill_trace_reflection`:

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
  "recommended_skill_changes": ["suggest skill or instrumentation improvements, if any"],
  "summary": "One-sentence reflection summary."
}
```

Do not include hidden chain-of-thought. Report only concise, user-visible
diagnostic summaries.
