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

Reasons:

- the local daemon is meant to run on the developer's own machine
- login gets in the way of the trace-debugging loop
- auth is still valuable for a future remote/team version, so the scaffolded auth
  routes remain in the codebase
- route-level auth references are kept as comments near the local-mode changes
  to make a future remote mode easy to restore

## Package And Development Installers

SkillTrace has two command surfaces:

- `traceskill` is the npm-package command for users and friend trials.
- `traceskill-dev` is the checkout-local command for dogfooding this repository.

Reasons:

- `npm install -g skilltrace` should eventually expose the simple command name.
- checkout dogfooding should not shadow or mutate a globally installed package
  command
- separate default ports let package and checkout environments coexist
- package/default uses `http://localhost:7555`
- checkout/dev uses `http://localhost:5777`
- MCP registration is less ambiguous when development trials explicitly use
  `traceskill-dev mcp`

Before publishing, the package can be tested with:

```bash
npm pack
npm install -g ./skilltrace-0.0.0.tgz
```

The explicit local path marker matters. `npm install -g skilltrace-0.0.0.tgz`
or `npm install -g skill-trace/skilltrace-0.0.0.tgz` can be parsed as a package
or GitHub spec instead of a local tarball, which makes npm try a remote fetch.

The package uses `package.json` `bin` to expose `traceskill`. `prepack` runs the
full production build so the tarball includes:

- `build/client` and `build/server` from React Router
- `dist/traceskill.js` for the CLI
- `dist/skilltrace-mcp.js` for the MCP server
- `dist/traceskill-probe-worker.js` for passive probing
- `dist/traceskill-serve.js` for the local production server shim

The installed `traceskill` command runs built JavaScript from `dist`. It does
not depend on `tsx` at runtime.

The checkout installer remains intentionally small. `pnpm traceskill:install`
writes `~/.skilltrace/bin/traceskill-dev`, points it back to the current
checkout, launches the CLI through Node's `--import tsx/dist/loader.mjs`, and
sets default development environment variables:

```text
SKILLTRACE_SERVER=http://localhost:5777
PORT=5777
SKILLTRACE_DEV=1
```

It also removes old generated checkout wrappers named `traceskill` from
`~/.skilltrace/bin` and `~/.local/bin`, but preserves non-SkillTrace files.

Packaging complications found:

- Runtime commands cannot shell out to `pnpm --dir <checkout>` after npm
  install, so `traceskill` launches package-local built scripts directly.
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
- A local-only fallback `COOKIE_SECRET` is set for packaged local mode because
  the v0 local UI does not require login, but the scaffolded auth modules still
  validate cookie configuration at import time.
- The packaged server binds to `127.0.0.1` by default for local safety. Container
  or VM trials can use `HOST=0.0.0.0 traceskill daemon start`; the server log and
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
- shared probe PID and log path when configured
- the one active trace session, if present
- Codex MCP registration from `codex mcp get skilltrace`

Decision:

- diagnostics are observational, not managerial
- the page may shell out to local read-only commands such as
  `codex mcp get skilltrace`
- it should not add, remove, start, stop, or mutate local configuration

Reasons:

- most current setup mistakes are mode mismatches, stale daemons, or MCP command
  mismatches
- a visible UI check is harder to miss than repeated terminal output
- keeping diagnostics read-only avoids turning the local app into a process
  manager before the lifecycle model is stable

The Codex MCP check compares the current server mode with the expected command:

- checkout/dev mode expects `traceskill-dev mcp`
- package mode expects `traceskill mcp`

## One Active Session

SkillTrace v0 uses one active trace session globally.

Reasons:

- avoids stale probe processes
- simplifies MCP run ID resolution
- matches the current assumption that one repo is being debugged at a time
- makes `traceskill start` and `traceskill stop` easy to understand

Starting a new session should refuse while another session is active. This
avoids low-value accidental runs and keeps instruction injection cleanup easy to
reason about. The user should run `traceskill stop` before starting another
session.

The runs page should not show a final consistency diagnosis for an active run.
While a run is active, the Result column shows `Running`. After
`trace_session_finished`, the Result column shows the final consistency
diagnosis from the file-oriented consistency matrix. If a run never recorded
`trace_session_finished` and any newer `trace_session_started` event exists
globally, the older run's Status is shown as `Interrupted`.

This is intentionally global, not repo-scoped. With the current
single-active-session and manifest-backed injection model, missing `stop` can
mean SkillTrace lost the chance to clean up injected files for the previous
session. The UI should make that lifecycle problem visible even if the next run
targets a different repository.

## CLI-Owned Probe Worker

The local web server does not start the passive probe directly.

Instead, `traceskill start`:

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
traceskill daemon start
```

This is experimental and macOS-only. It starts the server and a daemon-owned
`fs_usage` worker at daemon startup, so the user may be prompted for their
macOS admin password once before trace sessions begin. Later `traceskill start`
calls keep the single-active-session model and attach the active run to the
shared worker without another password prompt during the daemon lifetime.

For macOS troubleshooting, the user can opt out:

```bash
traceskill daemon start --no-shared-probe
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
- shared probe workers exit if they cannot reach the daemon for about 30
  seconds, which prevents an orphan worker from holding the macOS `fs_usage`
  slot forever after a daemon crash or manual kill
- if the shared worker is unavailable or crashed, `traceskill start` records
  `trace_probe_shared_unavailable`
- when possible, `traceskill start` falls back to the existing per-run probe
- if the conflict means a per-run macOS probe would also fail, SkillTrace keeps
  the run semantic-only and records a visible warning
- shared probes are marked as `probe_kind: shared` on the active session so
  `traceskill stop` does not kill the daemon-owned worker
- `traceskill daemon stop` owns cleanup of the shared worker
- passive probe workers dedupe by run and file for the whole worker lifetime so
  the probe's own file hashing does not create a feedback loop of repeated
  passive events

This makes the repeated macOS dogfooding path smoother while preserving the
simpler per-run probe as an explicit troubleshooting option. Linux keeps the
per-run `inotifywait` path as its default.

## Use `fs_usage`, Not `opensnoop`

The first probe backend used `opensnoop`, but on the tested macOS environment it failed under System Integrity Protection with DTrace probe errors.

The active prototype now uses:

```bash
sudo -n fs_usage -w -f filesys
```

Complications discovered:

- `fs_usage` may emit lowercase absolute paths
- `fs_usage` may emit repo-relative paths such as `.skills/type-fix/SKILL.md`
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

## Command-Line Codex First

The first successful real MCP test used command-line Codex.

In testing, Codex via VS Code could see the sandbox skill instructions, and `/mcp` could show the `skilltrace` server as enabled, but the custom `skill_log_event` tool was not exposed to the agent session.

For now, SkillTrace MCP dogfooding should use command-line Codex.

## Pluggable Instrumentation Overlay

SkillTrace tracing instructions should be reusable outside the sandbox.

The current pattern is:

1. add one tracing-policy line near the top of `AGENTS.md`
2. place generic tracing policy in `.skilltrace/instrumentation.md`
3. declare passive skill roots in `.skilltrace.json`
4. keep task-specific skill metadata in the relevant `SKILL.md`

For lower-friction real-repo trials, `traceskill start` applies the reusable
SkillTrace pieces automatically for the current trace session. It writes
`.skilltrace/instrumentation.md`, creates a minimal `.skilltrace.json` with
`skill_roots: ['.skills']` when needed, and prepends the single `AGENTS.md`
instruction. The mutation is manifest-backed in `.skilltrace/injection.json`,
and `traceskill stop` removes only the exact inserted instruction block and only
removes generated files when SkillTrace created them and they are unchanged.

The start command supports explicit trace modes:

```bash
traceskill start --mode full
traceskill start --mode passive_reflection
traceskill start --mode passive_only
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

`traceskill start` records a lightweight Git snapshot when the target repo is
inside a Git worktree.

Captured data:

- HEAD commit and current branch, when available
- broad `git status --porcelain` changed-file entries for the worktree
- bounded diffs for instruction-relevant files only
- bounded contents for untracked instruction-relevant files only

Instruction-relevant paths currently include:

- `AGENTS.md`
- `.skills/**`
- `.skilltrace.json`
- `.skilltrace/**`

Reasons:

- future failure analysis needs to know which skill/instruction state a run saw
- full-repo snapshots are too noisy and too sensitive for the default local
  workflow
- broad status still helps explain surprising runs without storing unrelated
  source diffs
- no database migration is needed because the snapshot is stored in the run bag
  and repeated on the `trace_session_started` event

The snapshot is captured before SkillTrace applies its temporary instruction
overlay. Injection events and cleanup remain visible in the timeline, while the
snapshot represents the target repo's authored state at trace start.

If the target is not in Git, SkillTrace records that Git provenance was
unavailable and continues the run normally.

## Sandbox Template

`agent-sandbox-repo` is generated from `agent-sandbox-repo-template`.

Reasons:

- the test agent modifies the sandbox repo
- the intentionally broken fixture must remain reproducible
- the generated sandbox should not be committed by accident

Run before each experiment:

```bash
pnpm sandbox:reset
```

If a terminal was inside the old generated sandbox when it was reset, `cd` into the sandbox again before running commands.
