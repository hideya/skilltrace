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

Start the SkillTrace MCP server with a run ID stem:

```bash
SKILLTRACE_RUN_STEM=run_agent_sandbox_type_fix \
SKILLTRACE_SERVER=http://localhost:5173 \
pnpm --dir .. skilltrace:mcp
```

To make the MCP server available to Codex, register it from the main SkillTrace project:

```bash
/Applications/Codex.app/Contents/Resources/codex mcp add skilltrace \
  --env SKILLTRACE_RUN_STEM=run_agent_sandbox_type_fix \
  --env SKILLTRACE_SERVER=http://localhost:5173 \
  -- pnpm --dir /Users/hideya/Desktop/WS/PT/skill-trace skilltrace:mcp
```

Then open a new Codex session for this sandbox repository.

To remove the SkillTrace MCP server later:

```bash
/Applications/Codex.app/Contents/Resources/codex mcp remove skilltrace
```

The MCP server prints the generated run ID when it starts. It looks like:

```text
run_agent_sandbox_type_fix_20260619_001530
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
http://localhost:5173/app/runs/<generated_run_id>
```

This sandbox does not test passive file observation yet unless you separately run the SkillTrace read harness.
