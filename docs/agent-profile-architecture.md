# Instruction Profile Architecture

> Historical note: this document describes the profile architecture that grew
> out of the original `.skills/` prototype and the first Claude Code support
> pass. The current location policy is recorded in
> [`agent-skills-location-policy.md`](./agent-skills-location-policy.md), which
> makes `.agents/skills/` the preferred generic Agent Skills location and no
> longer treats legacy `.skills/` as a built-in root.

This note records the design and current status for extending SkillTrace beyond
one repository instruction convention. Claude Code is the first non-AGENTS.md
profile. Gemini CLI currently reuses the Agent Skills-compatible profile.

The goal is not to make SkillTrace clever about every agent convention at once.
The goal is to keep each instruction surface safe, inspectable, and generic
enough that AGENTS.md-style tools and Claude Code can share the same tracing
model without pretending their repository conventions are identical.

## Motivation

SkillTrace originally assumed an AGENTS.md-shaped target repo. The current
generic Agent Skills surface is:

- `AGENTS.md`
- `.agents/skills/**`

Claude Code commonly uses a different visible surface:

- `CLAUDE.md` or `.claude/CLAUDE.md`
- `.claude/skills/**`

Some repos intentionally keep these surfaces separate. Other repos symlink one
agent convention to another, such as:

- `CLAUDE.md -> AGENTS.md`
- `AGENTS.md -> CLAUDE.md`
- `.claude/skills -> .agents/skills`
- `.agents/skills -> .claude/skills`

SkillTrace must support both shapes without double-injecting into the same
resolved file or reporting the same underlying skill as unrelated evidence.

## Core Concepts

### Instruction Profile

An instruction profile describes the repository convention SkillTrace is
tracing.

Supported profiles:

- `agents`
- `claude_code`

Gemini CLI uses `agents` when a repo exposes `AGENTS.md` and `.agents/skills/`.
Future instruction profiles may cover other repo instruction conventions.

One run uses one active instruction profile. Mixed-profile tracing can wait
until the single-profile model is boring and reliable.

### Agent Client

An agent client describes the tool that actually runs after `skilltrace start`,
such as Codex CLI, Gemini CLI, Claude Code, or another MCP-capable client.

SkillTrace cannot reliably know this at start time because the user runs the
agent command separately. For now, `agent_client` should remain nullable and be
filled from later evidence such as `skill_trace_context` self-reporting or
future client-specific diagnostics.

### Instruction Surface

An instruction surface is the set of paths an agent client sees and follows.

Each surface should keep both path identities:

- logical path: the path written in the agent convention, such as `CLAUDE.md`
- resolved path: the real filesystem target after resolving symlinks

For example:

```text
logical:  CLAUDE.md
resolved: /repo/AGENTS.md

logical:  .claude/skills
resolved: /repo/.agents/skills
```

The logical path explains the user and agent convention. The resolved path keeps
mutation, passive probing, provenance, and comparison safe.

## Safety Rules

### Never Mutate The Same Resolved File Twice

Before injecting, SkillTrace must resolve every candidate file it might edit.
If two logical paths point to the same resolved file, SkillTrace may write to
that resolved file only once.

This rule matters because symlinked instruction files are common and duplicate
injection would be confusing and risky.

Bad behavior:

```text
AGENTS.md -> CLAUDE.md

write tracing line through AGENTS.md
write tracing line again through CLAUDE.md
```

Expected behavior:

```text
AGENTS.md -> CLAUDE.md

detect shared resolved file
choose one logical path for this instruction profile
write tracing line once
record the alias relationship in metadata
```

### Follow The Active Instruction Profile's Visible Convention

SkillTrace should inject through the logical path used by the active instruction
profile:

- `agents` uses `AGENTS.md`
- `claude_code` uses `CLAUDE.md` or `.claude/CLAUDE.md`

If that logical path is a symlink, the write naturally affects the resolved
target. The run metadata should show both names so the user can understand what
happened.

### Normalize Evidence By Resolved Paths

Passive probe events, semantic declarations, reflection file lists, agent
execution logs, Git provenance, and cross-run comparison should normalize by
resolved path where possible.

The UI may still show the logical path most relevant to the selected
instruction profile, but consistency checks should not treat these as unrelated
files when they resolve to the same target:

```text
CLAUDE.md
AGENTS.md
```

or:

```text
.claude/skills/type-fix/SKILL.md
.agents/skills/type-fix/SKILL.md
```

### Warn On Ambiguous Auto Detection

If both AGENTS.md and Claude Code surfaces exist and do not resolve to the same
files, automatic instruction profile selection should warn instead of guessing
silently.

The first safe behavior can be:

- continue to default to the current Agent Skills-compatible profile
- record detected surfaces in run metadata
- ask the user to pass an explicit instruction profile once selection exists

## Proposed Phases

### Phase 1: Detection Only

Add surface detection without changing current behavior.

Status: implemented for `skilltrace start`. The detected surface report is
stored as `instruction_surfaces` in the run metadata and repeated on the
`trace_session_started` event. Current AGENTS.md injection behavior is
unchanged.

Detect:

- `AGENTS.md`
- `.agents/skills/`
- `CLAUDE.md`
- `.claude/CLAUDE.md`
- `.claude/skills/`

For each detected path, record:

- instruction profile candidate
- logical path
- absolute path
- resolved real path
- whether the path is a symlink
- whether the path points to the same resolved target as another surface

Store this in `trace_session_started` metadata and show it in diagnostics or
run context. This phase should not change injection behavior yet.

### Phase 2: Instruction Profile Selection

Add explicit instruction profile selection:

```bash
skilltrace start --instruction-profile agents
skilltrace start --instruction-profile claude-code
skilltrace start --instruction-profile auto
```

Status: metadata selection is implemented. `skilltrace start` accepts
`--instruction-profile auto|agents|claude-code` and stores the selected
instruction profile as `instruction_profile` in run metadata and the
`trace_session_started` event. `auto` selects the only detected instruction
profile and records a warning when both profiles are present.

Target validation is profile-aware:

- `agents` expects `AGENTS.md` and `.agents/skills/`
- `claude_code` expects `CLAUDE.md` or `.claude/CLAUDE.md`, plus
  `.claude/skills/`

Claude Code injection is now supported in the first-pass profile-aware
implementation.

### Phase 3: Injection Abstraction

Refactor injection around an instruction surface abstraction:

- instruction profile
- instruction file logical path
- instrumentation file path
- SkillTrace config path
- skill roots
- resolved mutation targets

The resolved mutation target set enforces the "write once" rule.

### Phase 4: Claude Code Instruction Profile

Implement the first Claude Code instruction profile:

- inject into `CLAUDE.md` or `.claude/CLAUDE.md`
- write `.skilltrace/instrumentation.md`
- write `.skilltrace.json` with `.claude/skills` as the passive root when
  appropriate
- watch `.claude/skills/**`
- include Claude instruction paths in Git run snapshots
- normalize `.claude/skills` and `.agents/skills` evidence when they resolve
  to the same directory

Status: first-pass implementation is in place. `claude_code` injection writes
the normal SkillTrace instrumentation overlay, inserts the tracing-policy line
into `CLAUDE.md` or `.claude/CLAUDE.md`, and writes `.skilltrace.json` with
`.claude/skills` as the logical passive root. If `.claude/skills` resolves to a
repo-local path such as `.agents/skills`, SkillTrace includes that resolved
repo-local root as an additional passive root so symlinked setups are observed
through either spelling.

### Phase 5: Claude Code Diagnostics

Add diagnostics for Claude Code MCP registration.

This should stay diagnostic-only, like the current Codex check. SkillTrace
should report whether Claude Code appears installed and whether its MCP
registration points to the expected command for the current package/dev mode.

Status: implemented as a read-only diagnostics check. SkillTrace inspects
`claude mcp get skilltrace` when the `claude` CLI is available to the server
process and compares the registered command with the current package/dev mode.
Claude Code itself can also be registered manually with:

```bash
claude mcp add skilltrace --scope user -- skilltrace mcp serve
```

For checkout trials, use `skilltrace-dev mcp serve` instead.

### Phase 6: Gemini CLI As An Agent Skills-Compatible Client

Test Gemini CLI without introducing a new instruction profile.

Status: first-pass manual testing succeeded. Gemini CLI can register the
SkillTrace MCP server and use the existing `agents` profile in an
AGENTS.md-shaped sandbox. SkillTrace diagnostics now inspect `gemini mcp list`
when the `gemini` CLI is available to the server process.

### Phase 7: Cross-Agent Comparison

Once AGENTS.md and Claude Code instruction profiles are stable, compare runs
across profiles.

The comparison should show:

- instruction profile and agent client per run
- logical paths used by each agent
- resolved paths used for normalization
- warnings when instruction profiles used different instruction surfaces
- visibility into Agent Skills-compatible clients, such as Codex CLI and Gemini
  CLI, that share the same instruction profile

This is the point where SkillTrace becomes a generic skill observability tool
rather than an AGENTS.md-shaped tracer.

## Non-Goals For The First Claude Code Pass

- no simultaneous multi-agent tracing
- no automatic migration between `AGENTS.md` and `CLAUDE.md`
- no editing both agent instruction files for one run
- no broad support for every possible agent-specific skill convention
- no manager UI for registering Claude Code MCP servers

The first milestone is now in place:

> SkillTrace can safely detect AGENTS.md and Claude Code instruction surfaces,
> record symlink relationships, inject profile-specific tracing instructions,
> passively observe profile-specific skill roots, and preserve AGENTS.md
> behavior.
