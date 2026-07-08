# Agent Skills Location Policy

This note records the intended SkillTrace direction after reviewing the
emerging Agent Skills conventions used by Codex CLI, Gemini CLI, and Claude
Code.

## Summary

SkillTrace should move to `.agents/skills/` as the preferred generic Agent
Skills location and drop legacy `.skills/` support.

Supported instruction profiles should become:

- `agents`: `AGENTS.md` plus `.agents/skills/`
- `claude_code`: `CLAUDE.md` or `.claude/CLAUDE.md`, plus `.claude/skills/`

The older `agents_md` profile name and `.skills/` root were useful while the
prototype was proving the tracing model, but they now add avoidable complexity.
Because current users are controlled testers, this is a good time to make the
repository convention simpler and more aligned with the wider ecosystem.

## External Alignment

Current public client documentation points in the same direction:

- Codex CLI documents `.agents/skills/` as the project skill location and
  `$HOME/.agents/skills/` as the user skill location.
- Gemini CLI supports `.agents/skills/` as an interoperability alias alongside
  Gemini-specific skill locations.
- Claude Code still uses `.claude/skills/`, so SkillTrace should keep a
  dedicated Claude Code profile instead of pretending the surfaces are
  identical.

This gives SkillTrace a clean story:

> SkillTrace traces standard Agent Skills by default, and supports Claude Code's
> native skill layout as an explicit profile.

References:

- Codex Agent Skills:
  <https://developers.openai.com/codex/skills>
- Gemini CLI Agent Skills:
  <https://geminicli.com/docs/cli/skills/>

## Why Drop `.skills/`

Dropping `.skills/` now has several benefits:

- avoids presenting a prototype-era layout as a continuing recommendation
- reduces instruction profile auto-detection ambiguity
- avoids extra symlink and path-normalization cases
- makes examples and docs match the convention new users are likely to see
- keeps the user-facing model small before broader trials

The cost is that existing test/demo repos need to move from `.skills/` to
`.agents/skills/`. That is acceptable while the tester group is small.

## Scope

SkillTrace should initially support project-local skill locations:

```text
<repo>/AGENTS.md
<repo>/.agents/skills/

<repo>/CLAUDE.md
<repo>/.claude/CLAUDE.md
<repo>/.claude/skills/
```

Other project-local client-specific roots, such as
`<repo>/.gemini/skills/`, should not become automatic generic roots yet.
SkillTrace should prefer `.agents/skills/` for clients that support the shared
Agent Skills location. If a client-specific project root becomes important in
real trials, add it as an explicit instruction profile or explicit profile
option rather than silently scanning every `.<client>/skills/` directory.

Reasons:

- automatic scanning can make it unclear which instruction surface the agent
  was expected to use
- client-specific roots may have subtly different loading rules
- a visible profile keeps run metadata and comparisons easier to interpret
- `.agents/skills/` gives Codex and Gemini a shared path without another
  SkillTrace-specific branch

User-level skill locations should be recognized as an important future concern,
but not treated as first-class passive-tracing targets yet:

```text
~/.agents/skills/
~/.claude/skills/
~/.gemini/skills/
```

Reasons to defer user-level passive tracing:

- the current passive probe is scoped to the active target repository
- user-level skills can influence many projects and would need clearer run
  attribution
- probing home-directory skill roots may create more privacy and noise concerns
- the UI needs a way to distinguish project instructions from user/global
  instructions

For now, if an agent reports user-level skill files through reflection or
semantic events, SkillTrace can display those paths as reported evidence, but it
should not require passive confirmation for them.

## Instruction Profile Strategy

### `agents`

Use this for clients that follow the generic Agent Skills convention.

Expected surface:

```text
AGENTS.md
.agents/skills/
```

This profile is intended for:

- Codex CLI
- Gemini CLI when using the shared Agent Skills layout
- other clients that adopt `.agents/skills/`

### `claude_code`

Use this for Claude Code's native convention.

Expected surface:

```text
CLAUDE.md
or .claude/CLAUDE.md

.claude/skills/
```

This profile should remain explicit because Claude Code's visible instruction
surface is different, even when users intentionally share files through
symlinks.

## Auto Detection

Auto detection should be conservative:

- if only `agents` is present, select `agents`
- if only `claude_code` is present, select `claude_code`
- if both are present and resolve to the same underlying files, select the
  generic `agents` profile and record an informational note
- if both are present and resolve to different files, select the generic
  `agents` profile only when the user did not request Claude Code, and record a
  visible informational note asking for `--instruction-profile claude-code` when
  testing Claude Code

This note should remain informational, not a warning, when SkillTrace made a
reasonable deterministic choice.

## Symlink Policy

Symlinks are valid and useful. SkillTrace should support setups such as:

```text
.claude/skills -> ../.agents/skills
CLAUDE.md -> AGENTS.md
```

The rule remains:

> Mutate by logical profile path, but deduplicate by resolved filesystem path.

That means SkillTrace should:

- inject through `AGENTS.md` for the `agents` profile
- inject through `CLAUDE.md` or `.claude/CLAUDE.md` for the `claude_code`
  profile
- never insert the same SkillTrace instruction twice into one resolved file
- record both logical and resolved paths in run metadata
- normalize consistency checks by resolved paths where possible

## Passive Probe Policy

Project-local passive roots should come from the selected instruction profile:

```json
{
  "skill_roots": [".agents/skills"]
}
```

or:

```json
{
  "skill_roots": [".claude/skills"]
}
```

If a selected logical root resolves to another repo-local path, SkillTrace may
include both logical and resolved repo-local paths so native and symlinked client
accesses are both captured.

Example:

```text
.claude/skills -> ../.agents/skills
```

For a Claude Code run, the passive config may include:

```json
{
  "skill_roots": [".claude/skills", ".agents/skills"]
}
```

## Migration Checklist

Implementation should happen in small, testable steps:

1. Add the new `agents` profile for `AGENTS.md` plus `.agents/skills/`.
2. Rename or replace user-facing `agents_md` labels with `agents`.
3. Remove `.skills/` from profile detection, target validation, injection, and
   default passive roots.
4. Migrate examples from `.skills/` to `.agents/skills/`.
5. Update instrumentation templates so examples mention `.agents/skills/`.
6. Update Git provenance filtering to include `.agents/**` and no longer treat
   `.skills/**` as an instruction-relevant path.
7. Update tests to use `.agents/skills/`.
8. Keep Claude Code support based on `.claude/skills/`.
9. Keep symlink normalization tests, but point shared-skill examples at
   `.agents/skills/` rather than `.skills/`.
10. Update README and developer docs to present `.agents/skills/` as the
    standard layout.

## Non-Goals For This Migration

This migration should not attempt to:

- manage user-level skills under home directories
- install or modify client-specific skill registries
- infer which agent client the user will run after `skilltrace start`
- support every `<project>/.<client>/skills/` convention automatically
- keep compatibility with `.skills/`

The point is to simplify SkillTrace's default surface while keeping enough
profile structure to support real client differences.
