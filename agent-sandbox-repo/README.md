# SkillTrace Agent Sandbox

This is a fake repository used to test SkillTrace with a separate Codex project.

The goal is to verify whether an agent can:

1. read a local skill-like instruction file
2. call the SkillTrace `skill_log_event` MCP tool
3. fix intentionally broken TypeScript code
4. produce semantic trace events that appear in SkillTrace

## Setup

Open this directory as a separate Codex project:

```text
agent-sandbox-repo
```

Start SkillTrace from the main project in another terminal:

```bash
pnpm dev
```

Start the SkillTrace MCP server with a run ID:

```bash
SKILLTRACE_RUN_ID=run_agent_sandbox_type_fix_001 \
SKILLTRACE_SERVER=http://localhost:5173 \
pnpm --dir .. skilltrace:mcp
```

## Test Prompt

Ask the agent:

```text
Please fix the TypeScript errors in this repo.
```

The sandbox `AGENTS.md` asks the agent to read `.skills/type-fix/SKILL.md` before fixing TypeScript or syntax errors.

## Expected Result

The agent should:

- call `skill_log_event` with `skill_use_started`
- run or inspect `pnpm tsc`
- fix `src/profile.ts`
- call `skill_log_event` with `skill_use_finished`

Then open the SkillTrace run page:

```text
http://localhost:5173/app/runs/run_agent_sandbox_type_fix_001
```

This sandbox does not test passive file observation yet unless you separately run the SkillTrace read harness.
