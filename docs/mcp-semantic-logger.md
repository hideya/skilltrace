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
pnpm skilltrace:install
skilltrace-dev daemon start
cd <repo>
skilltrace-dev start
```

For package-style trials, create and install a local tarball instead:

```bash
npm pack
npm install -g ./skilltrace-0.0.0.tgz
skilltrace daemon start
```

Use `./` or an absolute path for local tarballs. Without it, npm can interpret
the value as a package or GitHub spec and try to contact a registry or git host.

For a Linux container or VM that should be opened from the host machine, start
the daemon with:

```bash
HOST=0.0.0.0 skilltrace daemon start
```

The daemon prints the bind address and a host-reachable UI URL when it can
detect one, for example `http://192.168.64.2:7555`.

Linux passive probing uses `inotifywait` from `inotify-tools`. On Alpine, install
it with:

```bash
apk add inotify-tools
```

If the dependency is missing, SkillTrace still runs semantic MCP tracing and the
timeline records a warning that passive probing is unavailable.

On macOS, daemon mode starts a shared `fs_usage` probe by default:

```bash
skilltrace daemon start
```

This may prompt for your macOS admin password once at daemon startup so
SkillTrace can start the daemon-owned probe. Later `skilltrace start` sessions
attach the active run to that shared probe and should not ask for the password
again during the daemon lifetime. If the shared probe is unavailable, SkillTrace
records a warning and falls back to the normal per-run probe when it can.

For macOS troubleshooting, disable the shared probe with:

```bash
skilltrace daemon start --no-shared-probe
```

Do not run dev and packaged macOS shared-probe daemons at the same time. The
underlying `fs_usage`/ktrace probe is effectively single-owner in this workflow.
Restarting the same command surface cleans up stale shared workers for that
server, and a shared worker exits automatically if it cannot reach its daemon
for about 30 seconds.

Use explicit run modes when comparing intervention levels:

```bash
skilltrace-dev start --mode full
skilltrace-dev start --mode passive_reflection
skilltrace-dev start --mode passive_only
```

`full` is the default and injects context, live skill lifecycle, reference-read,
and reflection guidance. `passive_reflection` injects context and final
reflection guidance only. `passive_only` does not inject MCP tracing
instructions into the target repo. The older `--no-inject-instructions` flag
remains available as a passive-only alias.

If your shell cannot find `skilltrace-dev`, add `~/.skilltrace/bin` to your `PATH`:

```bash
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.skilltrace/bin"; then
  echo 'export PATH="$HOME/.skilltrace/bin:$PATH"' >> ~/.zshrc
  source ~/.zshrc
fi
```

`skilltrace-dev start` marks the current repo as the one active SkillTrace
session before the agent reads the target repo. On macOS, the daemon normally
owns a shared `fs_usage` probe after `skilltrace-dev daemon start`, so later
run sessions should not ask for the password again during that daemon lifetime.
On Linux, each run uses `inotifywait` and does not need sudo. The MCP server
asks the SkillTrace server for the one active session ID when the model calls
one of the SkillTrace MCP tools.

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

For checkout/dev mode, the easiest registration path is:

```bash
skilltrace-dev mcp install
skilltrace-dev mcp status
```

This detects Codex CLI, Claude Code, and Gemini CLI when they are available on
PATH and registers `skilltrace-dev mcp serve` for each supported client.

For package-style trials, use:

```bash
skilltrace mcp install
skilltrace mcp status
```

The equivalent manual Codex registration is:

```bash
codex mcp add skilltrace -- skilltrace-dev mcp serve
```

For package-style trials, register the packaged command manually with:

```bash
codex mcp add skilltrace -- skilltrace mcp serve
```

Then confirm the server is registered:

```bash
codex mcp list
codex mcp get skilltrace
```

Open a new Codex session after registration so the tool list is refreshed.

The local UI also exposes a read-only registration check at `/app/diagnostics`.
It runs `codex mcp get skilltrace` from the server process and compares the
registered command with the current SkillTrace mode:

- checkout/dev mode expects `skilltrace-dev mcp serve`
- package mode expects `skilltrace mcp serve`

Use this page when switching between dogfooding the checkout and testing the
packaged command; a mismatched MCP registration is easy to overlook from the
terminal alone.

## Claude Code MCP Registration

For Claude Code, register the checkout command manually with:

```bash
claude mcp remove skilltrace -s user
claude mcp add skilltrace --scope user -- skilltrace-dev mcp serve
```

For package-style trials, register the packaged command instead:

```bash
claude mcp remove skilltrace -s user
claude mcp add skilltrace --scope user -- skilltrace mcp serve
```

SkillTrace removes the existing Claude Code registration before adding it,
because Claude Code does not overwrite an existing `skilltrace` MCP server.

Then confirm the server is registered:

```bash
claude mcp get skilltrace
```

SkillTrace also shows a read-only Claude Code MCP registration check in
`/app/diagnostics` when the `claude` CLI is available to the server process.

## Gemini CLI MCP Registration

For Gemini CLI, register the checkout command manually with:

```bash
gemini mcp add skilltrace skilltrace-dev mcp serve --scope user
```

For package-style trials, register the packaged command instead:

```bash
gemini mcp add skilltrace skilltrace mcp serve --scope user
```

Then confirm the server is registered:

```bash
gemini mcp list
```

Gemini CLI uses the existing `agents` instruction profile when the target
repo uses `AGENTS.md` and `.agents/skills/`.

SkillTrace also shows a read-only Gemini CLI MCP registration check in
`/app/diagnostics` when the `gemini` CLI is available to the server process.

When `skilltrace-dev start` or `skilltrace start` is active, the MCP command
resolves the active SkillTrace session over HTTP. Without an active session, use
`SKILLTRACE_RUN_ID`, `SKILLTRACE_RUN_STEM`, and `SKILLTRACE_SERVER` as shown
below.

To remove the SkillTrace MCP server later, use the command surface you
registered:

```bash
skilltrace-dev mcp uninstall
# or
skilltrace mcp uninstall
```

When `SKILLTRACE_RUN_STEM` is set, the MCP server generates one run ID at startup:

```text
run_mcp_fixture_20260619_001530
```

All tool calls in that MCP server process use the generated run ID. Tool input
`run_id` is only a fallback when no active session, `SKILLTRACE_RUN_ID`, or
`SKILLTRACE_RUN_STEM` is available.

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
roots, usually `{"skill_roots":[".agents/skills"]}`. Task skills should remain
normal portable skills: frontmatter for the skill name and trigger description,
then task procedure plus reference paths in the body. Semantic event summaries
can be inferred by the agent at logging time.

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
  "task_summary": "Repair TypeScript errors in the demo repo.",
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
  "skills_read": [
    ".agents/skills/type-fix/SKILL.md"
  ],
  "references_read": [
    ".agents/skills/type-fix/references/checklist.md"
  ],
  "files_believed_to_influence_work": [
    ".agents/skills/type-fix/SKILL.md",
    ".agents/skills/type-fix/references/checklist.md"
  ],
  "file_usage_uncertainties": [],
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
  "recommended_skill_changes": [
    "No change recommended: the skill and checklist were clear for this task."
  ],
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
  "skill_path": ".agents/skills/type-fix/SKILL.md",
  "summary": "Read the type-fix checklist reference.",
  "confidence": "medium",
  "related_artifacts": [
    ".agents/skills/type-fix/references/checklist.md"
  ],
  "data": {
    "reference_path": ".agents/skills/type-fix/references/checklist.md",
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
