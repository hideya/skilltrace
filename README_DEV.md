# SkillTrace Developer Notes

This document preserves the deeper project narrative, architecture notes, and
dogfooding workflow. For npm installation and first-run usage, start with
[`README.md`](./README.md).

**SkillTrace is an experimental observability substrate for AI agent skills.**

It correlates passive traces of skill activation, such as `SKILL.md` file access, with active semantic declarations emitted by the model through an MCP logging tool.

The goal is to understand when a natural-language skill is merely read, when it is declared as used, and when it may have actually influenced an agent run.

The current execution path is deliberately local-first and unauthenticated. The
auth scaffolding remains in the repo as future remote/team-mode infrastructure,
but it is intentionally dormant in the local workflow; therefore, there is no
need for `.env`, login, OAuth or SMTP setup.

Long term, SkillTrace aims to help turn AI agent failures into reusable, postmortem-backed procedural knowledge.

> The unit of human knowledge accumulation is shifting from documents to executable work units enriched with failure histories.

---

## Why SkillTrace?

AI agent skills are becoming a new way to package procedural knowledge.

A skill may contain:

- natural-language instructions
- applicability conditions
- constraints
- reference materials
- scripts
- tools
- templates
- organizational context

Unlike traditional documents, skills are not only read by humans. They can be directly consumed and acted upon by AI agents.

This creates a new observability problem.

Tool calls are relatively easy to trace because they cross an external boundary. Skills are harder. A model may read a `SKILL.md` file, absorb it into context, and apply it without producing a clear external event that says:

> “This skill was used here.”

SkillTrace starts from a simple question:

> When a skill fails, do we have enough evidence to reconstruct, analyze, improve, and re-evaluate that failure?

---

## Core idea

SkillTrace separates two kinds of evidence.

### 1. Passive mechanical traces

Facts captured without relying on the model’s self-report.

Examples:

- `SKILL.md` was accessed
- a reference file was accessed
- a script was executed
- a skill file hash was recorded
- an MCP tool was called
- an artifact was read or written

Passive traces help answer:

> What actually happened at the system boundary?

### 2. Active semantic traces

Structured declarations emitted by the model through an MCP logging tool.

Examples:

- why the skill appears applicable
- what assumptions the model is making
- what risks it has identified
- which steps it expects to apply
- which steps it actually applied
- where it deviated from the skill
- what uncertainty remains

Active traces help answer:

> How did the model claim to understand and use the skill?

SkillTrace compares the two.

> Capture mechanical facts passively. Ask models to declare semantic intent actively.

---

## MVP architecture

SkillTrace is currently local-first. The initial product shape is a local
debugging utility:

```bash
version=$(node -p "require('./package.json').version")
pnpm pack
npm install -g "./skilltrace-$version.tgz"
skilltrace daemon start
cd <repo>
skilltrace start
codex
skilltrace stop
```

For local package trials before publishing to npm, build a tarball from this
checkout:

```bash
version=$(node -p "require('./package.json').version")
pnpm pack
npm install -g "./skilltrace-$version.tgz"
```

The `./` is important. Without `./`, npm may interpret
`skilltrace-<version>.tgz` or `some-dir/skilltrace-<version>.tgz` as a registry
or GitHub-style package spec instead of a local tarball path.

The package build emits React Router production assets under `build/` and
package-facing Node entrypoints under `dist/`. The installed `skilltrace`
command runs built JavaScript, not TypeScript through `tsx`. `tsx` is kept only
for checkout development commands such as `pnpm skilltrace` and
`skilltrace-dev`.

After reinstalling or restarting packaged SkillTrace, refresh any already-open
UI tabs if navigation feels stale. A direct URL such as `/app/runs/<run-id>` can
work even when an old browser tab still has stale hydrated client code or route
manifests. Run detail links use document navigation so the run list does not
depend on client-side route discovery after a package rebuild.

After publishing, the intended install shape is:

```bash
npm install -g skilltrace
```

Before publishing a candidate, use the dry-run publishing script:

```bash
pnpm publish:test
```

This follows the same cautious flow used for other small npm packages in this
workspace: clean untracked build artifacts while preserving `.env`, `data`,
and `tmp`, reinstall dependencies, run the package build through `prepack`,
and ask npm to show what would be published without uploading it. When the dry
run looks right and you are logged in with
`npm whoami`, publish with:

```bash
pnpm publish:do
```

By default, `skilltrace start` enables the plug-and-play tracing overlay:

```bash
skilltrace start
```

This writes `.skilltrace/instrumentation.md` from SkillTrace's bundled template,
creates `.skilltrace.json` with the selected instruction profile's passive
skill roots when needed, prepends a single tracing instruction to the selected
instruction file, and records a manifest at `.skilltrace/injection.json`.
`skilltrace stop` removes only the exact inserted instruction and only removes
generated files if SkillTrace created them and they were not changed.

`skilltrace start` expects to run from a supported target repo, such as one with
`AGENTS.md` and `.agents/skills/`, or one with `CLAUDE.md` and
`.claude/skills/`. If no
supported instruction profile is available, it refuses before creating a run so
an accidental parent-directory command does not create misleading trace records.

The injection is experimental but now part of the default local tracing path.
If existing files or unexpected edits are detected, SkillTrace prints warnings
and records them in the run timeline.

SkillTrace supports three run modes:

```bash
skilltrace start --mode full
skilltrace start --mode passive_reflection
skilltrace start --mode passive_only
```

`full` is the default and asks for passive, live semantic, and reflection
evidence. `passive_reflection` asks only for run context and final reflection,
without live skill lifecycle declarations. `passive_only` skips instruction
injection and uses only passive file observations. `--no-inject-instructions`
remains available as an alias for passive-only troubleshooting.

Only one trace session can be active at a time. If a session is already active,
`skilltrace start` refuses and asks you to run `skilltrace stop` first.

`skilltrace serve` runs the local server in the foreground. The usual local
workflow uses daemon mode:

```bash
skilltrace daemon start
skilltrace daemon status
skilltrace daemon logs
skilltrace daemon stop
```

Daemon state is written to `~/.skilltrace/daemon.json`, and server logs are
written to `~/.skilltrace/logs/daemon.log`.

On macOS, daemon mode starts an experimental shared passive probe by default:

```bash
skilltrace daemon start
```

This may prompt for your macOS admin password once at daemon startup so
SkillTrace can start a daemon-owned `fs_usage` worker. Later
`skilltrace start` sessions attach to that shared probe and should not ask for
the password again during the daemon lifetime. If the shared probe is
unavailable or has crashed, `skilltrace start` records a visible warning and
falls back to the normal per-run probe. Linux keeps the current per-run
`inotifywait` probe because it is scoped, lightweight, and does not need sudo.

For macOS troubleshooting, disable the shared probe and return to the per-run
probe path with:

```bash
skilltrace daemon start --no-shared-probe
```

macOS allows only one active `fs_usage`/ktrace-style probe at a time in this
workflow. Stop the dev daemon before trying the packaged daemon with
shared probing, and vice versa. When restarting the same command surface,
SkillTrace cleans up stale shared probe workers for that server before starting
a new one. A shared worker also exits on its own if it cannot reach the daemon
for about 30 seconds.

The packaged server binds to `127.0.0.1` by default. For Linux containers or
VMs where you want to open the UI from the host machine, bind to all interfaces:

```bash
HOST=0.0.0.0 skilltrace daemon start
```

The daemon output and log will show the bind address and any detected IPv4 UI
URLs, such as `http://192.168.64.2:7555`.

Passive file probing currently uses macOS `fs_usage` on macOS and
`inotifywait` from `inotify-tools` on Linux. If the Linux dependency is missing,
`skilltrace start` still creates the run and enables semantic MCP tracing, but
records a visible warning that passive probing is unavailable.

On Alpine Linux, install the passive probe dependency with:

```bash
apk add inotify-tools
```

With `HOST=0.0.0.0`, the daemon prints a host-reachable UI URL when it can
detect one, such as `http://192.168.64.2:7555`.

When installed as an npm package, `skilltrace` is available from npm's global
bin location. From this checkout, `pnpm skilltrace:install` is available as a
development helper; it creates a local `skilltrace-dev` wrapper in
`~/.skilltrace/bin`. The development wrapper defaults to
`http://localhost:5777` so it can coexist with the package command on
`http://localhost:7555`. The dev server uses a strict port, so it fails fast
instead of silently moving to another port when `5777` is already occupied. The
wrapper preserves the repo directory you run it from, so the trace target is
normally just the current working directory.

If your shell cannot find `skilltrace-dev`, add `~/.skilltrace/bin` to your `PATH`:

```bash
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$HOME/.skilltrace/bin"; then
  echo 'export PATH="$HOME/.skilltrace/bin:$PATH"' >> ~/.zshrc
  source ~/.zshrc
fi
```

`pnpm skilltrace:uninstall` removes generated development wrappers from both
the current `~/.skilltrace/bin` location and older installer locations.
See `docs/architecture-decisions.md` for the package/dev installer split and
runtime packaging notes.

The local server serves the web UI, owns one active trace session globally,
supervises the passive probe, and receives MCP semantic events.

See `docs/architecture-decisions.md` for the decisions and complications found
while building the first local prototype. See
`docs/agent-profile-architecture.md` for the AGENTS.md/Claude Code profile
model and symlink-safe instruction surface design. See
`docs/agent-skills-location-policy.md` for the forward-looking plan to make
`.agents/skills/` the generic Agent Skills location and remove legacy
`.skills/` support.

The local UI has three primary views:

- `/app/runs` lists grouped trace runs and opens run detail pages.
- `/app/runs/compare?runs=...` compares selected successful runs for a target
  repo across tracing modes.
- `/app/diagnostics` shows read-only runtime checks for the daemon, server
  process, macOS shared passive probe when applicable, active session, and MCP
  registration for Codex CLI, Claude Code, and Gemini CLI when those CLIs are
  available.

The same runtime check is available from the command line:

```bash
skilltrace-dev diagnostics
skilltrace-dev diagnostics --verbose
```

On the runs page, `Status`, `Result`, and `Mode` are shown separately. The
Result column intentionally shows `Running` while a trace session is active.
Final diagnoses such as `Pass`, `Warning`, or passive-only `Captured` appear
only after `skilltrace stop` records `trace_session_finished`, and are derived
from the file-oriented consistency matrix. If an unstopped run is superseded by a newer
`trace_session_started` event, the Status column shows `Interrupted` to make the
missing cleanup visible.

When a run group has at least two successful modes, the runs page shows
`Compare Modes`. Clicking it selects the latest successful run per mode by
default; the user can choose a different successful run for each mode before
opening the report. The comparison report shows whether skill and reference file
usage remains stable as instrumentation is reduced from full tracing to
passive-only capture.

At `skilltrace start`, after any stale SkillTrace overlay cleanup and before
the current run's overlay is injected, SkillTrace also records a lightweight Git
run snapshot when the target repo is inside a Git worktree. The snapshot stores
the HEAD commit, branch, broad changed-file status, and bounded
instruction-relevant provenance for `AGENTS.md`, `.agents/**`,
`.skilltrace.json`, and `.skilltrace/**`. By default, only
instruction-relevant diffs and plain-text instruction file contents are
captured; other repo changes are recorded as file status entries. The run
detail page uses this metadata to open the exact captured instruction contents
and highlight lines touched by the stored diff. This is the first step toward
comparing successful and failed runs against the exact skill/instruction state
they used. If the target is not a Git repo, the run simply records that no Git
snapshot was available.

The runs list and active run detail pages poll lightly while a run is `Running`
so newly received daemon events appear without a manual refresh. Finished and
idle views do not continue polling.

The diagnostics page is intentionally not a manager. It does not start or stop
processes or edit Codex configuration. It is a quick way to catch common setup
mistakes, such as running the package UI while Codex is still registered to
`skilltrace-dev mcp serve`, or vice versa.

```text
Local LLM environment
  ├─ Agent / LLM client
  ├─ Skills directory
  ├─ skilltrace CLI
  │    └─ starts / ends the active local trace session
  ├─ passive probe
  │    └─ watches SKILL.md / references access
  │
  └─ MCP client
       └─ calls SkillTrace MCP tools

SkillTrace local daemon
  ├─ Web UI
  │    ├─ run timeline
  │    ├─ run context view
  │    ├─ run snapshot and instruction surface views
  │    ├─ consistency matrix
  │    ├─ run reflection view
  │    ├─ mode comparison view
  │    ├─ daemon diagnostics view
  │    └─ MCP registration checks for supported CLI clients
  │
  ├─ Local HTTP API
  │    ├─ active session lifecycle
  │    ├─ passive event receiver
  │    └─ semantic event receiver
  │
  ├─ MCP server command
  │    └─ skill_trace_context / skill_log_event / skill_trace_reflection
  │
  ├─ Trace store
  │    ├─ mechanical events
  │    ├─ semantic events
  │    └─ artifacts / snapshots
  │
  ├─ Consistency checker
  │    └─ compares passive activation and declared use
```

The initial design avoids introducing a heavy skill runner or remote service.

A strong runner may change the execution environment too much. A remote service
also complicates the best local passive-observation experience. Instead,
SkillTrace keeps normal agent execution as intact as possible and adds
observability around it.

> Keep execution as natural as possible. Add observability around it.

### Run detail route structure

The run detail route is intentionally a thin page shell. Its loader/action,
top metrics, back button, and refresh polling stay in
`app/routes/app/runs.$id.tsx`. The larger route-local panels live in
`app/routes/app/+`:

- `run-context-panel.tsx` shows agent-declared context and SkillTrace
  environment metadata.
- `run-snapshot-panel.tsx` shows Git provenance, changed instruction files,
  untracked instruction files, and captured instruction contents.
- `run-instruction-surfaces-panel.tsx` shows detected instruction files,
  skill roots, symlink aliases, and profile-selection warnings.
- `run-consistency-panel.tsx` shows the file-oriented passive / semantic /
  reflection evidence matrix.
- `run-timeline-panel.tsx` shows compact expandable events.
- `run-reflection-panel.tsx` shows pretty and raw run reflection data.

Shared small presentation primitives live in `run-detail-ui.tsx`. Keep new
single-route panels colocated in this `+` folder unless they become reused
outside the run detail page.

---

## Pluggable Instrumentation

SkillTrace now uses a pluggable instrumentation overlay for MCP tracing. A repo
can opt in with a small instruction near the top of `AGENTS.md`:

```md
Before starting any task, read and follow `.skilltrace/instrumentation.md` for SkillTrace MCP tracing.
```

The overlay is tracing policy, not a task skill. It tells the agent how to emit
SkillTrace MCP events while leaving task-specific skills focused on their own
applicability, references, and procedure.

The current overlay pattern is:

- call `skill_trace_context` once near the beginning of the run
- emit `skill_use_started` before applying a task skill
- emit `skill_reference_read` after reading required or recommended skill references
- emit `skill_use_finished` after completing skill-guided work
- emit `skill_trace_reflection` at the end of the task

The final reflection asks for concrete file lists, including `skills_read`,
`references_read`, and `files_believed_to_influence_work`. These lists prepare
SkillTrace to compare passive observations with the agent's retrospective
self-report in lower-intervention tracing modes.

For passive probing, the repo also needs `.skilltrace.json` to declare skill
roots. The default injection flow creates this minimal config when it is missing:

```json
{
  "skill_roots": [".agents/skills"]
}
```

Existing `.skilltrace.json` files are preserved with a warning so real repos can
keep custom skill roots.

Task skills should stay in their normal portable shape: frontmatter for the
skill name and trigger description, then task procedure plus reference paths in
the body. The overlay can infer the skill name from frontmatter or the
`SKILL.md` parent directory, and it can omit `skill_version` when the skill does
not declare one.

This design makes instrumentation portable to real repositories without putting
debugging protocol inside every skill file. It also helps compare passive
evidence with semantic self-report:

- passive trace: the file was accessed
- semantic trace: the agent understood the file as a skill or skill reference

SkillTrace does not attempt to capture hidden chain-of-thought. It asks the
model to emit explicit, inspectable declarations that can be compared with
passive traces. If instrumentation is unavailable, the agent should continue the
task normally and report which tracing calls could not be made.

---

## Example semantic event

```json
{
  "run_id": "run_2026_001",
  "event_type": "skill_use_started",
  "skill": {
    "name": "pr-review",
    "version": "0.1.0",
    "file_hash": "sha256:..."
  },
  "summary": "Using pr-review because the task asks for review of a pull request diff.",
  "data": {
    "why_applicable": [
      "input contains a pull request diff",
      "user asks for review rather than modification"
    ],
    "assumptions": ["diff is complete", "test results are unavailable"],
    "risk_flags": ["possible breaking change", "insufficient test coverage"],
    "expected_steps": [
      "check API compatibility",
      "check migration risk",
      "check test coverage"
    ]
  },
  "related_artifacts": [],
  "confidence": "medium"
}
```

Reference files use a separate semantic event so they do not look like
standalone skill lifecycle events:

```json
{
  "run_id": "run_2026_001",
  "event_type": "skill_reference_read",
  "skill_name": "type-fix",
  "skill_path": ".agents/skills/type-fix/SKILL.md",
  "summary": "Read the type-fix checklist reference.",
  "related_artifacts": [".agents/skills/type-fix/references/checklist.md"],
  "data": {
    "reference_path": ".agents/skills/type-fix/references/checklist.md",
    "reference_role": "required checklist"
  },
  "confidence": "medium"
}
```

---

## Consistency checks

SkillTrace’s first useful feature is a simple consistency checker.

Examples:

### Observed and declared

- `SKILL.md` was read
- `skill_use_started` was logged
- `skill_use_finished` was logged

Interpretation:

> Activation and declared use are aligned.

### Read but not declared

- `SKILL.md` was read
- no `skill_use_started` event was logged

Possible interpretations:

- the instrumentation instruction was ignored
- the skill was read but not used
- the skill was implicitly applied
- activation and use are hard to distinguish

### Declared but not observed

- no `SKILL.md` read was observed
- `skill_use_started` was logged

Possible interpretations:

- the skill was already in context
- the passive harness missed the access
- the model hallucinated skill use
- an external instrumentation overlay triggered the declaration

### Started but not finished

- `SKILL.md` was read
- `skill_use_started` was logged
- no `skill_use_finished` event was logged

Possible interpretations:

- the task was interrupted
- a tool failed
- the model deviated to another skill
- completion logging was skipped

### Reflection compared with passive evidence

- final reflection lists `skills_read` and `references_read`
- passive probe observed matching skill or reference file access

Interpretation:

> The agent's retrospective file list aligns with passive file evidence.

If reflection lists a file that passive probing missed, SkillTrace reports
`Reflected but not observed`. If passive probing observed a file that reflection
omitted, SkillTrace reports `Observed but not reflected`.

---

## Initial experiment

The first experiment compares the same skill, same task, and same model under different observability conditions.

### Condition A: No instrumentation

Normal skill execution. Only input and output are saved.

### Condition B: Passive monitoring only

The file access tracking harness is enabled, but no semantic logging is requested.

### Condition C: Passive monitoring + legacy inline debug instrumentation

Debug instrumentation is added directly inside `SKILL.md` as a contrast case.

### Condition D: Passive monitoring + external instrumentation overlay

The skill file keeps only normal task instructions, while `.skilltrace/instrumentation.md` provides the reusable tracing policy.

### Condition E: Strong debug protocol

The model is strongly instructed to declare skill use before and after execution, including assumptions, risks, deviations, and uncertainties.

Evaluation dimensions:

- output quality
- tool call count
- latency
- token usage
- skill access frequency
- logging compliance
- passive / active trace consistency
- failure reconstructability
- postmortem draftability
- regression case extractability
- behavior drift caused by instrumentation

---

## Initial target skill

The first target skill should be useful in real daily development work.

Recommended starting point:

> PR review skill

Reasons:

- inputs and outputs are concrete
- Git diffs, tests, CI results, and review comments are natural artifacts
- failures are relatively easy to identify
- failures can often be turned into regression cases
- SkillTrace can be dogfooded during its own development

Other possible early skills:

- implementation planning skill
- technical research skill
- test failure triage skill
- DB migration review skill

---

## MVP v0 scope

MVP v0 includes:

- `skill_trace_context`, `skill_log_event`, and `skill_trace_reflection` MCP tools
- passive file access event receiver
- local file access tracking harness for macOS and Linux
- trace event store
- run ID correlation
- simple consistency checker
- run timeline web UI
- read-only daemon and MCP diagnostics UI
- instrumentation ON/OFF comparison support

MVP v0 does not include:

- advanced postmortem generation
- automatic regression test generation
- skill trust cards
- public skill registry
- complex permission management
- multi-user collaboration
- supply-chain security
- full OpenTelemetry integration

The first milestone is not to manage skills.

It is to observe them.

---

## Long-term vision

Most agent and skill discussions focus on:

- making agents more autonomous
- improving tool use
- increasing task success rates
- automating workflows
- packaging reusable prompts or procedures

SkillTrace focuses on a different question:

> Can a skill failure become reusable collective knowledge?

Long term, SkillTrace may evolve toward:

- skill incident schemas
- skill postmortem schemas
- skill trust cards
- known failure modes
- regression case registries
- skill version lineage
- GitHub PR integration
- OpenTelemetry integration
- skill reliability metrics
- public and private skill trace sharing
- LLM-assisted postmortem drafting
- postmortem-backed skill registries

The goal is not merely a skill repository.

The goal is:

> A system for attaching failure histories and improvement histories to executable knowledge.

---

## Slogan

> Trace skill activation passively.  
> Ask models to declare skill use actively.  
> Compare the two.  
> Turn failures into reusable procedural knowledge.
