# Architecture Decisions

This document records the main decisions from the first SkillTrace prototype experiments.

## Local-First Utility

SkillTrace starts as a local debugging utility, not a remote web service.

Reasons:

- passive file access observation is inherently local
- macOS probe permissions are easier to reason about in the user's terminal
- MCP registration should stay stable and generic
- the first product goal is a smooth skill-debugging loop, not team hosting

Remote service support can come later after the local workflow feels solid.

## One Active Session

SkillTrace v0 uses one active trace session globally.

Reasons:

- avoids stale probe processes
- simplifies MCP run ID resolution
- matches the current assumption that one repo is being debugged at a time
- makes `traceskill start` and `traceskill end` easy to understand

Starting a new session should end the previous session and replace the passive probe.

## Stable MCP Registration

The Codex MCP registration should not include repo-specific paths.

Use a stable registration:

```bash
/Applications/Codex.app/Contents/Resources/codex mcp add skilltrace \
  -- pnpm --dir /Users/hideya/Desktop/WS/PT/skill-trace traceskill:mcp
```

The active repo is selected by:

```bash
traceskill start --target "$PWD"
```

The MCP server resolves the daemon's active session over HTTP when `skill_log_event` is called.

## CLI-Owned Probe Worker

The local web server does not start the passive probe directly.

Instead, `traceskill start`:

1. asks the daemon to create an active session
2. prompts for sudo in the user's terminal
3. launches a background probe worker
4. attaches the worker PID to the active session

This avoids password prompts or sudo context problems inside the React Router dev server process.

## Use `fs_usage`, Not `opensnoop`

The first probe backend used `opensnoop`, but on the tested macOS environment it failed under System Integrity Protection with DTrace probe errors.

The active prototype now uses:

```bash
sudo -n fs_usage -w -f filesys
```

Complications discovered:

- `fs_usage` may emit lowercase absolute paths
- `fs_usage` may emit repo-relative paths such as `.skills/type-fix/SKILL.md`
- path matching must be case-insensitive on macOS
- probe logs are essential for debugging parser misses

## Command-Line Codex First

The first successful real MCP test used command-line Codex.

In testing, Codex via VS Code could see the sandbox skill instructions, and `/mcp` could show the `skilltrace` server as enabled, but the custom `skill_log_event` tool was not exposed to the agent session.

For now, SkillTrace MCP dogfooding should use command-line Codex.

## Sandbox Template

`agent-sandbox-repo` is generated from `agent-sandbox-repo-template`.

Reasons:

- the test agent modifies the sandbox repo
- the intentionally broken fixture must remain reproducible
- the generated sandbox should not be committed by accident

Run before each experiment:

```bash
pnpm sandbox:reset
```

If a terminal was inside the old generated sandbox when it was reset, `cd` into the sandbox again before running commands.

## Start New Attempt

The UI uses `Start new attempt` rather than `Clear`.

Reason:

- it names the user's intent: retry the same trace session
- it avoids presenting trace history deletion as the conceptual product action

For v0 it clears events from the selected run. Later this may become an explicit attempt model.
