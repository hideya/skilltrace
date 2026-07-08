# Implementation Field Notes

These notes capture practical lessons from building and dogfooding SkillTrace.
They are intentionally concrete. They record behavior that surprised us, the
shape of the fix, and the current boundary of the solution.

## Codex CLI Works; Codex App Is Not Yet Supported

The first reliable MCP path used command-line Codex with:

```bash
codex mcp add skilltrace -- skilltrace mcp serve
```

The Codex App could show MCP registration state, but did not reliably expose
the custom SkillTrace MCP tools to the agent during our trials. For now,
SkillTrace documents Codex CLI as the supported Codex workflow and treats Codex
App support as future work.

## MCP Registration Must Match The Command Surface

Development and packaged installs can coexist:

- `skilltrace-dev` uses the development port
- `skilltrace` uses the packaged/default port

It is easy to run the dev daemon while Codex MCP is still registered to the
packaged command, or the reverse. The diagnostics page checks
`codex mcp get skilltrace` and compares the registered command with the current
server mode.

## Daemon And Server Are Not The Same Process

`skilltrace daemon start` starts a daemon process, and that daemon starts the
React Router server process. Users experience this as "the daemon is serving
the UI," but internally the server process owns the listening port.

The diagnostics page therefore separates:

- daemon state and user-visible UI URL
- server process PID, host, port, platform, and Node version

## Browser Tabs Can Keep Stale Route Manifests

After rebuilding and reinstalling the packaged app, already-open browser tabs
can hold stale client-side route discovery state. Direct URLs still work, but
client-side navigation from the run list can fail.

The run-list links use document navigation for run details. This favors robust
local diagnostics over preserving SPA-only navigation.

## macOS Passive Probing Needs A Shared Probe Option

macOS `fs_usage` needs elevated privileges and is effectively single-owner in
this workflow. Asking for a password on every run made dogfooding unpleasant and
made orphan probes more likely.

Daemon mode starts a shared macOS probe by default. Later runs attach the active
session to that probe. The daemon owns shared-probe cleanup.

Linux keeps per-run `inotifywait` probing because it is scoped, lightweight,
and does not need sudo.

## Shared Probes Need Stale-Worker Cleanup

If a daemon state file is missing or stale, an old shared probe can still hold
the macOS `fs_usage` slot. Daemon start and stop now clean stale shared probe
workers for the same server, and shared workers exit if they cannot reach the
daemon for about 30 seconds.

## Passive Probe Events Need Process Attribution

Passive file access alone answers "a file was opened," not "the agent opened
the file." During testing, `SKILL.md` and `checklist.md` appeared as passive
reads even when no agent semantic events existed. Adding process attribution
showed both reads were opened by `git`.

Retained passive read events now include:

- `observed_process`
- `observed_process_name`
- `observed_process_id`

The timeline shows this compactly, for example:

```text
skill_file_read by Codex.12345
```

This makes future strange reads easier to explain.

## Git Reads Are Filtered As Measurement Noise

SkillTrace ignores passive reads whose observed process name is exactly `git`.

Git may read tracked instruction files during status, diff, index, snapshot, or
editor-related worktree checks. Those reads are not evidence of agent skill
activation.

The filter is deliberately narrow. Other process names remain visible in the
timeline.

## Marker Gating Was Rejected

We considered opening the shared probe only after an intentional
`.skilltrace.json` marker read. The prototype worked, but process attribution
showed that the observed noise came from Git. The marker gate added a state
machine, ack file, and timing surface without solving the root cause better than
the exact `git` filter.

The current implementation keeps the simpler model:

- attach the active run to the shared probe
- attribute retained passive reads to opener processes
- ignore exact `git` passive reads

## Instruction Injection Should Be Manifest-Backed

`skilltrace start` can temporarily insert a single instruction into `AGENTS.md`
and write `.skilltrace/instrumentation.md` plus `.skilltrace.json`. A manifest
records what SkillTrace created and inserted.

`skilltrace stop` removes only the exact inserted block and only removes
generated files when SkillTrace created them and they were not changed.

This avoids broad backup/restore behavior and keeps cleanup compatible with a
dirty worktree.

## Only One Active Session Keeps The Mental Model Small

SkillTrace refuses `start` while another session is active. This prevents
confusing run IDs, lost injection cleanup, and misleading short runs. If a
newer run exists after an older run missed `trace_session_finished`, the older
run is shown as interrupted.

## Shared Probes Must Tolerate Dev Server Turbulence

The macOS shared probe polls the local SkillTrace server to learn which run is
currently active. During local development, route edits or transient Vite
transform errors can make the server return temporary 500 responses even though
the daemon soon recovers.

The shared probe should not die quickly in that case, because restarting it may
require macOS authorization again. It now keeps retrying for a longer grace
period, logs compact poll failures, and reports recovery when the server becomes
healthy again.

## Passive-Only Runs Should Not Say Pass

A passive-only run has one evidence stream. It can show that evidence was
captured, but it cannot prove semantic agreement. SkillTrace labels successful
passive-only runs as `Captured`, not `Pass`.

## Multiple Signals Can Reveal Partial Reporting Gaps

In Claude Code testing on July 2, 2026, we observed a concrete case where
passive tracing captured access to
`.claude/skills/type-fix/references/checklist.md`, and the run reflection also
listed that reference file, while the agent's semantic MCP report omitted the
corresponding `skill_reference_read` event.

A later run with a different model reported all three signals consistently.
This should not be read as a broad model judgment. It is simply evidence that
semantic self-reporting can vary by run and model, even when the underlying
file access and reflection both indicate the reference was used.

This is one reason SkillTrace compares passive observation, semantic MCP
events, and run reflection instead of trusting any single signal. In this case,
the passive and reflection signals made the semantic reporting gap visible.

## Tracing Helps Validate Shared Instructions Across Agent Clients

In Claude Code testing on July 2, 2026, we tested a repository whose Claude
instruction surface used symlinks to share skill files with another layout. The
run captured the expected passive skill-file access and semantic declarations.

This was useful because task success alone would not prove that the intended
skill surface was used. SkillTrace made the configuration visible: the run
showed which instruction profile was selected, which skill roots were watched,
which files were passively accessed, and which semantic events were emitted.

This kind of validation matters for real repositories, where teams may use
symlinks or shared instruction directories to support multiple agent clients.

## AGENTS.md-Compatible Clients Can Share One Instruction Profile

In Gemini CLI testing on July 2, 2026, we confirmed that Gemini CLI can use the
existing `agents` instruction profile for a repository with `AGENTS.md` and
`.agents/skills/`.

One run with a smaller, faster model produced useful MCP events but used a
slightly different semantic event shape than requested. A later run with a
larger model reported passive, semantic, and reflection signals consistently:
the passive probe observed the skill and checklist files, semantic MCP events
declared the skill lifecycle and reference read, and reflection listed the same
files.

This is another concrete reason SkillTrace keeps the evidence streams separate.
The tool can distinguish "the client/profile integration works" from "this
particular run followed the semantic reporting schema exactly."

## Instruction Profiles Are Separate From Agent Clients

An instruction profile describes repository surfaces such as:

- `agents`: `AGENTS.md` and `.agents/skills/`
- `claude_code`: `CLAUDE.md` and `.claude/skills/`

An agent client is the program that actually runs the task, such as Codex CLI,
Gemini CLI, or Claude Code. SkillTrace can detect instruction surfaces before
the agent starts, but the client is best learned from later context or
reflection because `skilltrace start` does not know which agent command the
user will launch.
