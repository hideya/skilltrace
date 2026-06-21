# Agent Sandbox MCP Test

This runbook explains how to test SkillTrace with a real Codex session using the local MCP server.

The goal is to verify that an agent working in a separate fake repository can:

1. load a local skill-like instruction file
2. call the SkillTrace `skill_log_event` MCP tool
3. fix intentionally broken TypeScript code
4. create semantic trace events visible in the SkillTrace UI

This is the first true MCP-path experiment. It is stronger than the CLI fixture because the semantic events come from an MCP tool call made by the agent. It is still not full passive file monitoring.

Use command-line Codex for this experiment. In early testing, Codex via VS Code saw the sandbox skill instructions but did not expose the custom `skill_log_event` MCP tool to the agent session, even though `/mcp` showed the `skilltrace` server as enabled.

The current recommended flow uses `traceskill start`. It asks the local SkillTrace daemon to create an active session, then launches a macOS `fs_usage` probe worker for the current repo before Codex starts. The MCP server resolves the one active session from the daemon, so passive skill reads and semantic declarations share the same run ID.

## Pieces

- Main SkillTrace app: this repository.
- Sandbox template: `agent-sandbox-repo-template`.
- Generated sandbox repo: `agent-sandbox-repo`.
- Local CLI: `traceskill`.
- Local MCP server command: `traceskill mcp`.
- Passive probe: `sudo -n fs_usage -w -f filesys`.
- MCP tool exposed to Codex: `skill_log_event`.

`agent-sandbox-repo` is generated from the template and ignored by Git. Reset it before each experiment so fixes made by the test agent do not accidentally become the next starting state.

## Prerequisites

From the main SkillTrace repo, make sure the local database exists:

```bash
pnpm db:init-local
```

Install the local `traceskill` wrapper once:

```bash
pnpm traceskill:install
```

The installer writes `~/.local/bin/traceskill`. If your shell cannot find the
command afterward, add `~/.local/bin` to your `PATH`.

Start the local SkillTrace daemon in another terminal:

```bash
pnpm traceskill serve
```

`traceskill start` launches the passive probe worker from your terminal, so the
sudo prompt happens there instead of inside the web server process.

The examples below assume SkillTrace is running at:

```text
http://localhost:5173
```

For shorter commands, define a shell alias for command-line Codex:

```bash
alias codex='/Applications/Codex.app/Contents/Resources/codex'
```

To make it persistent, add that line to your shell rc file, such as `~/.zshrc`.

## Reset The Sandbox

From the main SkillTrace repo:

```bash
pnpm sandbox:reset
```

This recreates `agent-sandbox-repo` from `agent-sandbox-repo-template`.

The generated repo intentionally contains TypeScript errors in:

```text
agent-sandbox-repo/src/profile.ts
```

## Register SkillTrace MCP

Register the local SkillTrace MCP server with Codex. This registration is generic and does not name the target repo:

```bash
codex mcp add skilltrace -- traceskill mcp
```

Then confirm it is registered:

```bash
codex mcp get skilltrace
```

The command should show:

- `enabled: true`
- `transport: stdio`
- `command: traceskill`
- `args: mcp`

The run ID is not configured in the MCP registration. The MCP server resolves the daemon's one active session when `skill_log_event` is called.

## Run The Experiment

Start the passive trace session from the sandbox repo:

```bash
cd agent-sandbox-repo
traceskill start
```

This starts a background `fs_usage` probe worker and prints the run URL.
It also prints a probe log path under:

```text
data/local/traceskill-probe-<run_id>.log
```

If passive events do not appear, restart with:

```bash
traceskill start --debug-probe
```

Then inspect the printed probe log.

Then start command-line Codex from the same sandbox repo:

```bash
codex
```

In Codex, run:

```text
/mcp
```

Confirm that `skilltrace` is enabled before starting the repair task. The passive probe is already running at this point.

The probe discovers the target repo from the command-line Codex session. The sandbox template includes:

```text
.skilltrace.json
```

with:

```json
{
  "skill_roots": [".skills"]
}
```

Ask Codex:

```text
Please fix the TypeScript errors in this repo.
```

The sandbox `AGENTS.md` asks the agent to read:

```text
.skills/type-fix/SKILL.md
```

That skill asks the agent to call `skill_log_event` when the skill starts and when it finishes.

## Expected Result

In the sandbox Codex session, the agent should:

- notice the TypeScript repair task
- read `.skills/type-fix/SKILL.md`
- call `skill_log_event` with `event_type: skill_use_started`
- inspect or run `pnpm tsc`
- fix `src/profile.ts`
- call `skill_log_event` with `event_type: skill_use_finished`

In the main SkillTrace app, open:

```text
http://localhost:5173/app/runs
```

Look for a run ID like:

```text
agent-sandbox-repo-r0dpQT-2026-06-19-04-39-12
```

Open the run detail page. The timeline should show semantic events from:

```text
mcp_semantic_logger
```

It should also show passive events from:

```text
passive_file_harness
```

The semantic declarations panel should show the started and finished events. The passive skill access panel should show the `.skills/type-fix/SKILL.md` read.

The consistency panel should show:

```text
Observed and declared
```

with a message like:

```text
type-fix was read, started, and finished.
```

If the consistency panel says `Declared but not observed`, the MCP semantic path worked but the passive probe did not observe the skill read.

## What This Test Proves

This test verifies:

- Codex can launch the local SkillTrace MCP server through stdio.
- Codex can see and call the `skill_log_event` tool.
- The local probe worker can observe skill file reads with `fs_usage` before Codex starts reading the target repo.
- Semantic skill-use declarations can reach `/api/skill-log-events`.
- Passive file read observations can reach `/api/passive-events`.
- The daemon's one active session ID correlates passive probe events and MCP semantic events.
- The SkillTrace UI can display the resulting run timeline.

This test does not yet verify:

- general compliance across many skills
- remote HTTP MCP transport
- Linux or Windows passive probing
- production deployment behavior

## Optional Passive Event Check

If the passive probe misses the read and you want to force the same run into the pass state, run the read harness manually using the generated run ID:

```bash
pnpm skilltrace:read \
  --run <generated_run_id> \
  --skill type-fix \
  --server http://localhost:5173 \
  agent-sandbox-repo/.skills/type-fix/SKILL.md
```

Then refresh the run detail page. The consistency panel can compare the passive skill read with the semantic MCP declarations.

## Cleanup

Remove the MCP server registration when you are done:

```bash
codex mcp remove skilltrace
```

Reset the sandbox before the next experiment:

```bash
pnpm sandbox:reset
```

## Troubleshooting

If no run appears, check that:

- SkillTrace is running at `http://localhost:5173`.
- The MCP server command is `traceskill mcp`.
- You ran `traceskill start` from the target repo before launching Codex.
- You are using command-line Codex, not Codex via VS Code.
- The sandbox agent actually called `skill_log_event`.
- The run may be under the generated path-hash timestamped ID.

If Codex says `skill_log_event` is not available, verify that you are running the command-line Codex session from `agent-sandbox-repo`. In observed testing, Codex via VS Code could show the `skilltrace` MCP server as enabled but still not expose the custom `skill_log_event` tool to the agent.

If the MCP server fails to start, run:

```bash
sudo -v
```

then start a fresh command-line Codex session. The probe intentionally uses `sudo -n` so it cannot ask for a password through MCP stdio.

If the MCP semantic events appear but passive events do not, check that the target repo has `.skilltrace.json` or `.skills`, and that `traceskill start` was run before Codex started.
Run `traceskill status` and confirm the probe says `running`. If it is not running, inspect the printed probe log.

If the sandbox starts already fixed, run:

```bash
pnpm sandbox:reset
```

If the consistency panel says `Declared but not observed`, the semantic MCP part worked, but the passive probe did not catch the skill file read. Add the optional passive read event if you want a pass state for the same run.

When you are done, stop the active session:

```bash
traceskill end
```

`traceskill stop` is also accepted as an alias, but `end` is the canonical
command because it ends the active trace session.

From any repo you can run:

```bash
traceskill start
traceskill status
traceskill end
```
