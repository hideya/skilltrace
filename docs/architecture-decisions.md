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

## Local UI Does Not Require Login

The local runs UI is public in v0.

Reasons:

- the local daemon is meant to run on the developer's own machine
- login gets in the way of the trace-debugging loop
- auth is still valuable for a future remote/team version, so the scaffolded auth
  routes remain in the codebase
- route-level auth references are kept as comments near the local-mode changes
  to make a future remote mode easy to restore

## One Active Session

SkillTrace v0 uses one active trace session globally.

Reasons:

- avoids stale probe processes
- simplifies MCP run ID resolution
- matches the current assumption that one repo is being debugged at a time
- makes `traceskill start` and `traceskill end` easy to understand

Starting a new session should end the previous session and replace the passive probe.

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

## Pluggable Instrumentation Overlay

SkillTrace tracing instructions should be reusable outside the sandbox.

The current pattern is:

1. add one opt-in line near the top of `AGENTS.md`
2. place generic tracing policy in `.skilltrace/instrumentation.md`
3. keep task-specific skill metadata in the relevant `SKILL.md`

For lower-friction real-repo trials, `traceskill start --inject-instructions`
can apply the first two pieces automatically for the current trace session.
The mutation is manifest-backed in `.skilltrace/injection.json`, and
`traceskill stop` removes only the exact inserted instruction block and only
removes the instrumentation file when SkillTrace created it and it is unchanged.

Reasons:

- makes tracing portable to real repositories
- avoids copying a long MCP protocol block into every skill
- keeps task skills focused on domain behavior
- lets SkillTrace compare passive file access with semantic declarations without
  making every reference file look like a separate skill

The overlay is tracing policy, not a task skill. Agents should not emit
`skill_use_started` or `skill_use_finished` for `.skilltrace/instrumentation.md`
itself.

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
