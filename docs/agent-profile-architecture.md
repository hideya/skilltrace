# Agent Profile Architecture Plan

This note records the Phase 0 design for extending SkillTrace beyond the
current Codex CLI workflow, starting with Claude Code.

The goal is not to make SkillTrace clever about every agent convention at once.
The goal is to make the next implementation step safe, inspectable, and generic
enough that Codex and Claude Code can share the same tracing model without
pretending their repository conventions are identical.

## Motivation

SkillTrace currently assumes a Codex-shaped target repo:

- `AGENTS.md`
- `.skills/**`

Claude Code commonly uses a different visible surface:

- `CLAUDE.md` or `.claude/CLAUDE.md`
- `.claude/skills/**`

Some repos intentionally keep these surfaces separate. Other repos symlink one
agent convention to another, such as:

- `CLAUDE.md -> AGENTS.md`
- `AGENTS.md -> CLAUDE.md`
- `.claude/skills -> .skills`
- `.skills -> .claude/skills`

SkillTrace must support both shapes without double-injecting into the same
resolved file or reporting the same underlying skill as unrelated evidence.

## Core Concepts

### Agent Profile

An agent profile describes the client convention SkillTrace is tracing.

Initial profiles:

- `codex`
- `claude_code`

Future profiles may cover other MCP-capable agent clients.

For the first implementation, one run should use one active profile. Mixed-agent
or simultaneous multi-profile tracing can wait until the single-profile model is
boring and reliable.

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
resolved: /repo/.skills
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
choose one logical path for this profile
write tracing line once
record the alias relationship in metadata
```

### Follow The Active Profile's Visible Convention

SkillTrace should inject through the logical path used by the active profile:

- `codex` uses `AGENTS.md`
- `claude_code` uses `CLAUDE.md` or `.claude/CLAUDE.md`

If that logical path is a symlink, the write naturally affects the resolved
target. The run metadata should show both names so the user can understand what
happened.

### Normalize Evidence By Resolved Paths

Passive probe events, semantic declarations, reflection file lists, Git
provenance, and cross-run comparison should normalize by resolved path where
possible.

The UI may still show the logical path most relevant to the selected profile,
but consistency checks should not treat these as unrelated files when they
resolve to the same target:

```text
CLAUDE.md
AGENTS.md
```

or:

```text
.claude/skills/type-fix/SKILL.md
.skills/type-fix/SKILL.md
```

### Warn On Ambiguous Auto Detection

If both Codex and Claude Code surfaces exist and do not resolve to the same
files, automatic profile selection should warn instead of guessing silently.

The first safe behavior can be:

- continue to default to the current Codex-compatible profile
- record detected surfaces in run metadata
- ask the user to pass an explicit profile once profile selection exists

## Proposed Phases

### Phase 1: Detection Only

Add surface detection without changing current behavior.

Detect:

- `AGENTS.md`
- `.skills/`
- `CLAUDE.md`
- `.claude/CLAUDE.md`
- `.claude/skills/`

For each detected path, record:

- profile candidate
- logical path
- absolute path
- resolved real path
- whether the path is a symlink
- whether the path points to the same resolved target as another surface

Store this in `trace_session_started` metadata and show it in diagnostics or
run context. This phase should not change injection behavior yet.

### Phase 2: Profile Selection

Add explicit profile selection:

```bash
traceskill start --profile codex
traceskill start --profile claude-code
traceskill start --profile auto
```

The initial default can stay Codex-compatible. `auto` may select the only
detected surface and warn when both profiles are present.

### Phase 3: Injection Abstraction

Refactor injection around an instruction surface abstraction:

- profile
- instruction file logical path
- instrumentation file path
- SkillTrace config path
- skill roots
- resolved mutation targets

The resolved mutation target set enforces the "write once" rule.

### Phase 4: Claude Code Profile

Implement the first Claude Code run profile:

- inject into `CLAUDE.md` or `.claude/CLAUDE.md`
- write `.skilltrace/instrumentation.md`
- write `.skilltrace.json` with `.claude/skills` as the passive root when
  appropriate
- watch `.claude/skills/**`
- include Claude instruction paths in Git run snapshots
- normalize `.claude/skills` and `.skills` evidence when they resolve to the
  same directory

### Phase 5: Claude Code Diagnostics

Add diagnostics for Claude Code MCP registration.

This should stay diagnostic-only, like the current Codex check. SkillTrace
should report whether Claude Code appears installed and whether its MCP
registration points to the expected command for the current package/dev mode.

### Phase 6: Cross-Agent Comparison

Once Codex and Claude Code profiles both work, compare runs across profiles.

The comparison should show:

- client/profile per run
- logical paths used by each agent
- resolved paths used for normalization
- warnings when profiles used different instruction surfaces

This is the point where SkillTrace becomes a generic skill observability tool
rather than a Codex-shaped tracer.

## Non-Goals For The First Claude Code Pass

- no simultaneous multi-agent tracing
- no automatic migration between `AGENTS.md` and `CLAUDE.md`
- no editing both agent instruction files for one run
- no broad support for every possible agent-specific skill convention
- no manager UI for registering Claude Code MCP servers

The first milestone should be simple:

> SkillTrace can safely detect Codex and Claude Code instruction surfaces,
> record symlink relationships, and prepare for profile-specific injection
> without changing current Codex behavior.
