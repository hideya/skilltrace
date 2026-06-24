# SkillTrace MCP Semantic Logger

SkillTrace includes a small stdio MCP server prototype that exposes three
tools:

```text
skill_trace_context
skill_log_event
skill_trace_reflection
```

Together, these tools log declared run context, semantic skill-use declarations,
and a concise run reflection to the local SkillTrace server.

This is the MCP-shaped counterpart to:

```bash
pnpm skilltrace:log
```

## Purpose

Use this server to test the active semantic trace path through an MCP tool interface.

It is intentionally small:

- three MCP tools
- stdio transport
- posts to `/api/skill-log-events`
- uses `SKILLTRACE_RUN_ID`, `SKILLTRACE_RUN_STEM`, and `SKILLTRACE_SERVER`

By itself, this command does not implement passive file observation, skill loading, or a full agent platform.

For the current best local prototype, prefer the local server flow:

```bash
pnpm traceskill:install
traceskill-dev serve
cd <repo>
traceskill-dev start --inject-instructions
```

For package-style trials, create and install a local tarball instead:

```bash
npm pack
npm install -g ./skilltrace-0.0.0.tgz
traceskill daemon start
```

For a Linux container or VM that should be opened from the host machine, start
the daemon with:

```bash
HOST=0.0.0.0 traceskill daemon start
```

Linux passive probing uses `inotifywait` from `inotify-tools`. On Alpine, install
it with:

```bash
apk add inotify-tools
```

If the dependency is missing, SkillTrace still runs semantic MCP tracing and the
timeline records a warning that passive probing is unavailable.

Use plain `traceskill-dev start` for passive-only trials where you do not want
SkillTrace to inject MCP tracing instructions into the target repo.

If your shell cannot find `traceskill-dev`, add `~/.skilltrace/bin` to your `PATH`:

```bash
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.skilltrace/bin"; then
  echo 'export PATH="$HOME/.skilltrace/bin:$PATH"' >> ~/.zshrc
  source ~/.zshrc
fi
```

That starts a passive probe before Codex reads the target repo. On macOS the
probe uses `fs_usage`; on Linux it uses `inotifywait`. The MCP server asks the
SkillTrace server for the one active session ID when the model calls one of the
SkillTrace MCP tools.
`traceskill-dev start` launches the passive probe worker and prompts for sudo from your terminal.

## Start Command

```bash
SKILLTRACE_RUN_STEM=run_mcp_fixture \
SKILLTRACE_SERVER=http://localhost:7555 \
pnpm skilltrace:mcp
```

An MCP client should launch this command as a stdio server.

## Codex MCP Registration

If you have installed the Codex app but not the Codex CLI, define a shell alias to access the bundled CLI version:

```bash
alias codex='/Applications/Codex.app/Contents/Resources/codex'
```

To make it persistent, add that line to your shell rc file, such as `~/.zshrc`.

For Codex, register the SkillTrace MCP server with:

```bash
codex mcp add skilltrace -- traceskill-dev mcp
```

Then confirm the server is registered:

```bash
codex mcp list
codex mcp get skilltrace
```

Open a new Codex session after registration so the tool list is refreshed.

When `traceskill-dev start` is active, `traceskill-dev mcp` resolves the active
SkillTrace session over HTTP. Without an active session, use
`SKILLTRACE_RUN_ID`, `SKILLTRACE_RUN_STEM`, and `SKILLTRACE_SERVER` as shown
below.

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
SKILLTRACE_SERVER=http://localhost:7555 \
pnpm skilltrace:mcp
```

## Tool Input

For real-repo trials, prefer putting generic SkillTrace MCP instructions in a
repo-local `.skilltrace/instrumentation.md` overlay and pointing to it from
`AGENTS.md`. Passive probing also needs `.skilltrace.json` to declare skill
roots, usually `{"skill_roots":[".skills"]}`. Task skills should provide only
task-specific metadata, such as skill name, version, path, summaries, and
required references.

The `skill_trace_context` tool records declared run metadata. Ask the agent to
call it at the beginning of a traced run when the MCP tool is available:

It accepts:

- `run_id` optional when an active session, `SKILLTRACE_RUN_ID`, or `SKILLTRACE_RUN_STEM` is available
- `agent` optional and reserved for future use
- `model` as the agent's best guess at the LLM model name; append `(uncertain)` if not directly known
- `client` as the agent's best guess at the client or runtime surface; append `(uncertain)` if not directly known
- `cwd` for the working directory of the target task
- `task_summary` as a short description of the user request
- `notes` for uncertainty about model/client identity or other context
- `data` for extra structured metadata

```json
{
  "run_id": "run_mcp_fixture_001",
  "model": "gpt-5-codex (uncertain)",
  "client": "Codex CLI (uncertain)",
  "cwd": "/path/to/repo",
  "task_summary": "Repair TypeScript errors in the sandbox repo.",
  "notes": "Model and client are self-declared metadata.",
  "data": {
    "mode": "dogfood"
  }
}
```

It creates a `run_context_declared` semantic event.

The `skill_trace_reflection` tool records a concise post-run diagnostic summary.
Ask the agent to call it after completing the task and after emitting
`skill_use_finished`:

```json
{
  "task_outcome": "completed",
  "skills_used": ["type-fix"],
  "steps_followed": [
    "declared run context",
    "read the type-fix skill",
    "ran pnpm tsc",
    "fixed source issues",
    "reran pnpm tsc"
  ],
  "steps_skipped_or_delayed": [
    {
      "step": "read checklist before editing",
      "reason": "read after initial diagnostics"
    }
  ],
  "uncertainties": ["model identity was self-declared"],
  "instrumentation_notes": [
    "called skill_trace_context, skill_log_event, and skill_trace_reflection"
  ],
  "recommended_skill_changes": [],
  "summary": "Completed the type fix task and recorded trace alignment."
}
```

It creates a `run_reflection_declared` semantic event. Reflections should be
concise diagnostic summaries, not hidden chain-of-thought.

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

Use `event_type: "skill_reference_read"` when an agent intentionally reads a
required or recommended supporting reference for a skill. This is the semantic
counterpart to passive file-access observation: passive tracing records that a
file was accessed, while this event records that the agent understood the file
as skill support material.

```json
{
  "event_type": "skill_reference_read",
  "skill_name": "type-fix",
  "skill_version": "0.1.0",
  "skill_path": ".skills/type-fix/SKILL.md",
  "summary": "Read the type-fix checklist reference.",
  "confidence": "medium",
  "related_artifacts": [
    ".skills/type-fix/references/checklist.md"
  ],
  "data": {
    "reference_path": ".skills/type-fix/references/checklist.md",
    "reference_role": "required checklist"
  }
}
```

Do not emit separate skill lifecycle events for supporting reference files
unless they are standalone skills with their own `SKILL.md`.

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
http://localhost:7555/app/runs/<run_id>
```

The event should appear in:

- Timeline
- Expandable timeline details
- Consistency checks

## Notes

The fixture demo still uses CLI helpers for repeatability:

```bash
pnpm skilltrace:demo
```

Use the sandbox runbook for an end-to-end agent test where Codex calls the MCP
tools directly.
