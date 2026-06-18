# SkillTrace Agent Sandbox

This is a fake repository generated from `agent-sandbox-repo-template`.

The goal is to verify whether an agent can:

1. read a local skill-like instruction file
2. call the SkillTrace `skill_log_event` MCP tool
3. fix intentionally broken TypeScript code
4. produce passive and semantic trace events that appear in SkillTrace

## Reset From Template

From the main SkillTrace project, reset this sandbox before each experiment:

```bash
pnpm sandbox:reset
```

Then open `agent-sandbox-repo` as a separate Codex project.

## Setup

Start SkillTrace from the main project in another terminal:

```bash
pnpm dev
```

Prime sudo before starting command-line Codex:

```bash
sudo -v
```

Register the SkillTrace MCP server from the main SkillTrace project:

```bash
/Applications/Codex.app/Contents/Resources/codex mcp add skilltrace \
  -- pnpm --dir /Users/hideya/Desktop/WS/PT/skill-trace skilltrace:mcp
```

Then launch the supervised probe session from the main SkillTrace project:

```bash
pnpm skilltrace:probe-session \
  --target agent-sandbox-repo \
  --server http://localhost:5173 \
  --stem run_agent_sandbox_type_fix
```

This starts the passive probe before launching command-line Codex for this sandbox repository.

To remove the SkillTrace MCP server later:

```bash
/Applications/Codex.app/Contents/Resources/codex mcp remove skilltrace
```

The session supervisor prints the generated run ID before launching Codex. It looks like:

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

- read `.skills/type-fix/SKILL.md`
- call `skill_log_event` with `skill_use_started`
- run or inspect `pnpm tsc`
- fix `src/profile.ts`
- call `skill_log_event` with `skill_use_finished`

Then open the SkillTrace run page:

```text
http://localhost:5173/app/runs/<generated_run_id>
```

The timeline should include the passive skill read and semantic started/finished declarations. The consistency panel should report `Observed and declared`.
