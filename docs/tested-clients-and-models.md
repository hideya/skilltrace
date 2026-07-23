# Tested Clients And Models

Status: living compatibility and validation ledger, current through 2026-07-23

This document records concrete SkillTrace trials by agent client, client
version, model recorded in the agent execution log, instruction profile, and
validation scope. It is a compatibility ledger, not a model benchmark or a
claim that one successful run proves general behavior.

Identity recorded in agent execution logs is preferred when available.
Agent-declared identity is not used here unless it is explicitly marked
uncertain. Client-owned execution-log formats can change independently of the
model, so observed behavioral differences should be treated as clues for skill
debugging rather than causal model comparisons.

All rows below were exercised on one macOS machine. Linux support exists for
passive probing, but these client/model combinations have not yet been entered
as Linux validation rows.

## Validation Levels

| Level | Meaning |
| --- | --- |
| End-to-end | `skilltrace start`, agent work, MCP/passive tracing, `skilltrace stop`, execution-log collection, storage, and UI inspection were exercised |
| Execution-log | Matching, privacy projection, normalized events, collection summary, and UI identity were exercised against a real session |
| Format inspection | A real agent log file was inspected safely, but the complete current workflow was not validated for that combination |

## Supported Workflow Matrix

| Client or agent system | Instruction profile | MCP workflow | Execution-log adapter | Current status |
| --- | --- | --- | --- | --- |
| Codex CLI | `agents` | Tested | Tested | Supported command-line workflow |
| Claude Code CLI | `claude_code` | Tested | Tested | Supported command-line workflow |
| Gemini CLI | `agents` | Tested | Tested | Supported command-line workflow |
| Codex Desktop/App | Not established as a supported workflow | Not validated end-to-end | Codex rollout records recognized | Execution-log observation only; Codex App remains unsupported |

## Client And Model Validation Matrix

| Date | Client | Client version | Model recorded in agent log | Profile | Level | Representative run | Result and notable coverage |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-23 | Codex CLI | `0.143.0` | `gpt-5.6-sol` | `agents` | Execution-log | `type-fix-demo-ks2l3r-2026-07-23-06-00-21` | High-confidence match; seven normalized operations recovered from the newer nested `custom_tool_call: exec` envelope |
| 2026-07-23 | Codex Desktop | `0.145.0-alpha.18` | `gpt-5.6-sol` | `agents` | Execution-log | `type-fix-demo-U44e2p-2026-07-23-11-36-52` | High-confidence match; five context-only operations reached the UI, including explicit skill/reference file-read targets without correlated successful outcomes |
| 2026-07-23 | Claude Code | `2.1.218` | `claude-sonnet-5` | `claude_code` | End-to-end | `type-fix-demo-U44e2p-2026-07-23-12-07-05` | Four evidence streams; two execution-log skill/reference events, seven operations, stable source, and high-confidence match |
| 2026-07-23 | Gemini CLI | `0.46.0` | `gemini-3.5-flash` | `agents` | End-to-end | `type-fix-demo-U44e2p-2026-07-23-12-47-54` | High-confidence stable match; the first-pass adapter exposed structured `activate_skill` but did not yet promote it, leaving the skill entrypoint without positive execution-log evidence |
| 2026-07-23 | Gemini CLI | `0.46.0` | `gemini-3.5-flash` | `agents` | End-to-end | `type-fix-demo-U44e2p-2026-07-23-12-54-17` | Three execution-log evidence events and ten operations; recorded both activation and a separate direct skill read with no unsupported calls or warnings |

## Additional Format Observations

| Date | Client | Client version | Model identity | Level | Observation |
| --- | --- | --- | --- | --- | --- |
| 2026-07-23 | Codex CLI | `0.143.0` | GPT-5.5 family label from the selected rollout | Format inspection | Operations appeared as direct `function_call` envelopes such as `exec_command` |
| 2026-07-23 | Claude Code | `2.1.198` | Not reliably catalogued | Format inspection | Contributed to the initial Claude session-shape and privacy-boundary inspection |

The GPT-5.5 and GPT-5.6 Codex files used the same recorded client version but
different tool-envelope shapes. That association does not prove the model
caused the format change; a concurrent client protocol rollout is also
plausible.

## What The Matrix Does Not Claim

- It does not rank models or clients.
- It does not generalize behavior from the small type-fix fixture.
- It does not treat task success as proof that the intended skill caused the
  result.
- It does not treat agent-declared model names as authoritative when a matched
  execution log disagrees.
- It does not imply support for Codex App merely because Codex Desktop rollout
  records can be parsed.
- It does not guarantee future compatibility with client-owned execution-log
  formats.

## Update Policy

Add or revise a row when a materially distinct client version, model recorded in
an agent execution log, instruction profile, platform, or log envelope is
exercised.

For each row:

1. Prefer client and model identity recorded in the matched agent execution log.
2. Record the date and one representative SkillTrace run ID.
3. State the validation level rather than using a generic "tested" label.
4. Note meaningful evidence coverage, ambiguity, unsupported calls, or format
   drift.
5. Keep behavioral observations descriptive and avoid attributing causality to
   a model without stronger evidence.

Detailed client-owned formats and privacy dispositions remain in
[Agent Execution Log Formats](./provider-history-formats.md). The repeatable demo
procedure remains in
[Type Fix Demo MCP Test](./type-fix-demo-mcp-test.md).
