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
- uses `SKILLTRACE_RUN_ID`, `SKILLTRACE_RUN_STEM`, and `SKILLTRACE_SERVER`

By itself, this command does not implement passive file observation, skill loading, or a full agent platform.

For the current best local prototype, prefer the local daemon flow:

```bash
pnpm traceskill:install
pnpm traceskill serve
cd <repo>
traceskill start
```

If your shell cannot find `traceskill`, add `~/.local/bin` to your `PATH`:

```bash
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.local/bin"; then
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
  source ~/.zshrc
fi
```

That starts a macOS `fs_usage` passive probe before Codex reads the target repo. The MCP server asks the daemon for the one active session ID when the model calls `skill_log_event`.
`traceskill start` launches the passive probe worker and prompts for sudo from your terminal.

## Start Command

```bash
SKILLTRACE_RUN_STEM=run_mcp_fixture \
SKILLTRACE_SERVER=http://localhost:5173 \
pnpm skilltrace:mcp
```

An MCP client should launch this command as a stdio server.

## Codex MCP Registration

For shorter commands, define a shell alias for command-line Codex:

```bash
alias codex='/Applications/Codex.app/Contents/Resources/codex'
```

To make it persistent, add that line to your shell rc file, such as `~/.zshrc`.

For Codex, register the SkillTrace MCP server with:

```bash
codex mcp add skilltrace -- traceskill mcp
```

Then confirm the server is registered:

```bash
codex mcp list
codex mcp get skilltrace
```

Open a new Codex session after registration so the tool list is refreshed.

When `traceskill start` is active, `traceskill mcp` resolves the daemon's active session over HTTP. Without an active session, use `SKILLTRACE_RUN_ID`, `SKILLTRACE_RUN_STEM`, and `SKILLTRACE_SERVER` as shown below.

To remove the SkillTrace MCP server later:

```bash
codex mcp remove skilltrace
```

When `SKILLTRACE_RUN_STEM` is set, the MCP server generates one run ID at startup:

```text
run_mcp_fixture_20260619_001530
```

All tool calls in that MCP server process use the generated run ID unless the tool input explicitly provides `run_id`.

Use `SKILLTRACE_RUN_ID` when you want a fixed run ID instead:

```bash
SKILLTRACE_RUN_ID=run_mcp_fixture_001 \
SKILLTRACE_SERVER=http://localhost:5173 \
pnpm skilltrace:mcp
```

## Tool Input

The `skill_trace_context` tool records declared run metadata. Ask the agent to
call it at the beginning of a traced run when the MCP tool is available:

It accepts:

- `run_id` optional when an active session, `SKILLTRACE_RUN_ID`, or `SKILLTRACE_RUN_STEM` is available
- `agent` such as `codex`, `claude-code`, or `custom-agent`
- `model` if known, otherwise `unknown`
- `client` such as `Codex CLI`, `Codex Desktop`, or `Custom MCP client`
- `cwd` for the working directory of the target task
- `task_summary` as a short description of the user request
- `notes` for uncertainty about model/client identity or other context
- `data` for extra structured metadata

```json
{
  "run_id": "run_mcp_fixture_001",
  "agent": "codex",
  "model": "declared model name",
  "client": "Codex CLI",
  "cwd": "/path/to/repo",
  "task_summary": "Repair TypeScript errors in the sandbox repo.",
  "notes": "Model name is self-declared metadata.",
  "data": {
    "mode": "dogfood"
  }
}
```

It creates a `run_context_declared` semantic event.

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

`run_id` is optional if `SKILLTRACE_RUN_ID` or `SKILLTRACE_RUN_STEM` is set:

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
