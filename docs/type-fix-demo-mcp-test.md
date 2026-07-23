# Type Fix Demo MCP Test

This runbook explains how to test SkillTrace with a real command-line agent
session using the local MCP server. The main path uses Codex CLI; Claude Code
and Gemini CLI checks are included where they differ.

The goal is to verify that an agent working in a disposable demo repository can:

1. load a local skill-like instruction file
2. call SkillTrace MCP tools
3. fix intentionally broken TypeScript code
4. create semantic trace events visible in the SkillTrace UI

This is the main end-to-end MCP-path experiment. It is stronger than the CLI
fixture because semantic events come from MCP tool calls made by the agent while
the passive probe observes skill and reference file access.

Use command-line Codex for the default experiment. In early testing, Codex via
VS Code saw the demo skill instructions but did not expose the custom
SkillTrace MCP tools to the agent session, even though `/mcp` showed the
`skilltrace` server as enabled.

The current recommended checkout flow uses `skilltrace-dev start`. It asks the
local SkillTrace daemon to create an active session before the agent starts
reading the target repo. On macOS, the daemon-owned shared `fs_usage` probe
normally observes the active session. On Linux, the run uses `inotifywait`. The
MCP server resolves the one active session from the server, so passive skill
reads and semantic declarations share the same run ID.

## Pieces

- Main SkillTrace app: this repository.
- Demo template: `examples/type-fix-demo`.
- Generated demo working copy: `tmp/type-fix-demo`.
- Local checkout CLI: `skilltrace-dev`.
- Local checkout MCP server command: `skilltrace-dev mcp serve`.
- Passive probe: macOS daemon-owned `fs_usage`, or Linux `inotifywait`.
- MCP tools exposed to the agent: `skill_trace_context`, `skill_log_event`, and
  `skill_trace_reflection`.

`tmp/type-fix-demo` is generated from the template and ignored by Git. Reset it before each experiment so fixes made by the test agent do not accidentally become the next starting state.

## Prerequisites

From the main SkillTrace repo, install the local `skilltrace-dev` wrapper once:

```bash
pnpm skilltrace:install
```

The installer writes `~/.skilltrace/bin/skilltrace-dev`. If your shell cannot
find `skilltrace-dev`, add `~/.skilltrace/bin` to your `PATH`:

```bash
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.skilltrace/bin"; then
  echo 'export PATH="$HOME/.skilltrace/bin:$PATH"' >> ~/.zshrc
  source ~/.zshrc
fi
```

`pnpm skilltrace:uninstall` also removes generated wrappers from older
installer locations.

Start the local SkillTrace daemon in another terminal:

```bash
skilltrace-dev daemon start
skilltrace-dev daemon status
skilltrace-dev daemon logs
skilltrace-dev daemon stop
```

On macOS, daemon mode owns a shared `fs_usage` probe by default:

```bash
skilltrace-dev daemon start
```

This is experimental. It may prompt for your macOS admin password once at
daemon startup, shows `shared probe` in `daemon status`, and lets later
`skilltrace-dev start` sessions attach to the shared worker without asking for
the password again during the daemon lifetime. If the shared worker is
unavailable, `skilltrace-dev start` records a warning and falls back to the
normal per-run probe. Linux keeps the normal per-run `inotifywait` path because
it does not need sudo.

For macOS troubleshooting, disable the shared probe with:

```bash
skilltrace-dev daemon start --no-shared-probe
```

Do not run dev and packaged macOS shared-probe daemons at the same time. The
underlying `fs_usage`/ktrace probe is effectively single-owner in this workflow.
Stop one daemon before switching to the other command surface. Restarting the
same command surface cleans up stale shared workers for that server, and a
shared worker exits automatically if it cannot reach its daemon for about 10
minutes.

Daemon mode writes state to `~/.skilltrace/daemon.json` and server logs to
`~/.skilltrace/logs/daemon.log`. The foreground `skilltrace-dev serve` command
is still available for focused server debugging, but it is no longer the
recommended end-to-end dogfooding path.

`skilltrace-dev start` marks the demo repo as the one active SkillTrace
session. On macOS, the daemon-owned shared probe normally observes the active
session after `skilltrace-dev daemon start`; if shared probing is disabled or
unavailable, SkillTrace records a warning and may fall back to a per-run probe.
On Linux, each run uses `inotifywait` and does not need sudo.

The examples below assume SkillTrace is running at:

```text
http://localhost:5777
```

The checkout UI is available at:

```text
http://localhost:5777/app/runs
http://localhost:5777/app/diagnostics
```

Use `/app/diagnostics` as a read-only setup check. It shows the daemon process,
server mode, shared probe status, active session, and whether
`codex mcp get skilltrace` matches the current command surface. For checkout
trials, Codex should be registered to `skilltrace-dev mcp serve`.

For a compact command-line preflight check, run:

```bash
skilltrace-dev diagnostics
skilltrace-dev diagnostics --verbose
```

For package-style trials, build and install a local tarball from the main
SkillTrace repo instead of using `skilltrace-dev`:

```bash
version=$(node -p "require('./package.json').version")
npm pack
npm install -g "./skilltrace-$version.tgz"
skilltrace daemon start
```

Use `./` or an absolute path for the tarball. Without it, npm can interpret the
value as a package or GitHub spec and try to fetch it remotely.

The packaged command defaults to:

```text
http://localhost:7555
```

For package-style trials, use:

```text
http://localhost:7555/app/runs
http://localhost:7555/app/diagnostics
```

In package mode, `/app/diagnostics` expects Codex to be registered to
`skilltrace mcp serve`.

For Linux containers or VMs that should be opened from the host machine, bind
the daemon to all interfaces:

```bash
HOST=0.0.0.0 skilltrace daemon start
```

The daemon prints the actual bind address and a host-reachable UI URL when it
can detect one.

If you have installed the Codex app but not the Codex CLI, define a shell alias to access the bundled CLI version:

```bash
alias codex='/Applications/Codex.app/Contents/Resources/codex'
```

To make it persistent, add that line to your shell rc file, such as `~/.zshrc`.

## Reset The Sandbox

From the main SkillTrace repo:

```bash
pnpm demo:reset type-fix-demo
```

This recreates `tmp/type-fix-demo` from `examples/type-fix-demo`.

The generated repo intentionally contains TypeScript errors in:

```text
tmp/type-fix-demo/src/profile.ts
```

## Register SkillTrace MCP

Register the local SkillTrace MCP server. This registration is generic and does
not name the target repo.

For checkout trials, the helper command registers SkillTrace with every
supported agent CLI it can find:

```bash
skilltrace-dev mcp install
skilltrace-dev mcp status
```

For package-style trials, use:

```bash
skilltrace mcp install
skilltrace mcp status
```

The equivalent manual Codex command is:

```bash
codex mcp add skilltrace -- skilltrace-dev mcp serve
```

For package-style trials, use:

```bash
codex mcp add skilltrace -- skilltrace mcp serve
```

As of June 2026, Codex CLI stores MCP registration globally by default and does
not expose a `--scope` flag.

Then confirm it is registered:

```bash
codex mcp get skilltrace
```

The command should show:

- `enabled: true`
- `transport: stdio`
- `command: skilltrace-dev` for checkout trials
- `command: skilltrace` for package trials
- `args: mcp serve`

The run ID is not configured in the MCP registration. The MCP server resolves
the active SkillTrace session when a SkillTrace MCP tool is called.

You can also confirm this from the SkillTrace UI at `/app/diagnostics`. This is
especially useful when switching between checkout and package trials because
the page compares the registered Codex command against the current UI mode.

For Claude Code checkout trials, register the same MCP server with Claude:

```bash
claude mcp remove skilltrace -s user
claude mcp add skilltrace --scope user -- skilltrace-dev mcp serve
claude mcp get skilltrace
```

For package-style Claude Code trials, use:

```bash
claude mcp remove skilltrace -s user
claude mcp add skilltrace --scope user -- skilltrace mcp serve
```

SkillTrace also shows a read-only Claude Code MCP registration check in
`/app/diagnostics` when the `claude` CLI is available to the server process.

For Gemini CLI checkout trials, register the same MCP server with Gemini:

```bash
gemini mcp add skilltrace skilltrace-dev mcp serve --scope user
gemini mcp list
```

For package-style Gemini CLI trials, use:

```bash
gemini mcp add skilltrace skilltrace mcp serve --scope user
```

Gemini CLI uses the existing `agents` profile for repos with `AGENTS.md` and
`.agents/skills/`. SkillTrace also shows a read-only Gemini CLI MCP registration check
in `/app/diagnostics` when the `gemini` CLI is available to the server process.

## Run The Experiment

Start the trace session from the demo working copy:

```bash
cd tmp/type-fix-demo
skilltrace-dev start
```

For package-style trials, use `skilltrace start`.

Add `--note <text>` or `-n <text>` if you want the runs page to show the
purpose of a particular trial.

This creates `.skilltrace/instrumentation.md` and `.skilltrace.json` if needed,
inserts one SkillTrace instruction at the top of the selected instruction file,
and records `.skilltrace/injection.json` so `skilltrace-dev stop` can clean up
the exact injected changes. For the default `agents` profile, the
instruction file is `AGENTS.md`. For the `claude_code` profile, it is
`CLAUDE.md` or `.claude/CLAUDE.md`.

This starts a background passive probe worker and prints the run URL.
It also prints a probe log path under:

```text
~/.skilltrace/logs/probes/traceskill-probe-<run_id>.log
```

If a session is already active, `skilltrace-dev start` refuses and asks you to run
`skilltrace-dev stop` first. This avoids accidental low-value runs and keeps
manifest-backed instruction cleanup predictable.

Run `skilltrace-dev start` from the demo working copy root, or pass
`--target <repo>`. The command refuses if the target does not contain the
expected instruction surfaces for the selected profile, which catches
accidental parent-directory runs before they create misleading records.
`agents` expects `AGENTS.md` and `.agents/skills/`; `claude_code` expects
`CLAUDE.md` or `.claude/CLAUDE.md`, plus `.claude/skills/`.

For mode comparison trials, use:

```bash
skilltrace-dev start --mode full
skilltrace-dev start --mode passive_reflection
skilltrace-dev start --mode passive_only
```

`full` is the default. `passive_reflection` skips live skill lifecycle logging
but still asks for run context and final reflection. `passive_only` skips
instruction injection entirely. `--no-inject-instructions` remains available as
a passive-only alias.

When instrumentation is not configured, the CLI prints a warning and the run
detail timeline shows a warning badge on the `trace_session_started` row so the
missing semantic tracing setup is visible even after the terminal output is gone.

If passive events do not appear, restart with:

```bash
skilltrace-dev start --debug-probe
```

Then inspect the printed probe log.

For Claude Code profile trials, start from a repo with `CLAUDE.md` or
`.claude/CLAUDE.md` plus `.claude/skills/`:

```bash
skilltrace-dev start --instruction-profile claude-code
claude
skilltrace-dev stop
```

The `claude_code` profile injects into the Claude instruction file and writes
`.skilltrace.json` with `.claude/skills` as the logical passive skill root. If
`.claude/skills` is a symlink to another repo-local skill directory,
SkillTrace also records a resolved repo-local root so passive probing can match
either spelling.

For Gemini CLI trials, use the normal Agent Skills demo surface:

```bash
skilltrace-dev start --instruction-profile agents
gemini
skilltrace-dev stop
```

In July 2026 testing, Gemini CLI worked with the existing `agents` profile.
As with other clients, smaller or faster models may vary in how precisely they
follow the semantic logging schema, so compare passive, semantic, and
reflection evidence rather than trusting one stream alone.

Then start command-line Codex from the same demo working copy:

```bash
codex
```

In Codex, run:

```text
/mcp
```

Confirm that `skilltrace` is enabled before starting the repair task. The passive probe is already running at this point.

When the task starts, ask Codex to call `skill_trace_context` before applying
the skill so the run records declared agent, model, client, working directory,
and task summary metadata.

The probe discovers the target repo from the command-line Codex session.
`skilltrace-dev start` creates the passive probe config:

```text
.skilltrace.json
```

with:

```json
{
  "skill_roots": [".agents/skills"]
}
```

If `.skilltrace.json` already exists, SkillTrace preserves it and records a
warning instead of overwriting the repo's custom skill roots.

Ask Codex:

```text
Please fix the TypeScript errors in this repo.
```

The injected `AGENTS.md` line asks the agent to read:

```text
.skilltrace/instrumentation.md
```

for reusable SkillTrace MCP tracing policy. The sandbox `AGENTS.md` asks the
agent to read:

```text
.agents/skills/type-fix/SKILL.md
```

The instrumentation overlay asks the agent to call `skill_trace_context`,
`skill_log_event`, and `skill_trace_reflection`. The type-fix skill remains a
normal portable skill: its frontmatter supplies the skill name and trigger
description, and its procedure points to the checklist reference.

## Expected Result

In the sandbox Codex session, the agent should:

- notice the TypeScript repair task
- read `.skilltrace/instrumentation.md`
- read `.agents/skills/type-fix/SKILL.md`
- call `skill_log_event` with `event_type: skill_use_started`
- inspect or run `pnpm tsc`
- read `.agents/skills/type-fix/references/checklist.md`
- call `skill_log_event` with `event_type: skill_reference_read`
- fix `src/profile.ts`
- call `skill_log_event` with `event_type: skill_use_finished`

In the main SkillTrace app, open:

```text
http://localhost:5777/app/runs
```

For package-style trials, open `http://localhost:7555/app/runs`, or the
host-reachable URL printed by `HOST=0.0.0.0 skilltrace daemon start`.

Look for a run ID like:

```text
type-fix-demo-r0dpQT-2026-06-19-04-39-12
```

Open the run detail page. The timeline should show semantic events from:

```text
mcp_semantic_logger
```

It should also show passive events from:

```text
passive_file_harness
```

The timeline should show the semantic started, reference-read, and finished
events. It should also show passive file access for `.agents/skills/type-fix/SKILL.md`
and `.agents/skills/type-fix/references/checklist.md`.

After `skilltrace-dev stop` or `skilltrace stop`, a matching Codex rollout
should add `provider_history` events and a
`provider_history_collection_finished` summary. Provider operations appear in
the timeline in this order when values are available:

```text
tool name  operation kind  target paths  outcome
```

For this demo, expect normalized targets such as
`.agents/skills/type-fix/SKILL.md`,
`.agents/skills/type-fix/references/checklist.md`, and `src/profile.ts`, plus
the failed and successful typecheck sequence. A read with an `unknown` outcome
remains a context-only operation rather than positive provider skill evidence;
the compact row omits `unknown`, while the expanded event data retains it.

The runs list should prefer the matched provider model and client over uncertain
agent-declared values. The Run context card should show the same preferred
identity and keep the fuller Provider execution configuration collapsed by
default. Recorded execution context should summarize provider identity,
collection quality, and any provider-confirmed skill/reference reads. The
operation sequence belongs in the timeline and is not duplicated in that card.

If no unique Codex session can be matched, provider collection should report an
unavailable, ambiguous, unsupported, or possibly incomplete status without
changing the run verdict or preventing stop from completing.

The consistency table should show aligned rows for `.agents/skills/type-fix/SKILL.md`
and `.agents/skills/type-fix/references/checklist.md`.

If the demo working copy has local changes to `AGENTS.md`, `.agents/skills/**`,
`.skilltrace.json`, or `.skilltrace/**`, the run detail page should also show a
Run snapshot panel. Changed instruction files appear in its changed-files list;
click one to inspect the exact captured plain-text contents used by that run.
Lines touched by the captured diff are highlighted in the viewer. The snapshot
is stored with the run metadata, so deleting or discarding the run removes this
captured provenance too.

After running at least two successful modes for the same demo working copy, the runs
page should show `Compare Modes` on that run group. It preselects the latest
successful run for each mode; change the selected runs if needed, then click
`Compare Selected`. The comparison report should show whether the same
skill/reference files were captured across the selected mode runs. Neutral
`discovered` skill-entrypoint rows are omitted from comparison so startup skill
catalog scans do not obscure material skill or reference use.

If the consistency table shows a missing passive dot for a file that was
declared semantically, the MCP semantic path worked but the passive probe did
not observe the skill read.

On the runs list, the Result column should show `Running` until
`skilltrace-dev stop` or `skilltrace stop` records `trace_session_finished`.
After stop, it changes to the final diagnosis from the file-oriented
consistency matrix. If an unstopped run is superseded by a newer
`trace_session_started` event, the Status column shows `Interrupted` to make the
missing cleanup visible.

## What This Test Proves

This test verifies:

- A command-line MCP client can launch the local SkillTrace MCP server through
  stdio.
- Codex CLI, Claude Code, and Gemini CLI can see and call the SkillTrace MCP
  tools when registered to the correct command.
- A reusable `.skilltrace/instrumentation.md` overlay can drive SkillTrace MCP calls.
- The local probe worker can observe skill file reads before the agent starts reading the target repo.
- Semantic skill-use declarations can reach `/api/skill-log-events`.
- Passive file read observations can reach `/api/passive-events`.
- The active session ID correlates passive probe events and MCP semantic events.
- `skilltrace stop` can match and privacy-filter the corresponding Codex rollout.
- Provider operations retain normalized kinds, targets, outcomes, and
  extraction provenance without retaining commands or tool output.
- The SkillTrace UI can display the resulting run timeline.

This test does not yet verify:

- general compliance across many skills
- Claude Code or Gemini CLI provider-history adapters
- instrumentation overlay behavior in large real repositories
- remote HTTP MCP transport
- Windows passive probing
- production deployment behavior

## Trying A Real Repository

After the sandbox passes, a real repository can opt into the same tracing shape
with reversible instruction injection.

The low-friction path is:

```bash
skilltrace-dev start
codex
skilltrace-dev stop
```

This temporarily adds a tracing-policy line near the top of `AGENTS.md`, writes
`.skilltrace/instrumentation.md` and a minimal `.skilltrace.json` passive probe
config when needed, and removes only SkillTrace's unchanged injected files on
`stop`.

For a permanent repo-local setup, add the same tracing-policy line manually:

```md
Before starting any task, read and follow `.skilltrace/instrumentation.md` for SkillTrace MCP tracing.
```

Then copy or adapt `.skilltrace/instrumentation.md` from the SkillTrace bundled
template. Keep it generic: it should describe when to call SkillTrace MCP tools,
but it should not contain task-specific repair, review, or implementation
instructions.

Keep repo-local skills in their normal portable shape. Use frontmatter for the
skill name and trigger description, and put task procedure plus reference paths
in the skill body. SkillTrace-specific logging instructions belong in
`.skilltrace/instrumentation.md`, not inside each skill.

This keeps the repository's normal task instructions separate from the tracing
policy, which makes it easier to compare behavior across different real repos.

The injection is manifest-backed. On stop, SkillTrace removes only the exact
inserted instruction block, and removes `.skilltrace/instrumentation.md` and
`.skilltrace.json` only when SkillTrace created them and they have not changed.
Existing files, existing instructions, or edits made during the run are
preserved with warnings.

## Optional Passive Event Check

If the passive probe misses the read and you want to force the same run into the pass state, run the read harness manually using the generated run ID:

```bash
pnpm skilltrace:read \
  --run <generated_run_id> \
  --skill type-fix \
  --server http://localhost:5777 \
  tmp/type-fix-demo/.agents/skills/type-fix/SKILL.md
```

Then refresh the run detail page. The consistency panel can compare the passive skill read with the semantic MCP declarations.

## Cleanup

Remove the MCP server registration when you are done:

```bash
skilltrace-dev mcp uninstall
```

Reset the sandbox before the next experiment:

```bash
pnpm demo:reset type-fix-demo
```

## Troubleshooting

Start with the compact diagnostics check:

```bash
skilltrace-dev diagnostics
```

Use `skilltrace-dev diagnostics --verbose` when it reports a warning. It shows
daemon/server state, active session, shared probe status when applicable, and
per-client MCP registration.

If no run appears, check that:

- SkillTrace is running at `http://localhost:5777`.
- The MCP server command is `skilltrace-dev mcp serve`.
- `/app/diagnostics` shows the expected daemon mode and MCP registration for
  command-line clients available to the server process.
- You ran `skilltrace-dev start` from the target repo before launching Codex.
- You are using command-line Codex, not Codex via VS Code.
- The sandbox agent actually called the SkillTrace MCP tools.
- The run may be under the generated path-hash timestamped ID.

If Codex says a SkillTrace MCP tool is not available, verify that you are
running the command-line Codex session from `tmp/type-fix-demo`. In observed
testing, Codex via VS Code could show the `skilltrace` MCP server as enabled
but still not expose the custom SkillTrace tools to the agent.

If passive events appear but semantic events or reflection do not, verify that
the MCP registration points at the same command you are testing:

```bash
codex mcp get skilltrace
claude mcp get skilltrace
```

For dev trials, the command should usually be `skilltrace-dev mcp serve`. For
package trials, it should usually be `skilltrace mcp serve`. Restart the agent
after changing MCP registration, and confirm the run mode is not `passive_only`.

If semantic MCP events appear but passive events do not on macOS, first check
the shared probe:

```bash
skilltrace-dev daemon status
```

If the daemon was started without the shared probe, or the shared probe fell
back to a per-run probe, you may need to refresh sudo once from your terminal
before starting a fresh command-line agent session:

```bash
sudo -v
```

This sudo step is macOS-only and only applies to `fs_usage` probing. Linux uses
`inotifywait` and does not need sudo for the passive probe.

On Alpine Linux, install the passive probe dependency with:

```bash
apk add inotify-tools
```

With `inotify-tools` installed, a successful Linux run should show passive
`skill_file_read` and `skill_reference_read` events as well as MCP semantic
events. If the MCP semantic events appear but passive events do not, check that
the target repo has `.skilltrace.json` and `.agents/skills`, and that
`skilltrace-dev start` or `skilltrace start` was run before Codex started. Run
`skilltrace-dev status` or `skilltrace status` and confirm the probe says
`running`. If it is not running, inspect the printed probe log.

For Claude Code trials, also check the selected instruction profile and copied
fixture shape. If a repo has both `AGENTS.md`/`.agents/skills/` and
`CLAUDE.md`/`.claude/skills/`, auto-selection may choose `agents` while
Claude reads its native `.claude/skills/` files. That can make the passive probe
look like it missed `SKILL.md` even though it was watching the other copied
surface. Use `--instruction-profile claude-code` for Claude-specific runs, or
preserve symlinks when copying fixtures, such as with `cp -RP`.

If the sandbox starts already fixed, run:

```bash
pnpm demo:reset type-fix-demo
```

If the consistency panel says `Declared but not observed`, the semantic MCP part worked, but the passive probe did not catch the skill file read. Add the optional passive read event if you want a pass state for the same run.

If the consistency panel shows `discovered`, SkillTrace saw a passive
`SKILL.md` entrypoint read but did not see reference, semantic, or reflection
evidence that the skill materially influenced the task. That is expected for
agent startup catalog scans and is not a warning by itself.

When you are done, stop the active session:

```bash
skilltrace-dev stop
```

`skilltrace-dev end` is also accepted as an alias.

From any repo you can run:

```bash
skilltrace-dev start
skilltrace-dev status
skilltrace-dev stop
```
