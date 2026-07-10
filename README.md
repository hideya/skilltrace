# SkillTrace [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/hideya/skilltrace/blob/main/NOTICE.md) [![npm version](https://img.shields.io/npm/v/skilltrace.svg)](https://www.npmjs.com/package/skilltrace)

**SkillTrace is an observability tool for AI agent skill usage.**

When an agent can choose from multiple skills, it can be hard to tell which
ones it used, in what order, and why.

SkillTrace helps you inspect whether an agent read skill files, whether it
declared skill usage through MCP, and how its post-run reflection attributed
the work to specific skills, references, files, steps, and uncertainties.

Skill usage is hard to capture because it is often buried inside the LLM's
decision-making process. Unlike MCP tool calls, skills do not necessarily cross
a clear execution boundary.

SkillTrace combines passive file-access probing, dedicated MCP tool invocations,
and structured post-run reflection so you can compare what was observed, what
was declared, and what the agent later believed influenced the run.

SkillTrace is aimed at people developing and debugging agent skills.

<table>
  <tr>
    <td>
      <a href="https://github.com/user-attachments/assets/a486b3cd-a0e5-4167-bbe5-885705ea4328" target=”_blank”>
        <img src="https://raw.githubusercontent.com/hideya/skill-trace/main/docs/images/skilltrace-video-cover.webp" height="250px" />
      </a>
      <br />
      <sub>SkillTrace demo movie clip</sub>
    </td>
    <td>
      <img src="https://raw.githubusercontent.com/hideya/skill-trace/main/docs/images/skilltrace-diagram.webp" height="250px" />
      <br />
      <sub>System diagram</sub>
    </td>
  </tr>
</table>

At a high level, SkillTrace compares three kinds of evidence from the same run.

## What It Captures

SkillTrace helps you understand and debug agent skills by combining three
evidence streams:

- **Passive traces**: observed file access, such as `SKILL.md` or reference
  file reads.
- **Semantic traces**: instructed MCP invocations such as skill start,
  reference read, and skill finish.
- **Reflection**: structured post-run attribution by the agent, including which
  skills, references, files, steps, uncertainties, and recommended skill changes
  it believes were relevant to the run.

The UI lists and compares the events obtained from those streams so you can see
when evidence aligns, when the agent skipped a declaration, or when passive
probing saw something the reflection omitted.

Passive traces are evidence of file access, not proof of skill use. Some agent
clients scan multiple `SKILL.md` entrypoints while building a catalog of
available skills. SkillTrace keeps those reads in the timeline, but classifies
entrypoint-only scans as neutral `discovered` evidence unless later semantic,
reflection, or reference-file evidence shows material use. See
[`docs/passive-skill-discovery.md`](./docs/passive-skill-discovery.md).

Reflection is a self-report, not ground truth. Its value comes from being
compared with passive traces, semantic MCP declarations, and human judgment.

Each run also records basic SkillTrace execution metadata, such as the
SkillTrace version, dev/package mode, OS platform, Node.js version, and passive
probe backend. This helps interpret runs collected across different machines,
containers, operating systems, and SkillTrace versions.

<table>
  <tr>
    <td>
      <img src="https://raw.githubusercontent.com/hideya/skill-trace/main/docs/images/skilltrace-run-details-1.webp" height="250px"><br>
      <sub>SkillTrace Run Details Page</sub>
    </td>
    <td>
      <img src="https://raw.githubusercontent.com/hideya/skill-trace/main/docs/images/skilltrace-run-details-2.webp" height="250px"><br>
      <sub>Consistency Check</sub>
    </td>
  </tr>
</table>

## Status

SkillTrace is currently pre-alpha developer tooling.

It is intended for people experimenting with AI agent skills, MCP workflows,
and skill observability. Expect rough edges, platform-specific behavior, and
occasional missing traces.

SkillTrace is migrating its preferred generic skill layout from the original
prototype `.skills/` directory to the interoperable `.agents/skills/`
convention used by current Agent Skills clients. See
[`docs/agent-skills-location-policy.md`](./docs/agent-skills-location-policy.md)
for the migration policy.

## Requirements

- Node.js 22+
- npm
- Codex CLI, Claude Code, or Gemini CLI
- macOS or Linux
  - macOS only: admin password may be required
  - Linux only: `inotify-tools` installation may be required

Platform notes:

- macOS uses a `fs_usage` passive probe and may ask for your admin password.
- Linux uses an `inotifywait` probe. Install `inotify-tools` if passive file
  access is not captured.

SkillTrace currently supports command-line workflows for Codex CLI, Claude
Code, and Gemini CLI. Codex App support is not yet available.

## Installation

```bash
npm install -g skilltrace
```

Start the local daemon:

```bash
skilltrace daemon start
```

On macOS, this may ask for your admin password so SkillTrace can run `fs_usage`
for passive skill-file access probing.

Open the UI:

```text
http://localhost:7555
```

For a Linux container or VM where you want to open the UI from the host
machine, start the daemon like this to bind to all interfaces:

```bash
HOST=0.0.0.0 skilltrace daemon start
```

The daemon output shows the detected UI URL.

Only bind to `0.0.0.0` in a trusted local network or isolated development
environment. The UI may expose captured traces, repository metadata, diffs,
and agent-declared summaries.

## Register The MCP Server

SkillTrace uses MCP tools to record skill usage. Before using SkillTrace,
register the SkillTrace local MCP server with your agent client.

The easiest path is to let SkillTrace register itself for every supported agent
CLI it can find on your PATH:

```bash
skilltrace mcp install
```

Check the registration:

```bash
skilltrace mcp status
```

You can target one client if needed:

```bash
skilltrace mcp install --agent codex
skilltrace mcp install --agent claude
skilltrace mcp install --agent gemini
```

Under the hood, this runs the appropriate agent-specific commands.

For Codex CLI:

```bash
codex mcp add skilltrace -- skilltrace mcp serve
```

As of June 2026, Codex CLI stores MCP registration globally by default and does
not expose a `--scope` flag.

Check it:

```bash
codex mcp get skilltrace
```

For Claude Code:

```bash
claude mcp remove skilltrace -s user
claude mcp add skilltrace --scope user -- skilltrace mcp serve
```

SkillTrace removes the existing Claude Code registration before adding it,
because Claude Code does not overwrite an existing `skilltrace` MCP server.

Check it:

```bash
claude mcp get skilltrace
```

For Gemini CLI:

```bash
gemini mcp add skilltrace skilltrace mcp serve --scope user
```

Check it:

```bash
gemini mcp list
```

The `/app/diagnostics` page also checks whether Codex, Claude Code, and Gemini
CLI MCP registrations match the installed command when those CLIs are
available.

## Quick Start

From the target repo you want to trace:

SkillTrace expects the repo to have an agent instruction surface, such as
`AGENTS.md` with `.agents/skills/`, or `CLAUDE.md` with `.claude/skills/`.

```bash
cd <repo>
skilltrace start
```

Add a short note when you want the run list to show what you were trying:

```bash
skilltrace start --note "trying to simplify AGENTS.md"
```

`-n` is accepted as a short alias.

Then run your agent task as normal using the `codex`, `claude`, or `gemini`
command.

Be sure to allow skilltrace MCP server tool invocations.

When the task is finished:

```bash
skilltrace stop
```

If you realize immediately that the active run was a mistake, discard it:

```bash
skilltrace stop --discard
```

This cleans up temporary instruction injection and deletes the active run
record after confirmation. Use `--yes` to skip the prompt.

Before tracing sensitive repositories, read
[Privacy And Data](#privacy-and-data).

## Try It On A Toy Skill

```bash
git clone https://github.com/hideya/skill-trace.git
cd skill-trace
mkdir -p tmp
cp -RP examples/type-fix-demo tmp/type-fix-demo
cd tmp/type-fix-demo
npm install

# If the daemon is not already running:
skilltrace daemon start
skilltrace mcp install
skilltrace diagnostics

skilltrace start --note "demo type-fix run"
codex "Fix the TypeScript error using the available skill"
# claude "Fix the TypeScript error using the available skill"
# gemini "Fix the TypeScript error using the available skill"
skilltrace stop
```

Open `http://localhost:7555` in your browser after `skilltrace daemon start`.

To retry the toy demo from a clean copy:

```bash
cd ../..
rm -rf tmp/type-fix-demo
cp -RP examples/type-fix-demo tmp/type-fix-demo
cd tmp/type-fix-demo
npm install
```

### Target Repo Requirements

By default, `skilltrace start` auto-detects one of these supported instruction
profiles (skill file directory formats):

- `agents`: `AGENTS.md` and `.agents/skills/`
- `claude_code`: `CLAUDE.md` or `.claude/CLAUDE.md`, plus `.claude/skills/`

SkillTrace expects each skill root to use the common one-directory-per-skill
layout:

```text
<repo>/.agents/skills/
  <skill-name>/
    SKILL.md
    <reference-dir>/
      <reference-files>
```

The same per-skill shape is commonly used in user-level roots such as
`~/.agents/skills/`. SkillTrace's default passive probing is project-local, so
README examples use `<repo>/.agents/skills/`. See
[`docs/agent-skills-location-policy.md`](./docs/agent-skills-location-policy.md)
for the supported locations by agent client.

Use `--instruction-profile agents` or
`--instruction-profile claude-code` when a repo has more than one instruction
surface or when you want to be explicit.

SkillTrace injects a temporary tracing-policy instruction into the selected
instruction file, writes `.skilltrace/instrumentation.md`, and creates
`.skilltrace.json` when needed. `skilltrace stop` removes the temporary
instruction and generated files when they are unchanged.

Only one trace session can be active at a time. If a session is active,
`skilltrace start` refuses until you run `skilltrace stop`.

## Trace Modes

For your first run, just type:

```bash
skilltrace start
```

This enables all available probing methods.

Full probing is useful for understanding agent decisions about skill usage, but
it can affect how the agent behaves because it asks the agent to think more
explicitly about skill usage and report it through MCP tool calls.

If you want to reduce instrumentation effects, you can try less interfering
modes to see whether the agent keeps working as expected.

SkillTrace supports three modes:

```bash
skilltrace start --mode full
skilltrace start --mode passive_reflection
skilltrace start --mode passive_only
```

- `full`: passive file access, live semantic MCP declarations, and final
  reflection.
- `passive_reflection`: passive file access plus final reflection, without live
  skill lifecycle declarations. This should interfere less with the agent's
  normal task flow.
- `passive_only`: passive file access only, with no instruction injection.
  This should minimally interfere with the agent, though passive probing may
  still have platform-specific overhead or blind spots.

The default is `full`.

## UI

Useful pages:

- `/app/runs`: grouped trace runs, status, mode, result, model/client context,
  and mode comparison.
- `/app/runs/<run-id>`: timeline, run context, Git snapshot if available,
  captured instruction contents, consistency table, and reflection.
- `/app/diagnostics`: daemon/server health, active session, passive probe state,
  and MCP registration for supported command-line clients.

For the same setup check from the command line, run:

```bash
skilltrace diagnostics
skilltrace diagnostics --verbose
```

Run IDs use the form `<repo-name>-<path-token>-<timestamp>`, such as
`type-fix-demo-3KGUxK-2026-07-02-18-31-15`. The short path token is derived
from the absolute target directory path, so repeated runs from the same copied
repo group together, while repos with the same folder name in different
locations remain distinguishable.

The run detail page checks consistency among the captured probing results.

It shows a consistency table across passive, semantic, and reflection evidence,
and compares whether there is consistent evidence of skill usage.

Passive `SKILL.md` reads that only look like startup skill discovery appear as
`discovered` rows. They remain visible in run details, but they do not turn the
run result into **Warning** or make mode comparison look different by
themselves.

Passive-only runs are labeled as **Captured** rather than **Pass**, because
there is no second evidence stream to compare.

<table>
  <tr>
    <td>
      <img src="https://raw.githubusercontent.com/hideya/skill-trace/main/docs/images/skilltrace-runs.webp" height="250px"><br>
      <sub>SkillTrace runs page</sub>
    </td>
    <td>
      <img src="https://raw.githubusercontent.com/hideya/skill-trace/main/docs/images/skilltrace-run-details-1.webp" height="250px"><br>
      <sub>Run Details Page</sub>
    </td>
  </tr>
  <tr>
    <td>
      <img src="https://raw.githubusercontent.com/hideya/skill-trace/main/docs/images/skilltrace-run-details-2.webp" height="250px"><br>
      <sub>Consistency Check</sub>
    </td>
    <td>
      <img src="https://raw.githubusercontent.com/hideya/skill-trace/main/docs/images/skilltrace-run-details-3.webp" height="250px"><br>
      <sub>Run Timeline</sub>
    </td>
  </tr>
</table>

### Compare Modes

After you have successful runs for the same target repo in different trace
modes, the runs page can compare them.

This is useful when developing a skill:

1. Start with `full` mode to debug whether the agent reads and declares the
   expected skill usage.
2. Try `passive_reflection` to reduce live semantic reporting.
3. Try `passive_only` to observe skill file access with minimal intervention.

Compare Modes checks whether the same skill and reference files appear across
those runs. Since instrumentation may affect an agent's decisions, Compare
Modes helps you gain confidence that the target skills still appear to be used
when tracing becomes less intrusive.

Neutral `discovered` rows are omitted from mode comparison so broad startup
skill scans do not obscure differences in material skill or reference use.

<table>
  <tr>
    <td>
      <img src="https://raw.githubusercontent.com/hideya/skill-trace/main/docs/images/skilltrace-run-mode-comparison.webp" height="250px"><br>
      <sub>Run mode comparison page</sub>
    </td>
  </tr>
</table>

## Git Provenance

When repeatedly modifying Skill files and verifying their behavior, you may want to know the state of the Skill files actually used during a run.

To facilitate this, when the target repo is inside a Git worktree, `skilltrace start` records a
lightweight run snapshot:

- HEAD commit and branch
- broad changed-file status
- bounded diffs for instruction-relevant files
- bounded plain-text contents for changed instruction-relevant files

This helps compare successful and failed runs against the skill/instruction
state they used.

In the run detail page, changed instruction files are highlighted in the Run
snapshot panel; click one to inspect the exact captured plain-text contents used
by that run. Lines with uncommitted changes are highlighted in the viewer.

The snapshot is stored with the run metadata, so deleting a run also removes
its captured provenance.

<table>
  <tr>
    <td>
      <img src="https://raw.githubusercontent.com/hideya/skill-trace/main/docs/images/skilltrace-snapshot-1.webp" height="250px"><br>
      <sub>Git Info Section</sub>
    </td>
    <td>
      <img src="https://raw.githubusercontent.com/hideya/skill-trace/main/docs/images/skilltrace-snapshot-2.webp" height="250px"><br>
      <sub>File Diff Dialog</sub>
    </td>
</table>

## Troubleshooting

Run a quick preflight before launching an agent:

```bash
skilltrace diagnostics
```

Use `skilltrace diagnostics --verbose` when the compact output shows a warning.
It reports daemon/server state, active session, shared probe status when
applicable, and MCP registration for Codex CLI, Claude Code, and Gemini CLI
separately.

If `skilltrace start` cannot connect to the server, start the daemon first:

```bash
skilltrace daemon start
```

Then run `skilltrace diagnostics`, or open `/app/diagnostics`, and confirm the
daemon, server, active session, passive probe, and per-agent MCP registration
state before launching the agent.

If no passive events appear:

- Make sure `skilltrace start` was run before launching the agent.
- On macOS, check `/app/diagnostics` or `skilltrace daemon status` and confirm
  the shared probe is running. Starting the daemon may ask for your admin
  password once because the macOS passive probe uses `fs_usage`.
- On Linux, install `inotify-tools` and confirm the run status says the probe is
  running.
- Confirm the target repo has the expected instruction surface, such as
  `AGENTS.md` with `.agents/skills/` or `CLAUDE.md` with `.claude/skills/`.
- For Claude Code, check the selected instruction profile in the run detail
  page. If a repo has both `AGENTS.md`/`.agents/skills/` and
  `CLAUDE.md`/`.claude/skills/`, SkillTrace may default to `agents` while
  Claude reads its native `.claude/skills/` files. Use
  `--instruction-profile claude-code`, or preserve symlinks when copying a test
  repo, such as with `cp -RP`.
- If events still do not appear, restart the daemon and inspect the probe log
  printed by `skilltrace daemon status`.

If no semantic events or run reflection appear:

- Confirm the MCP server is registered to the same command you are testing.
  Run `skilltrace mcp status`, or use `skilltrace mcp install` to register
  all supported agent clients found on PATH.
- Restart the agent after changing MCP registration.
- Confirm the run mode is `full` or `passive_reflection`; `passive_only`
  intentionally records no semantic declarations or reflection.
- Check the first timeline item for an instrumentation warning. A run started
  without instruction injection can still capture passive events, but the agent
  may never see the MCP reporting instructions.
- Try a stronger model or rerun the same scenario. Semantic reporting and
  reflection depend on the agent following the injected instructions.

## How Is This Different From General Agent Observability?

General agent observability tools trace model calls, tool calls, spans, latency,
cost, and production behavior.

SkillTrace focuses on a narrower question:

> How do we know whether a natural-language skill was activated, declared, and
> reflected as influential in a specific agent run?

It does this by comparing three evidence streams:

- passive file-access traces
- MCP semantic declarations
- structured post-run reflection

SkillTrace is not a replacement for LangSmith, Langfuse, Phoenix, Braintrust,
Weave, or OpenTelemetry-based tracing. It is a complementary local probe for
debugging skill usage itself.

## Why This Matters

The longer-term idea is this:

> The unit of human knowledge accumulation is shifting from documents to
> executable work units enriched with execution evidence and failure histories.

SkillTrace is based on the idea that agent skills should not become trusted
reusable knowledge merely by being shared. To become trustworthy executable
units of collective intelligence, skills need evidence of how they were
activated, how they were used, where they failed, and how those failures
informed improvement.

SkillTrace is a small but concrete first step in that direction. It is not just
a skill execution tracer; it is an attempt to make skill usage observable enough
that failures can eventually become reusable procedural knowledge.

## Known Limitations

SkillTrace is currently pre-alpha.

Known limitations include:

- Codex CLI, Claude Code, and Gemini CLI are the first supported command-line
  workflows.
- Codex App support is not yet available.
- MCP registration diagnostics are read-only and depend on the corresponding
  command-line clients being available on the server process path.
- Passive file access probing is platform-dependent.
- macOS passive probing may require admin privileges.
- Linux passive probing depends on `inotifywait`.
- Semantic traces and reflections depend on agent cooperation.
- Reflection is not ground truth; it may omit, misattribute, or overstate
  influence.
- Instrumentation may change model behavior, especially in `full` mode.
- Passive-only mode can show that files were accessed, but not whether they were
  actually used.
- Passive `SKILL.md` access may be startup discovery rather than task-specific
  use; SkillTrace treats entrypoint-only scans as neutral `discovered` rows.
- SkillTrace currently focuses on observability, not automatic postmortem
  generation or skill improvement.

## Privacy And Data

SkillTrace itself is locally executed and no remote connection is established
(except Google Fonts loading by the UI),
but it may capture sensitive development context.

Depending on the trace mode and repository state, captured data may include:

- skill files and reference files
- injected instrumentation instructions
- Git metadata
- changed-file status
- bounded diffs for instruction-relevant files
- bounded plain-text contents for changed instruction-relevant files
- agent-declared summaries, uncertainties, and file attribution
- MCP semantic logging events
- SkillTrace version and local runtime metadata such as OS platform, CPU
  architecture, Node.js version, and probe backend

Do not run SkillTrace on sensitive repositories unless you understand what is
being recorded. Review captured runs before sharing logs, screenshots, or run
exports.

Local SkillTrace data is stored under `~/.skilltrace`.

## Stop And Uninstall

Stop the daemon:

```bash
skilltrace daemon stop
```

Unregister SkillTrace MCP from supported agent clients:

```bash
skilltrace mcp uninstall
```

Uninstall the package:

```bash
npm uninstall -g skilltrace
```

Uninstalling the package does not remove local SkillTrace data. Remove
`~/.skilltrace` separately if you want to delete captured runs and logs.

## Development

For local development, packaging notes, dogfooding details, and architecture
decisions, see:

- [README_DEV.md](https://github.com/hideya/skill-trace/blob/main/README_DEV.md)
- [docs/architecture-decisions.md](https://github.com/hideya/skill-trace/blob/main/docs/architecture-decisions.md)
- [docs/agent-profile-architecture.md](https://github.com/hideya/skill-trace/blob/main/docs/agent-profile-architecture.md)
- [docs/passive-skill-discovery.md](https://github.com/hideya/skill-trace/blob/main/docs/passive-skill-discovery.md)
- [docs/mcp-semantic-logger.md](https://github.com/hideya/skill-trace/blob/main/docs/mcp-semantic-logger.md)
- [docs/type-fix-demo-mcp-test.md](https://github.com/hideya/skill-trace/blob/main/docs/type-fix-demo-mcp-test.md)
