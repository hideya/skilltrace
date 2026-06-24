# Agent Sandbox MCP Test

This runbook explains how to test SkillTrace with a real Codex session using the local MCP server.

The goal is to verify that an agent working in a separate fake repository can:

1. load a local skill-like instruction file
2. call SkillTrace MCP tools
3. fix intentionally broken TypeScript code
4. create semantic trace events visible in the SkillTrace UI

This is the main end-to-end MCP-path experiment. It is stronger than the CLI
fixture because semantic events come from MCP tool calls made by the agent while
the passive probe observes skill and reference file access.

Use command-line Codex for this experiment. In early testing, Codex via VS Code
saw the sandbox skill instructions but did not expose the custom SkillTrace MCP
tools to the agent session, even though `/mcp` showed the `skilltrace` server as
enabled.

The current recommended checkout flow uses `traceskill-dev start`. It asks the
local SkillTrace server to create an active session, then launches a passive
probe worker for the current repo before Codex starts. The probe uses `fs_usage`
on macOS and `inotifywait` on Linux. The MCP server resolves the one active
session from the server, so passive skill reads and semantic declarations share
the same run ID.

## Pieces

- Main SkillTrace app: this repository.
- Sandbox template: `agent-sandbox-repo-template`.
- Generated sandbox repo: `agent-sandbox-repo`.
- Local checkout CLI: `traceskill-dev`.
- Local checkout MCP server command: `traceskill-dev mcp`.
- Passive probe: macOS `sudo -n fs_usage -w -f filesys`, or Linux `inotifywait`.
- MCP tools exposed to Codex: `skill_trace_context`, `skill_log_event`, and
  `skill_trace_reflection`.

`agent-sandbox-repo` is generated from the template and ignored by Git. Reset it before each experiment so fixes made by the test agent do not accidentally become the next starting state.

## Prerequisites

From the main SkillTrace repo, install the local `traceskill-dev` wrapper once:

```bash
pnpm traceskill:install
```

The installer writes `~/.skilltrace/bin/traceskill-dev`. If your shell cannot
find `traceskill-dev`, add `~/.skilltrace/bin` to your `PATH`:

```bash
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.skilltrace/bin"; then
  echo 'export PATH="$HOME/.skilltrace/bin:$PATH"' >> ~/.zshrc
  source ~/.zshrc
fi
```

`pnpm traceskill:uninstall` also removes older generated wrappers from
`~/.local/bin/traceskill`.

Start the local SkillTrace server in another terminal:

```bash
traceskill-dev serve
```

For experimental background operation, use:

```bash
traceskill-dev daemon start
traceskill-dev daemon status
traceskill-dev daemon logs
traceskill-dev daemon stop
```

On macOS, daemon mode owns a shared `fs_usage` probe by default:

```bash
traceskill-dev daemon start
```

This is experimental. It may prompt for your macOS admin password once at
daemon startup, shows `shared probe` in `daemon status`, and lets later
`traceskill-dev start` sessions attach to the shared worker without asking for
the password again during the daemon lifetime. If the shared worker is
unavailable, `traceskill-dev start` records a warning and falls back to the
normal per-run probe. Linux keeps the normal per-run `inotifywait` path because
it does not need sudo.

For macOS troubleshooting, disable the shared probe with:

```bash
traceskill-dev daemon start --no-shared-probe
```

Do not run dev and packaged macOS shared-probe daemons at the same time. The
underlying `fs_usage`/ktrace probe is effectively single-owner in this workflow.
Stop one daemon before switching to the other command surface.

The foreground `serve` command is still the default dogfooding path. The daemon
mode writes state to `~/.skilltrace/daemon.json` and server logs to
`~/.skilltrace/logs/daemon.log`.

`traceskill-dev start` launches the passive probe worker from your terminal. On
macOS, that keeps the sudo prompt in the user's terminal instead of inside the
web server process. On Linux, the `inotifywait` probe does not need sudo.

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
trials, Codex should be registered to `traceskill-dev mcp`.

For package-style trials, build and install a local tarball from the main
SkillTrace repo instead of using `traceskill-dev`:

```bash
npm pack
npm install -g ./skilltrace-0.0.0.tgz
traceskill daemon start
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
`traceskill mcp`.

For Linux containers or VMs that should be opened from the host machine, bind
the daemon to all interfaces:

```bash
HOST=0.0.0.0 traceskill daemon start
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
codex mcp add skilltrace -- traceskill-dev mcp
```

For package-style trials, use:

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
- `command: traceskill-dev` for checkout trials, or `command: traceskill` for package trials
- `args: mcp`

The run ID is not configured in the MCP registration. The MCP server resolves
the active SkillTrace session when a SkillTrace MCP tool is called.

You can also confirm this from the SkillTrace UI at `/app/diagnostics`. This is
especially useful when switching between checkout and package trials because
the page compares the registered Codex command against the current UI mode.

## Run The Experiment

Start the trace session from the sandbox repo:

```bash
cd agent-sandbox-repo
traceskill-dev start
```

For package-style trials, use `traceskill start`.

This creates `.skilltrace/instrumentation.md` and `.skilltrace.json` if needed,
inserts one SkillTrace instruction at the top of `AGENTS.md`, and records
`.skilltrace/injection.json` so `traceskill-dev stop` can clean up the exact
injected changes.

This starts a background passive probe worker and prints the run URL.
It also prints a probe log path under:

```text
~/.skilltrace/logs/probes/traceskill-probe-<run_id>.log
```

If a session is already active, `traceskill-dev start` refuses and asks you to run
`traceskill-dev stop` first. This avoids accidental low-value runs and keeps
manifest-backed instruction cleanup predictable.

For passive-only troubleshooting, use `traceskill-dev start --no-inject-instructions`.
When instrumentation is not configured, the CLI prints a warning and the run
detail timeline shows a warning badge on the `trace_session_started` row so the
missing semantic tracing setup is visible even after the terminal output is gone.

If passive events do not appear, restart with:

```bash
traceskill-dev start --debug-probe
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

When the task starts, ask Codex to call `skill_trace_context` before applying
the skill so the run records declared agent, model, client, working directory,
and task summary metadata.

The probe discovers the target repo from the command-line Codex session.
`traceskill-dev start` creates the passive probe config:

```text
.skilltrace.json
```

with:

```json
{
  "skill_roots": [".skills"]
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
.skills/type-fix/SKILL.md
```

The instrumentation overlay asks the agent to call `skill_trace_context`,
`skill_log_event`, and `skill_trace_reflection`. The type-fix skill supplies the
task-specific metadata and required checklist reference.

## Expected Result

In the sandbox Codex session, the agent should:

- notice the TypeScript repair task
- read `.skilltrace/instrumentation.md`
- read `.skills/type-fix/SKILL.md`
- call `skill_log_event` with `event_type: skill_use_started`
- inspect or run `pnpm tsc`
- read `.skills/type-fix/references/checklist.md`
- call `skill_log_event` with `event_type: skill_reference_read`
- fix `src/profile.ts`
- call `skill_log_event` with `event_type: skill_use_finished`

In the main SkillTrace app, open:

```text
http://localhost:5777/app/runs
```

For package-style trials, open `http://localhost:7555/app/runs`, or the
host-reachable URL printed by `HOST=0.0.0.0 traceskill daemon start`.

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

The timeline should show the semantic started, reference-read, and finished
events. It should also show passive file access for `.skills/type-fix/SKILL.md`
and `.skills/type-fix/references/checklist.md`.

The consistency panel should show:

```text
Observed and declared
```

with a message like:

```text
type-fix was read, started, and finished.
```

If the consistency panel says `Declared but not observed`, the MCP semantic path worked but the passive probe did not observe the skill read.

On the runs list, the Result column should show `Running` until
`traceskill-dev stop` or `traceskill stop` records `trace_session_finished`.
After stop, it changes to the final diagnosis. If an unstopped run is
superseded by a newer `trace_session_started` event, the Result column shows
`Incomplete` to make the missing cleanup visible.

## What This Test Proves

This test verifies:

- Codex can launch the local SkillTrace MCP server through stdio.
- Codex can see and call the SkillTrace MCP tools.
- A reusable `.skilltrace/instrumentation.md` overlay can drive SkillTrace MCP calls.
- The local probe worker can observe skill file reads before Codex starts reading the target repo.
- Semantic skill-use declarations can reach `/api/skill-log-events`.
- Passive file read observations can reach `/api/passive-events`.
- The active session ID correlates passive probe events and MCP semantic events.
- The SkillTrace UI can display the resulting run timeline.

This test does not yet verify:

- general compliance across many skills
- instrumentation overlay behavior in large real repositories
- remote HTTP MCP transport
- Windows passive probing
- production deployment behavior

## Trying A Real Repository

After the sandbox passes, a real repository can opt into the same tracing shape
with reversible instruction injection.

The low-friction path is:

```bash
traceskill-dev start
codex
traceskill-dev stop
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

For any repo-local skill you want to probe, add a small metadata section to the
skill file:

```md
## SkillTrace Metadata

- `skill_name`: `example-skill`
- `skill_version`: `0.1.0`
- `skill_path`: `.skills/example-skill/SKILL.md`
- start summary: `Using example-skill for the current task.`
- finish summary: `Finished example-skill guided work.`
- required references:
  - path: `.skills/example-skill/references/checklist.md`
  - role: `required checklist`
```

This keeps the repository's normal task instructions separate from the
SkillTrace tracing policy, which makes it easier to compare behavior across
different real repos.

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

- SkillTrace is running at `http://localhost:5777`.
- The MCP server command is `traceskill-dev mcp`.
- `/app/diagnostics` shows the expected daemon mode and Codex MCP registration.
- You ran `traceskill-dev start` from the target repo before launching Codex.
- You are using command-line Codex, not Codex via VS Code.
- The sandbox agent actually called the SkillTrace MCP tools.
- The run may be under the generated path-hash timestamped ID.

If Codex says a SkillTrace MCP tool is not available, verify that you are
running the command-line Codex session from `agent-sandbox-repo`. In observed
testing, Codex via VS Code could show the `skilltrace` MCP server as enabled
but still not expose the custom SkillTrace tools to the agent.

If the MCP server fails to start, run:

```bash
sudo -v
```

then start a fresh command-line Codex session. On macOS, the probe intentionally
uses `sudo -n` so it cannot ask for a password through MCP stdio.

This sudo step is macOS-only. Linux uses `inotifywait` and does not need sudo
for the passive probe.

On Alpine Linux, install the passive probe dependency with:

```bash
apk add inotify-tools
```

With `inotify-tools` installed, a successful Linux run should show passive
`skill_file_read` and `skill_reference_read` events as well as MCP semantic
events. If the MCP semantic events appear but passive events do not, check that
the target repo has `.skilltrace.json` and `.skills`, and that
`traceskill-dev start` or `traceskill start` was run before Codex started. Run
`traceskill-dev status` or `traceskill status` and confirm the probe says
`running`. If it is not running, inspect the printed probe log.

If the sandbox starts already fixed, run:

```bash
pnpm sandbox:reset
```

If the consistency panel says `Declared but not observed`, the semantic MCP part worked, but the passive probe did not catch the skill file read. Add the optional passive read event if you want a pass state for the same run.

When you are done, stop the active session:

```bash
traceskill-dev stop
```

`traceskill-dev end` is also accepted as an alias.

From any repo you can run:

```bash
traceskill-dev start
traceskill-dev status
traceskill-dev stop
```
