# SkillTrace MCP Semantic Logger

SkillTrace includes a small stdio MCP server prototype that exposes one tool:

```text
skill_log_event
```

The tool logs active semantic skill-use declarations to the local SkillTrace server.

This is the MCP-shaped counterpart to:

```bash
pnpm skilltrace:log
```

## Purpose

Use this server to test the active semantic trace path through an MCP tool interface.

It is intentionally small:

- one MCP tool
- stdio transport
- posts to `/api/skill-log-events`
- uses `SKILLTRACE_RUN_ID` and `SKILLTRACE_SERVER`

It does not implement passive file observation, skill loading, or a full agent platform.

## Start Command

```bash
SKILLTRACE_RUN_ID=run_mcp_fixture_001 \
SKILLTRACE_SERVER=http://localhost:5173 \
pnpm skilltrace:mcp
```

An MCP client should launch this command as a stdio server.

## Tool Input

The `skill_log_event` tool accepts:

```json
{
  "event_type": "skill_use_started",
  "skill_name": "pr-review",
  "skill_version": "0.1.0",
  "skill_path": "fixtures/skills/pr-review/SKILL.md",
  "skill_file_hash": "sha256:...",
  "summary": "Using the PR review fixture.",
  "confidence": "medium",
  "related_artifacts": [],
  "data": {
    "why_applicable": "manual MCP fixture test"
  }
}
```

`run_id` is optional if `SKILLTRACE_RUN_ID` is set:

```json
{
  "run_id": "run_mcp_fixture_001",
  "event_type": "skill_use_finished",
  "skill_name": "pr-review",
  "summary": "Completed the PR review fixture."
}
```

## Expected Result

The tool posts a semantic event with:

```text
source = mcp_semantic_logger
```

Open the run detail page:

```text
http://localhost:5173/app/runs/<run_id>
```

The event should appear in:

- Timeline
- Semantic declarations
- Consistency checks

## Notes

The current fixture demo still uses CLI helpers for repeatability:

```bash
pnpm skilltrace:demo
```

The MCP server is the next step toward letting an actual agent declare skill use through a tool boundary.
