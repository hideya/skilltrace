# Agent Skills Location Policy

This document explains which Agent Skills locations SkillTrace supports and
why.

Last reviewed: 2026-07-09.

## Summary

SkillTrace supports two instruction profiles:

- `agents`: `AGENTS.md` plus `.agents/skills/`
- `claude_code`: `CLAUDE.md` or `.claude/CLAUDE.md`, plus `.claude/skills/`

The `agents` profile is the default. It is intended for clients that follow the
interoperable Agent Skills layout, including Codex CLI and Gemini CLI when used
with the shared `.agents/skills/` location.

The `claude_code` profile exists because Claude Code has a mature native layout
with different instruction files and skill roots. SkillTrace treats that as a
real platform difference rather than hiding it behind the generic profile.

## Platform Status

The current ecosystem points toward one shared generic layout plus a few
client-native layouts.

| Client      | Project skills location                | User skills location                       | SkillTrace profile                    |
| ----------- | -------------------------------------- | ------------------------------------------ | ------------------------------------- |
| Codex CLI   | `.agents/skills/`                      | `~/.agents/skills/`                        | `agents`                              |
| Gemini CLI  | `.agents/skills/` or `.gemini/skills/` | `~/.agents/skills/` or `~/.gemini/skills/` | `agents` when using `.agents/skills/` |
| Claude Code | `.claude/skills/`                      | `~/.claude/skills/`                        | `claude_code`                         |

Codex documents repository skills under `.agents/skills/` and user skills under
`$HOME/.agents/skills/`. Gemini CLI documents `.agents/skills/` as an
interoperability alias, and notes that the alias takes precedence over
`.gemini/skills/` within the same tier. Claude Code documents project skills
under `.claude/skills/` and personal skills under `~/.claude/skills/`.

References:

- Codex Agent Skills:
  <https://developers.openai.com/codex/skills>
- Gemini CLI Agent Skills:
  <https://geminicli.com/docs/cli/skills/>
- Claude Code Skills:
  <https://code.claude.com/docs/en/skills>

## Supported Project Layouts

SkillTrace focuses on project-local skills because the current product is about
tracing a specific run against a specific repository.

Generic Agent Skills profile:

```text
<repo>/AGENTS.md
<repo>/.agents/skills/
```

Claude Code profile:

```text
<repo>/CLAUDE.md
<repo>/.claude/CLAUDE.md
<repo>/.claude/skills/
```

The `agents` profile should be used for Codex CLI, Gemini CLI with
`.agents/skills/`, and other clients that intentionally adopt the shared Agent
Skills layout.

The `claude_code` profile should be used for Claude Code, even when a repository
shares files with the generic layout through symlinks.

## Decisions

### Prefer One Generic Profile

SkillTrace uses `agents`, not client names such as `codex` or `gemini`, for the
generic profile. The profile describes the instruction surface, not the agent
client that eventually runs the task.

This keeps run metadata clearer:

- `instruction_profile`: which files SkillTrace prepared and watched
- `agent_client`: what the agent reported about itself through run context

SkillTrace cannot reliably know whether the user will run `codex`, `gemini`, or
another compatible client after `skilltrace start`.

### Keep Claude Code Explicit

Claude Code deserves a separate profile because it uses `CLAUDE.md` and
`.claude/skills/`, and because its skill loading behavior is not identical to
the generic `.agents/skills/` profile.

The separate profile also makes tests and run comparisons easier to interpret.
If a run says `claude_code`, the user can immediately tell that SkillTrace
prepared Claude-native surfaces.

### Do Not Chase Every Client-Specific Variant

SkillTrace does not automatically scan every possible path such as:

```text
.gemini/skills/
.github/skills/
.<client>/skills/
```

Gemini CLI can use `.agents/skills/`, so SkillTrace asks Gemini users to use
that shared path for now. Other client-specific locations may be added later
only when real usage shows a strong need.

The default stance is deliberately boring:

> Support the interoperable path first. Add explicit profiles only for real
> platform differences.

## Goals

This policy aims to:

- keep SkillTrace easy to explain to first-time users
- make run metadata explicit and comparable across clients
- align the default path with the emerging Agent Skills convention
- support Claude Code without pretending its native surface is generic
- reduce surprising auto-detection behavior
- keep passive probe configuration scoped to the active repository
- make symlink-heavy shared-instruction setups possible without duplicate
  injection

## Non-Goals

SkillTrace does not currently aim to:

- manage user-level skills under home directories
- passively probe home-directory skill roots by default
- install, move, or synchronize skill files for each agent client
- infer which agent client the user will run after `skilltrace start`
- support every `<repo>/.<client>/skills/` convention automatically

These are not rejected forever. They are intentionally deferred until they have
clear product value and enough field evidence.

## Auto Detection

Auto detection should be conservative:

- if only `agents` is present, select `agents`
- if only `claude_code` is present, select `claude_code`
- if both are present and the user did not request a profile, select `agents`
  and record an informational note
- if the user requests `--instruction-profile claude-code`, use Claude Code
  surfaces and record that choice in run metadata

Multiple detected profiles are not necessarily a problem. They often mean the
repository intentionally supports more than one agent client. SkillTrace should
display this as information, not as a warning, when it made a deterministic
choice.

## Symlink Policy

Symlinks are valid and useful for teams that want one shared set of skills to
serve multiple clients.

Supported examples:

```text
.claude/skills -> ../.agents/skills
CLAUDE.md -> AGENTS.md
```

The rule is:

> Mutate by logical profile path, but deduplicate by resolved filesystem path.

That means SkillTrace should:

- inject through `AGENTS.md` for the `agents` profile
- inject through `CLAUDE.md` or `.claude/CLAUDE.md` for the `claude_code`
  profile
- avoid inserting the same SkillTrace instruction twice into one resolved file
- record logical and resolved paths in run metadata
- normalize consistency checks by resolved paths where possible

## Passive Probe Policy

Project-local passive roots come from the selected instruction profile.

For `agents`:

```json
{
  "skill_roots": [".agents/skills"]
}
```

For `claude_code`:

```json
{
  "skill_roots": [".claude/skills"]
}
```

If a logical skill root resolves to another repo-local path, SkillTrace may
include both paths so native and symlinked client accesses are captured.

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

This is still project-local tracing. User-level skill roots may appear in
semantic events or reflection if an agent reports them, but SkillTrace should
not require passive confirmation for user-level paths until the UI can clearly
separate project evidence from user/global evidence.

## When To Add A New Profile

Add a new instruction profile only when all of these are true:

- a client has a distinct project-local instruction surface
- the surface cannot reasonably use `.agents/skills/`
- users need first-class passive probing and injection for that surface
- run metadata would become clearer with an explicit profile name

Otherwise, prefer the `agents` profile and document the client as compatible
with the shared Agent Skills layout.
