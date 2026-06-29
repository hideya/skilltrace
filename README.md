# SkillTrace

**SkillTrace is a local observability tool for AI agent skill usage.**

It helps you inspect whether an agent read skill files, declared skill usage
through MCP, and reflected on which skill/reference files influenced a run.

SkillTrace is experimental, local-first, and aimed at people developing or
debugging agent skills.

```text
Target repo
  AGENTS.md / .skills
       |
       | traceskill start injects lightweight instructions
       v
Agent / Codex -- MCP semantic events --> SkillTrace daemon
       |                                      |
       | file reads                           | stores runs/events
       v                                      v
Passive probe -----------------------> Web UI / diagnostics
```

## What It Captures

SkillTrace combines three evidence streams:

- **Passive traces**: observed file access, such as `SKILL.md` or reference
  file reads.
- **Semantic traces**: agent-declared MCP events such as skill start, reference
  read, and skill finish.
- **Reflection**: post-run agent summary of which skill and reference files
  influenced the work.

The UI compares those streams so you can see when evidence aligns, when the
agent skipped a declaration, or when passive probing saw something the
reflection omitted.

## Requirements

- Node.js 22+
- npm
- Codex CLI for the current MCP-oriented workflow
- macOS or Linux

Platform notes:

- macOS uses a shared `fs_usage` passive probe by default and may ask for your
  admin password once when the daemon starts.
- Linux uses a per-run `inotifywait` probe. Install `inotify-tools` if passive
  file access is not captured.

## Installation

```bash
npm install -g skilltrace
```

Start the local daemon:

```bash
traceskill daemon start
```

Open the UI:

```text
http://localhost:7555/app/runs
```

For a Linux container or VM where you want to open the UI from the host
machine, bind to all interfaces:

```bash
HOST=0.0.0.0 traceskill daemon start
```

The daemon output shows the detected UI URL.

## Register The MCP Server

Register SkillTrace with Codex:

```bash
codex mcp add skilltrace -- traceskill mcp
```

Check it:

```bash
codex mcp get skilltrace
```

The diagnostics page also checks whether Codex MCP registration matches the
installed command.

## Quick Start

From the target repo you want to trace:

```bash
cd <repo>
traceskill start
```

Then run your agent task normally.

When the task is finished:

```bash
traceskill stop
```

`traceskill start` expects the target repo to contain `AGENTS.md` and
`.skills/`. It injects a temporary SkillTrace instruction into `AGENTS.md`,
writes `.skilltrace/instrumentation.md`, and creates `.skilltrace.json` when
needed. `traceskill stop` removes the temporary instruction and generated files
when they are unchanged.

Only one trace session can be active at a time. If a session is active,
`traceskill start` refuses until you run `traceskill stop`.

## Trace Modes

SkillTrace supports three modes:

```bash
traceskill start --mode full
traceskill start --mode passive_reflection
traceskill start --mode passive_only
```

- `full`: passive file access, live semantic MCP declarations, and final
  reflection.
- `passive_reflection`: passive file access plus final reflection, without live
  skill lifecycle declarations.
- `passive_only`: passive file access only, with no instruction injection.

The default is `full`.

## UI

Useful pages:

- `/app/runs`: grouped trace runs, status, mode, result, model/client context,
  and mode comparison.
- `/app/runs/<run-id>`: timeline, run context, Git snapshot, consistency table,
  and reflection.
- `/app/diagnostics`: daemon/server health, active session, passive probe state,
  and Codex MCP registration.

The run detail page shows a consistency table across passive, semantic, and
reflection evidence. Passive-only runs are labeled as **Captured** rather than
**Pass**, because there is no second evidence stream to compare.

## Git Provenance

When the target repo is inside a Git worktree, `traceskill start` records a
lightweight run snapshot:

- HEAD commit and branch
- broad changed-file status
- bounded diffs for instruction-relevant files
- bounded contents for untracked instruction-relevant files

This helps compare successful and failed runs against the skill/instruction
state they used.

## Stop And Uninstall

Stop the daemon:

```bash
traceskill daemon stop
```

Unregister MCP from Codex:

```bash
codex mcp remove skilltrace
```

Uninstall the package:

```bash
npm uninstall -g skilltrace
```

Local SkillTrace data is stored under `~/.skilltrace`.

## Development

For local development, packaging notes, dogfooding details, and architecture
decisions, see:

- [README_DEV.md](https://github.com/hideya/skill-trace/blob/main/README_DEV.md)
- [docs/architecture-decisions.md](https://github.com/hideya/skill-trace/blob/main/docs/architecture-decisions.md)
- [docs/mcp-semantic-logger.md](https://github.com/hideya/skill-trace/blob/main/docs/mcp-semantic-logger.md)
- [docs/agent-sandbox-mcp-test.md](https://github.com/hideya/skill-trace/blob/main/docs/agent-sandbox-mcp-test.md)
