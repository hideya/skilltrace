# Agent Sandbox MCP Test

This runbook explains how to test SkillTrace with a real Codex session using the local MCP server.

The goal is to verify that an agent working in a separate fake repository can:

1. load a local skill-like instruction file
2. call the SkillTrace `skill_log_event` MCP tool
3. fix intentionally broken TypeScript code
4. create semantic trace events visible in the SkillTrace UI

This is the first true MCP-path experiment. It is stronger than the CLI fixture because the semantic events come from an MCP tool call made by the agent. It is still not full passive file monitoring.

Use command-line Codex for this experiment. In early testing, Codex via VS Code saw the sandbox skill instructions but did not expose the custom `skill_log_event` MCP tool to the agent session, even though `/mcp` showed the `skilltrace` server as enabled.

The current recommended command is `skilltrace:probe-session`. It starts a macOS `opensnoop` passive probe first, writes the active SkillTrace session run ID, and then launches command-line Codex inside the target repo. The MCP server reads that active session file, so passive skill reads and semantic declarations share the same run ID.

## Pieces

- Main SkillTrace app: this repository.
- Sandbox template: `agent-sandbox-repo-template`.
- Generated sandbox repo: `agent-sandbox-repo`.
- Local session supervisor: `pnpm skilltrace:probe-session`.
- Local MCP server command: `pnpm skilltrace:mcp`.
- Passive probe: `sudo -n opensnoop`.
- MCP tool exposed to Codex: `skill_log_event`.

`agent-sandbox-repo` is generated from the template and ignored by Git. Reset it before each experiment so fixes made by the test agent do not accidentally become the next starting state.

## Prerequisites

From the main SkillTrace repo, make sure the local database exists:

```bash
pnpm db:init-local
```

Start SkillTrace in another terminal:

```bash
pnpm dev
```

Prime sudo before starting command-line Codex:

```bash
sudo -v
```

The probe uses `sudo -n opensnoop` internally. If sudo is not already authorized, the MCP server exits instead of hanging on a password prompt.

The examples below assume SkillTrace is running at:

```text
http://localhost:5173
```

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
/Applications/Codex.app/Contents/Resources/codex mcp add skilltrace \
  -- pnpm --dir /Users/hideya/Desktop/WS/PT/skill-trace skilltrace:mcp
```

Then confirm it is registered:

```bash
/Applications/Codex.app/Contents/Resources/codex mcp get skilltrace
```

The command should show:

- `enabled: true`
- `transport: stdio`
- `command: pnpm`
- `args: --dir /Users/hideya/Desktop/WS/PT/skill-trace skilltrace:mcp`

The run ID is not configured in the MCP registration. The session supervisor writes it to:

```text
data/local/skilltrace-session.json
```

and `skilltrace:mcp` reads it when Codex starts the MCP server.

## Run The Experiment

Start the supervised probe session from the main SkillTrace repo:

```bash
pnpm skilltrace:probe-session \
  --target agent-sandbox-repo \
  --server http://localhost:5173 \
  --stem run_agent_sandbox_type_fix
```

This starts `opensnoop`, writes the active session file, and then launches command-line Codex in `agent-sandbox-repo`.

In the launched Codex session, run:

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
run_agent_sandbox_type_fix_20260619_001530
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
- The local macOS probe can observe skill file reads with `opensnoop` before Codex starts reading the target repo.
- Semantic skill-use declarations can reach `/api/skill-log-events`.
- Passive file read observations can reach `/api/passive-events`.
- The session run ID correlates passive probe events and MCP semantic events.
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
/Applications/Codex.app/Contents/Resources/codex mcp remove skilltrace
```

Reset the sandbox before the next experiment:

```bash
pnpm sandbox:reset
```

## Troubleshooting

If no run appears, check that:

- SkillTrace is running at `http://localhost:5173`.
- The MCP server command is `skilltrace:mcp`.
- You launched Codex through `pnpm skilltrace:probe-session`.
- You are using command-line Codex, not Codex via VS Code.
- The sandbox agent actually called `skill_log_event`.
- The run may be under the generated timestamped ID, not the fixed stem.

If Codex says `skill_log_event` is not available, verify that you are running the command-line Codex session from `agent-sandbox-repo`. In observed testing, Codex via VS Code could show the `skilltrace` MCP server as enabled but still not expose the custom `skill_log_event` tool to the agent.

If the MCP server fails to start, run:

```bash
sudo -v
```

then start a fresh command-line Codex session. The probe intentionally uses `sudo -n` so it cannot ask for a password through MCP stdio.

If the MCP semantic events appear but passive events do not, check that the target repo has `.skilltrace.json` or `.skills`, and that Codex was launched by `skilltrace:probe-session` rather than started manually.

If the sandbox starts already fixed, run:

```bash
pnpm sandbox:reset
```

If the consistency panel says `Declared but not observed`, the semantic MCP part worked, but the passive probe did not catch the skill file read. Add the optional passive read event if you want a pass state for the same run.
