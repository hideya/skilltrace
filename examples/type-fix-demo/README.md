# Type Fix Demo

This is a small intentionally broken TypeScript repo for trying SkillTrace.

The demo contains:

- `AGENTS.md` with an AGENTS.md-compatible instruction surface
- `CLAUDE.md` symlinked to `AGENTS.md`
- `.skills/type-fix/SKILL.md`
- `.claude/skills` symlinked to `.skills`
- `src/profile.ts` with intentional TypeScript errors

Copy this directory with symlinks preserved before each trial:

```bash
cp -RP skill-trace/examples/type-fix-demo type-fix-demo
cd type-fix-demo
npm install
```

Then start SkillTrace and run an agent task:

```bash
# If the daemon is not already running:
skilltrace daemon start
skilltrace start --note "demo type-fix run"
codex "Fix the TypeScript error using the available skill"
skilltrace stop
```

For Claude Code or Gemini CLI, register the same SkillTrace MCP server with
that client first, then replace the agent command with `claude` or `gemini`.

The expected run should show:

- passive `SKILL.md` and `checklist.md` reads
- semantic skill start, reference-read, and finish events
- a final run reflection
- a passing consistency result
