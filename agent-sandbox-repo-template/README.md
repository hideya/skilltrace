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
pnpm traceskill:install
traceskill serve
```

If your shell cannot find `traceskill`, add `~/.skilltrace/bin` to your `PATH`:

```bash
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.skilltrace/bin"; then
  echo 'export PATH="$HOME/.skilltrace/bin:$PATH"' >> ~/.zshrc
  source ~/.zshrc
fi
```

`traceskill start` launches the passive probe worker and prompts for sudo from your terminal.

If you have installed the Codex app but not the Codex CLI, define a shell alias to access the bundled CLI version:

```bash
alias codex='/Applications/Codex.app/Contents/Resources/codex'
```

Register the SkillTrace MCP server:

```bash
codex mcp add skilltrace -- traceskill mcp
```

Then start the passive trace session from this sandbox repository:

```bash
traceskill start --inject-instructions
```

This starts the passive probe before you launch command-line Codex for this sandbox repository.
It also temporarily injects `.skilltrace/instrumentation.md` and the matching
`AGENTS.md` instruction for the current trace session.
The command prints a probe log path. If passive events do not appear, restart with `--debug-probe` and inspect that log.

To remove the SkillTrace MCP server later:

```bash
codex mcp remove skilltrace
```

`traceskill start --inject-instructions` prints the generated run ID. It looks like:

```text
agent-sandbox-repo-r0dpQT-2026-06-19-04-39-12
```

Then start command-line Codex from this repository:

```bash
codex
```

## Test Prompt

Ask the agent:

```text
Please fix the TypeScript errors in this repo.
```

The injected `AGENTS.md` line asks the agent to read
`.skilltrace/instrumentation.md`, and the sandbox `AGENTS.md` asks the agent to
read `.skills/type-fix/SKILL.md` before fixing TypeScript or syntax errors.

## Expected Result

The agent should:

- read `.skilltrace/instrumentation.md`
- read `.skills/type-fix/SKILL.md`
- call `skill_log_event` with `skill_use_started`
- run or inspect `pnpm tsc`
- read `.skills/type-fix/references/checklist.md`
- call `skill_log_event` with `skill_reference_read`
- fix `src/profile.ts`
- call `skill_log_event` with `skill_use_finished`

Then open the SkillTrace run page:

```text
http://localhost:7555/app/runs/<generated_run_id>
```

The timeline should include passive skill/reference reads and semantic started,
reference-read, and finished declarations. The consistency panel should report
`Observed and declared`.

When you are done, stop the active trace session:

```bash
traceskill stop
```
