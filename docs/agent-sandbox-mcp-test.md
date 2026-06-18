# Agent Sandbox MCP Test

This runbook explains how to test SkillTrace with a real Codex session using the local MCP server.

The goal is to verify that an agent working in a separate fake repository can:

1. load a local skill-like instruction file
2. call the SkillTrace `skill_log_event` MCP tool
3. fix intentionally broken TypeScript code
4. create semantic trace events visible in the SkillTrace UI

This is the first true MCP-path experiment. It is stronger than the CLI fixture because the semantic events come from an MCP tool call made by the agent. It is still not full passive file monitoring.

Use command-line Codex for this experiment. In early testing, Codex via VS Code saw the sandbox skill instructions but did not expose the custom `skill_log_event` MCP tool to the agent session, even though `/mcp` showed the `skilltrace` server as enabled.

## Pieces

- Main SkillTrace app: this repository.
- Sandbox template: `agent-sandbox-repo-template`.
- Generated sandbox repo: `agent-sandbox-repo`.
- Local MCP server command: `pnpm skilltrace:mcp`.
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

Register the local SkillTrace MCP server with Codex:

```bash
/Applications/Codex.app/Contents/Resources/codex mcp add skilltrace \
  --env SKILLTRACE_RUN_STEM=run_agent_sandbox_type_fix \
  --env SKILLTRACE_SERVER=http://localhost:5173 \
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
- `SKILLTRACE_RUN_STEM`
- `SKILLTRACE_SERVER`

Open a new command-line Codex session after registering the MCP server so the tool list is refreshed.

## Run The Experiment

Open `agent-sandbox-repo` in command-line Codex:

```bash
cd /Users/hideya/Desktop/WS/PT/skill-trace/agent-sandbox-repo
/Applications/Codex.app/Contents/Resources/codex
```

In that Codex session, run:

```text
/mcp
```

Confirm that `skilltrace` is enabled before starting the repair task.

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

The semantic declarations panel should show the started and finished events.

The consistency panel should show:

```text
Declared but not observed
```

with a message like:

```text
type-fix was declared, but no passive skill read was observed.
```

That is expected for this pure MCP test because it only exercises semantic logging. Add the optional passive event check below if you want the same run to pass the consistency check.

## What This Test Proves

This test verifies:

- Codex can launch the local SkillTrace MCP server through stdio.
- Codex can see and call the `skill_log_event` tool.
- Semantic skill-use declarations can reach `/api/skill-log-events`.
- The run ID generated from `SKILLTRACE_RUN_STEM` correlates events from one MCP server process.
- The SkillTrace UI can display the resulting run timeline.

This test does not yet verify:

- passive file-read observation
- automatic detection that `.skills/type-fix/SKILL.md` was read
- general compliance across many skills
- remote HTTP MCP transport
- production deployment behavior

## Optional Passive Event Check

If you want the same run to include passive-style file access evidence, run the read harness manually using the generated run ID:

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
- The MCP server is registered with `SKILLTRACE_SERVER=http://localhost:5173`.
- You opened a new command-line Codex session after registering the MCP server.
- You are using command-line Codex, not Codex via VS Code.
- The sandbox agent actually called `skill_log_event`.
- The run may be under the generated timestamped ID, not the fixed stem.

If Codex says `skill_log_event` is not available, verify that you are running the command-line Codex session from `agent-sandbox-repo`. In observed testing, Codex via VS Code could show the `skilltrace` MCP server as enabled but still not expose the custom `skill_log_event` tool to the agent.

If the sandbox starts already fixed, run:

```bash
pnpm sandbox:reset
```

If the consistency panel says `Declared but not observed`, that is expected for the pure MCP test. Add the optional passive read event if you want a pass state for the same run.
