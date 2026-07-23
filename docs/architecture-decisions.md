# Architecture Decisions

This document records the main decisions from the first SkillTrace prototype experiments.

## Local-First Utility

SkillTrace starts as a local debugging utility, not a remote web service.

Reasons:

- passive file access observation is inherently local
- native probe permissions and dependencies are easier to reason about in the
  user's terminal
- MCP registration should stay stable and generic
- the first product goal is a smooth skill-debugging loop, not team hosting

Remote service support can come later after the local workflow feels solid.

## Local UI Does Not Require Login

The local runs UI is public in v0.
Auth/admin code remains in the repo as a parked, buildable scaffold for possible
future remote/team mode; see
[`auth-admin-scaffold.md`](./auth-admin-scaffold.md) for the current status and
maintenance policy.

Reasons:

- the local daemon is meant to run on the developer's own machine
- login gets in the way of the trace-debugging loop
- auth is still valuable for a future remote/team version
- route-level auth references are kept as comments near the local-mode changes
  to make a future remote mode easy to restore
- normal local tracing must not require `.env`, login, OAuth, SMTP, or remote
  database setup

## Package And Development Installers

SkillTrace has two command surfaces:

- `skilltrace` is the npm-package command for users and friend trials.
- `skilltrace-dev` is the checkout-local command for dogfooding this repository.

Reasons:

- `npm install -g skilltrace` should expose the command that matches the package
  and project name.
- checkout dogfooding should not shadow or mutate a globally installed package
  command
- separate default ports let package and checkout environments coexist
- package/default uses `http://localhost:7555`
- checkout/dev uses `http://localhost:5777`
- MCP registration is less ambiguous when development trials explicitly use
  `skilltrace-dev mcp serve`

Before publishing, the package can be tested with:

```bash
version=$(node -p "require('./package.json').version")
pnpm pack
npm install -g "./skilltrace-$version.tgz"
```

The explicit local path marker matters. `npm install -g skilltrace-<version>.tgz`
or `npm install -g skilltrace/skilltrace-<version>.tgz` can be parsed as a package
or GitHub spec instead of a local tarball, which makes npm try a remote fetch.

For npm publication, SkillTrace follows the same cautious package flow used in
nearby npm projects:

```bash
pnpm publish:test
pnpm publish:do
```

`publish:test` runs `pnpm clean`, `pnpm install`, and
`npm publish --access=public --dry-run`. `publish:do` uses the same flow without
`--dry-run`. The clean step is intentionally interactive and preserves `.env`,
`data` and `tmp`, so local dogfood state is not removed while build artifacts
and old tarballs can be regenerated. Both publish scripts
rely on `prepack`, so the React Router build and package CLI entrypoints are
rebuilt before npm packs the tarball.

The package uses `package.json` `bin` to expose both `skilltrace` and the
existing `skilltrace` alias. `prepack` runs the full production build so the
tarball includes:

- `build/client` and `build/server` from React Router
- `dist/traceskill.js` for the CLI
- `dist/skilltrace-mcp.js` for the MCP server
- `dist/traceskill-probe-worker.js` for passive probing
- `dist/traceskill-serve.js` for the local production server shim

The installed package commands run built JavaScript from `dist`. They do
not depend on `tsx` at runtime.

The checkout installer remains intentionally small. `pnpm skilltrace:install`
writes `~/.skilltrace/bin/skilltrace-dev`, points it back to the current
checkout, launches the CLI through Node's
`--import tsx/dist/loader.mjs`, and sets default development environment
variables:

```text
SKILLTRACE_SERVER=http://localhost:5777
PORT=5777
SKILLTRACE_DEV=1
```

It also removes old generated checkout wrappers from previous installer
layouts, but preserves non-SkillTrace files.

Packaging complications found:

- Runtime commands cannot shell out to `pnpm --dir <checkout>` after npm
  install, so the package commands launch package-local built scripts directly.
- The generated development wrapper still uses Node with
  `--import tsx/dist/loader.mjs` instead of the `tsx` CLI. In restricted
  environments, the `tsx` CLI may try to open an IPC socket and fail before our
  script runs. The packaged command avoids this by running built JavaScript.
- The production local server needs a small runtime shim instead of
  `react-router dev`. It uses `@react-router/node`, serves `build/client`
  assets, and loads the generated `build/server/index.js`.
- The checkout development command sets `SKILLTRACE_DEV=1`, so `serve` and
  `daemon start` use `pnpm dev` instead of the production server shim. Mixing
  the production shim with the dev checkout can produce React runtime mismatch
  errors.
- The dev server uses React Router's strict port mode. This prevents a stale
  server on `5777` from causing a new dev daemon to silently bind a neighboring
  port while the CLI, MCP server, and browser keep talking to `5777`.
- `/api/health` reports the serving process PID. `daemon start` accepts startup
  only when the configured server URL is answered by the spawned daemon process
  or one of its descendants; otherwise it cleans up the attempted daemon state
  and reports the mismatch.
- Runtime environment must be initialized before importing the generated server
  build, because the build imports database and auth modules at module load
  time.
- Packaged local mode stores data under `~/.skilltrace` through
  `SKILLTRACE_DATA_DIR`; checkout development still defaults to `data/local`
  unless that variable is set.
- Production mode should use the local file database unless `DB_URL` is
  explicitly provided. `NODE_ENV=production` alone is not enough to imply a
  remote database for this local package.
- The package server initializes the local tables on startup, including the
  scaffolded `users` table, so friend installs do not need to run
  `pnpm db:init-local`.
- A local-only fallback `COOKIE_SECRET` is set because the v0 local UI does not
  require login, but the scaffolded auth modules still need cookie
  configuration at import time.
- The packaged server binds to `127.0.0.1` by default for local safety. Container
  or VM trials can use `HOST=0.0.0.0 skilltrace daemon start`; the server log and
  daemon output should show the actual bind host and detected IPv4 UI URLs.
- When a daemon is already running, changing `HOST` or `PORT` on a second
  `daemon start` command should not silently change the process. The CLI reports
  the current bind and asks the user to stop and restart the daemon.

This packaging shape is intentionally a developer preview, not a fully
standalone binary. It still requires Node/npm. Passive probing currently uses
macOS `fs_usage` on macOS and `inotifywait` from `inotify-tools` on Linux. If a
probe backend or dependency is unavailable, SkillTrace keeps the run active for
semantic tracing and records a visible warning.

## Packaged UI Navigation

Packaged server routes can be healthy while an already-open browser tab still
has stale hydrated client code or an old route-discovery manifest.

Observed symptom:

- direct run detail URLs return `200`
- route discovery or `.data` requests return `200`
- the development server works
- clicking a run on the packaged runs page does not navigate correctly until
  the tab is refreshed

Decision:

- run-list detail links are plain anchors, not React Router `Link` components
- the `href` remains `/app/runs/<run-id>`
- the browser performs full document navigation for run details

Reasons:

- this local diagnostic UI does not need SPA navigation between the list and a
  detail page
- document navigation is easier to reason about across package rebuilds and
  reinstalls
- avoiding custom client manifest/cache handling keeps the packaged server
  simpler

Operational note:

- after reinstalling or restarting packaged SkillTrace, refresh any already-open
  UI tabs if navigation feels stale

## Diagnostics Page Is Read-Only

SkillTrace includes `/app/diagnostics` for local setup checks.

It currently reports:

- daemon state from `~/.skilltrace/daemon.json`
- the server process rendering the page
- shared probe PID and log path on macOS or when shared probe state exists
- the one active trace session, if present
- MCP registration for supported command-line clients when their CLIs are
  available: Codex, Claude Code, and Gemini CLI

Decision:

- diagnostics are observational, not managerial
- the page may shell out to local read-only commands such as
  `codex mcp get skilltrace`, `claude mcp get skilltrace`, and
  `gemini mcp list`
- it should not add, remove, start, stop, or mutate local configuration

Reasons:

- most current setup mistakes are mode mismatches, stale daemons, or MCP command
  mismatches
- a visible UI check is harder to miss than repeated terminal output
- keeping diagnostics read-only avoids turning the local app into a process
  manager before the lifecycle model is stable

The MCP checks compare the current server mode with the expected command:

- checkout/dev mode expects `skilltrace-dev mcp serve`
- package mode expects `skilltrace mcp serve`

## One Active Session

SkillTrace v0 uses one active trace session globally.

Reasons:

- avoids stale probe processes
- simplifies MCP run ID resolution
- matches the current assumption that one repo is being debugged at a time
- makes `skilltrace start` and `skilltrace stop` easy to understand

Starting a new session should refuse while another session is active. This
avoids low-value accidental runs and keeps instruction injection cleanup easy to
reason about. The user should run `skilltrace stop` before starting another
session.

If the active session was started by mistake, `skilltrace stop --discard`
provides the same cleanup path as normal stop, then deletes that active run's
record and events after CLI confirmation. Discard is intentionally scoped to the
current active session; deleting older finished runs remains a UI operation.

The runs page should not show a final consistency diagnosis for an active run.
While a run is active, the Result column shows `Running`. After
`trace_session_finished`, the Result column shows the final consistency
diagnosis from the file-oriented consistency matrix. If a run never recorded
`trace_session_finished` and any newer `trace_session_started` event exists
globally, the older run's Status is shown as `Interrupted`.

The final consistency diagnosis ignores neutral `discovered` and
execution-log-only rows. A discovered row means SkillTrace observed a passive
`SKILL.md`
entrypoint read, but saw no semantic lifecycle, reflection entry, or same-skill
reference read that would make it material evidence of skill use. An
execution-log-only row is shown as `not evaluated`. Both remain visible in run
details, but neither makes the Result column say `Warning`.

This is intentionally global, not repo-scoped. With the current
single-active-session and manifest-backed injection model, missing `stop` can
mean SkillTrace lost the chance to clean up injected files for the previous
session. The UI should make that lifecycle problem visible even if the next run
targets a different repository.

## CLI-Owned Probe Worker

The local web server does not start the passive probe directly.

Instead, `skilltrace start`:

1. asks the daemon to create an active session
2. prepares the platform probe in the user's terminal
3. launches a background probe worker
4. attaches the worker PID to the active session

On macOS, probe preparation means warming sudo for `fs_usage` from the user's
terminal. This avoids password prompts or sudo context problems inside the React
Router dev server process. On Linux, the `inotifywait` probe does not need sudo.

## Experimental macOS Shared Probe

macOS daemon mode starts a daemon-owned shared probe by default:

```bash
skilltrace daemon start
```

This is experimental and macOS-only. It starts the server and a daemon-owned
`fs_usage` worker at daemon startup, so the user may be prompted for their
macOS admin password once before trace sessions begin. Later `skilltrace start`
calls keep the single-active-session model and attach the active run to the
shared worker without another password prompt during the daemon lifetime.

For macOS troubleshooting, the user can opt out:

```bash
skilltrace daemon start --no-shared-probe
```

Reasons:

- macOS `fs_usage` is already a broad system probe filtered in user space
- moving sudo to daemon startup improves the repeated start/stop dogfooding loop
- SkillTrace still keeps one active session, so the shared probe has only one
  run to route events into
- Linux does not need this path because `inotifywait` is scoped to configured
  skill roots and does not require sudo

Failure behavior:

- daemon status shows the shared probe PID and log when it is configured
- macOS permits only one active `fs_usage`/ktrace-style probe in this workflow,
  so dev and packaged shared-probe daemons should not be run at the same time
- if another shared probe is already running for a different server, daemon
  startup records the conflict instead of starting a second shared worker
- when starting or stopping the same server, stale shared probe workers are
  terminated even if the daemon state file no longer has the worker PID
- shared probe workers exit if they cannot reach the daemon for about 10
  minutes, which prevents an orphan worker from holding the macOS `fs_usage`
  slot forever after a daemon crash or manual kill
- if the shared worker is unavailable or crashed, `skilltrace start` records
  `trace_probe_shared_unavailable`
- when possible, `skilltrace start` falls back to the existing per-run probe
- if the conflict means a per-run macOS probe would also fail, SkillTrace keeps
  the run semantic-only and records a visible warning
- shared probes are marked as `probe_kind: shared` on the active session so
  `skilltrace stop` does not kill the daemon-owned worker
- `skilltrace daemon stop` owns cleanup of the shared worker
- passive probe workers dedupe by run and file for the whole worker lifetime so
  the probe's own file hashing does not create a feedback loop of repeated
  passive events

This makes the repeated macOS dogfooding path smoother while preserving the
simpler per-run probe as an explicit troubleshooting option. Linux keeps the
per-run `inotifywait` path as its default.

## Passive Probe Process Attribution

Passive `skill_file_read` and `skill_reference_read` events record the process
that appeared to open the file when the probe backend can provide it.

On macOS, `fs_usage` lines normally end with a process token such as
`Codex.12345`, `node.12345`, or `git.12345`. SkillTrace stores this in the
passive event payload as:

- `observed_process`
- `observed_process_name`
- `observed_process_id`

The run timeline shows this compactly as `skill_file_read by Codex.12345` for
retained passive read events. This is diagnostic metadata, not part of the
consistency identity. Consistency still compares files and evidence streams.

Reasons:

- passive probing observes the operating system, not agent intent
- unrelated tools can open skill files during a run
- process attribution makes surprising passive reads explainable without
  requiring raw probe logs
- users can file better bug reports when they can see which process triggered a
  read

Linux `inotifywait` does not expose the opener process in the current probe
mode, so these fields may be absent on Linux.

## Filtering Git Passive Reads

SkillTrace ignores passive reads when the observed process name is exactly
`git`.

This filter exists because Git may read tracked instruction files during normal
worktree or index activity, especially around trace startup, snapshots, editor
integration, or status checks. Those reads are mechanical repository inspection,
not evidence that the target agent activated a skill.

The filter is intentionally narrow:

- exact process name `git` is ignored
- other processes are retained and shown in the timeline
- the passive event payload still keeps process attribution for retained reads

This decision replaced an earlier marker-gating experiment. The gate opened the
shared probe only after an intentional `.skilltrace.json` read, but the later
process attribution showed the noisy reads were from Git. Filtering the known
Git noise made the implementation simpler and easier to reason about.

## Use `fs_usage`, Not `opensnoop`

The first probe backend used `opensnoop`, but on the tested macOS environment it failed under System Integrity Protection with DTrace probe errors.

The active prototype now uses:

```bash
sudo -n fs_usage -w -f filesys
```

Complications discovered:

- `fs_usage` may emit lowercase absolute paths
- `fs_usage` may emit repo-relative paths such as `.agents/skills/type-fix/SKILL.md`
- path matching must be case-insensitive on macOS
- probe logs are essential for debugging parser misses

## Linux Probe Uses `inotifywait`

Linux package trials use `inotifywait` from `inotify-tools` as the first passive
probe backend.

Reasons:

- it is easy to install in lightweight Linux environments such as Alpine
- it can recursively watch configured skill roots without elevated privileges
- its output can be mapped directly to the same passive read event shape as the
  macOS probe

Complications discovered:

- the dependency may be missing, so Linux probing must degrade to semantic-only
  tracing with a visible warning
- inotify reports filesystem opens, not model intent
- events can be noisy or duplicated, so the worker still dedupes repeated paths
- an Alpine package trial with `inotify-tools` installed produced the expected
  passive `skill_file_read` and `skill_reference_read` events alongside MCP
  semantic declarations

## Command-Line MCP Clients First

The first successful real MCP test used command-line Codex.

In testing, Codex via VS Code could see the sandbox skill instructions, and `/mcp` could show the `skilltrace` server as enabled, but the custom `skill_log_event` tool was not exposed to the agent session.

For Codex workflows, SkillTrace MCP dogfooding should use command-line Codex.

Claude Code is now supported through the `claude_code` instruction profile and
Claude's command-line MCP registration. The design is captured in
[agent-profile-architecture.md](agent-profile-architecture.md), with special
attention to symlinked instruction surfaces such as `CLAUDE.md -> AGENTS.md`
and `.claude/skills -> .agents/skills`.

Gemini CLI is supported as an Agent Skills-compatible command-line MCP client. It
uses the existing `agents` instruction profile rather than introducing a new
repository surface.

## Pluggable Instrumentation Overlay

SkillTrace tracing instructions should be reusable outside the sandbox.

The current pattern is:

1. add one tracing-policy line near the top of `AGENTS.md`
2. place generic tracing policy in `.skilltrace/instrumentation.md`
3. declare passive skill roots in `.skilltrace.json`
4. keep task-specific skill metadata in the relevant `SKILL.md`

For lower-friction real-repo trials, `skilltrace start` applies the reusable
SkillTrace pieces automatically for the current trace session. It writes
`.skilltrace/instrumentation.md`, creates a minimal `.skilltrace.json` with
`skill_roots: ['.agents/skills']` when needed, and prepends the single `AGENTS.md`
instruction. The mutation is manifest-backed in `.skilltrace/injection.json`,
and `skilltrace stop` removes only the exact inserted instruction block and only
removes generated files when SkillTrace created them and they are unchanged.

The start command supports explicit trace modes:

```bash
skilltrace start --mode full
skilltrace start --mode passive_reflection
skilltrace start --mode passive_only
```

`full` is the default and writes the complete instrumentation template.
`passive_reflection` writes a reduced template that asks only for run context
and final reflection. `passive_only` skips instruction injection; the older
`--no-inject-instructions` flag remains a passive-only alias.

Reasons:

- makes tracing portable to real repositories
- avoids copying a long MCP protocol block into every skill
- keeps task skills focused on domain behavior
- lets SkillTrace compare passive file access with semantic declarations without
  making every reference file look like a separate skill

The overlay is tracing policy, not a task skill. Agents should not emit
`skill_use_started` or `skill_use_finished` for `.skilltrace/instrumentation.md`
itself.

## Git Run Snapshots

`skilltrace start` records a lightweight Git snapshot when the target repo is
inside a Git worktree.

Captured data:

- HEAD commit and current branch, when available
- broad `git status --porcelain` changed-file entries for the worktree
- bounded diffs for instruction-relevant files only
- bounded plain-text contents for changed instruction-relevant files only

Instruction-relevant paths currently include:

- `AGENTS.md`
- `.agents/skills/**`
- `.skilltrace.json`
- `.skilltrace/**`

Reasons:

- future failure analysis needs to know which skill/instruction state a run saw
- full-repo snapshots are too noisy and too sensitive for the default local
  workflow
- broad status still helps explain surprising runs without storing unrelated
  source diffs
- no database migration is needed because the snapshot is stored as run metadata
  and repeated on the `trace_session_started` event
- run deletion removes the captured provenance with the run record, keeping the
  cleanup model simple

The snapshot is captured before SkillTrace applies its temporary instruction
overlay. Injection events and cleanup remain visible in the timeline, while the
snapshot represents the target repo's authored state at trace start.

The run detail page intentionally hides the raw unified diff by default. Changed
instruction files appear in the Run snapshot panel, and clicking one opens the
captured file contents with changed lines highlighted. This keeps the default UI
focused on the file shape the agent actually saw, while retaining enough diff
context for quick inspection.

If the target is not in Git, SkillTrace records that Git provenance was
unavailable and continues the run normally.

## Agent Execution Logs Are Observational

A normal `skilltrace stop` now inspects the matching Codex CLI rollout, Claude
Code project-session file, or Gemini CLI chat-session file and projects a
strict, privacy-filtered subset into `provider_history` events. The adapters
retain successful skill and reference reads, Gemini's explicit successful
skill activation, context-only reads with recoverable targets, structured or
patch-derived edit targets, and recognized test, typecheck, lint, and build
outcomes. They also retain an allowlisted recorded agent configuration.
They never persist prompts, responses, reasoning, raw output, full commands,
file contents, or patch bodies.

The normalized execution-log event stream is stored and displayed independently
from the passive probe, semantic MCP declarations, and agent reflection. It
does not participate in the consistency verdict yet, and missing, ambiguous,
unsupported, or changing logs never block the run from stopping.

The consistency matrix aligns positive execution-log skill and reference reads
in an advisory column. Execution-log-only paths are shown as neutral
`not evaluated` rows. When a context-only execution-log file-read operation
targets an already-keyed row, the matrix shows an amber outline rather than
treating the operation as positive evidence. Context-only operations never
create matrix rows. A gray outline represents completed collection without a
matching record; a dash represents collection that was unavailable, ambiguous,
unsupported, failed, possibly incomplete, or absent. The column does not affect
issue counts, run results, or mode comparison, and it does not substitute for
an expected passive, semantic, or reflection signal.

When a matched agent log session supplies model or client identity, the runs
list and primary Run context rows prefer those recorded values over
agent-declared ones. Declared values remain the fallback when agent execution
logs are unavailable or ambiguous.

The timeline is the primary representation of normalized execution-log
operations. It presents the tool, operation kind, `artifact_refs` targets, and
known outcome in event order. An artifact target records what an operation
addressed; it does not prove semantic skill use or causal influence. Unknown
outcomes remain in the stored event but are not promoted into the compact
header. The Recorded execution context card therefore summarizes recorded
agent identity, collection quality, and skill or reference reads recorded in
agent execution logs without duplicating the operation sequence.

Reasons:

- client-owned execution logs add operation and outcome detail unavailable to
  the operating-system probe
- keeping the source observational avoids turning a version-unstable local
  format into an implicit requirement for successful runs
- a strict server-side payload allowlist provides a second privacy boundary
  after the local adapter
- per-run source fingerprints make repeated batch submission idempotent without
  a schema migration

Execution-log retention follows this principle:

> Be aggressive about semantic coverage, but conservative about retained
> content.

SkillTrace should preserve privacy-safe operation order, nesting, failures,
retries, recovery, verification transitions, affected paths, and extraction
health even when those facts do not affect today's verdict or are only compactly
summarized in the UI. It must continue to exclude prompts, responses, reasoning,
raw output, complete commands, agent-client program wrappers, patches, and file
contents.

This exclusion applies to reasoning content, including thinking blocks and
agent-client-generated reasoning summaries. An allowlisted scalar setting such as
`reasoning_effort` is execution metadata and may be retained without retaining
the reasoning itself. Although reasoning text may contain useful planning or
uncertainty clues, normal collection should prefer explicit semantic
declarations and bounded decision categories. Any experiment that inspects or
retains reasoning requires a separate opt-in research boundary.

The durable model separates:

1. **Observation:** what the agent client recorded, represented by a safely
   normalized mechanical fact.
2. **Evidence status:** the current policy decision about consistency use.
3. **Interpretation:** a revisable postmortem or skill-improvement conclusion.

This lets future versions reinterpret a run without treating temporal proximity
as causation or replacing granular facts with generated prose.

The future interpretation model is documented in
[postmortem-and-skill-improvement.md](postmortem-and-skill-improvement.md).
The cross-source lifecycle, reasoning policy, and research-mode gate are
documented in
[data-and-evidence-management.md](data-and-evidence-management.md).

The format observations, lifecycle, privacy policy, and remaining roadmap are
documented in
[Agent Execution Log Event Source](provider-history-event-source.md) and
[Agent Execution Log Formats](provider-history-formats.md).

## Demo Working Copy

`tmp/type-fix-demo` is generated from `examples/type-fix-demo`.

Reasons:

- the test agent modifies the demo repo
- the intentionally broken fixture must remain reproducible
- the generated working copy should not be committed by accident
- future demos can use the same `tmp/<demo-name>` shape

Run before each experiment:

```bash
pnpm demo:reset type-fix-demo
```

If a terminal was inside the old generated copy when it was reset, `cd` into
the demo again before running commands.
