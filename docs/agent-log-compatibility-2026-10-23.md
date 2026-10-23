# Agent Execution Log Compatibility Recheck: 2026-10-23

Status: investigation complete; Gemini shell-outcome correction remains open.

## Scope

Tested the SkillTrace 0.3.3 development checkout after dependency update commit
`518e033`, on macOS with Node 22.23.4 and the development database at
`data/local/dev.db`. Each agent received a separate disposable copy of
`examples/type-fix-demo`, with its own Git root, under `tmp/compat-2026-10-23-*`.
The preexisting `tmp/type-fix-demo` was preserved.

The installed clients were Codex CLI 0.145.0, Claude Code 2.1.218, and Gemini CLI
0.46.0. These trials do not establish compatibility with newer CLI releases.
No agent upgrade, global MCP registration change, or adapter change was made.

The common task was to fix the demo using its type-fix skill and checklist,
run `npm run tsc` before and after, and follow SkillTrace instrumentation.
Runs used `skilltrace-dev run --keep-on-error` so startup failures remained
inspectable. Successful agents repaired the source and the wrapper stopped
each trace and removed its temporary instrumentation.

## Results

| Client / recorded model | Positive log reads | Log operations | Match / completeness | Other streams | Consistency |
| --- | --- | --- | --- | --- | --- |
| Codex / `gpt-5.6-sol` | 0; two context-only file reads | 7 | High / explicit complete | Passive, MCP, reflection present | Pass |
| Claude / `claude-sonnet-5` | 2 | 9 | High / stable at stop | Passive, MCP, reflection present | Pass |
| Gemini / `gemini-3.5-flash` | 2 | 8 | Medium / stable at stop | MCP and reflection present; no passive reads in final trial | Warning |

Representative run IDs are recorded in the
[validation ledger](./tested-clients-and-models.md). Their detail pages returned
HTTP 200 with Timeline and Agent log sections. Consistency rows were checked
using the application matrix function against stored events. Visual inspection
of the pages remains a manual follow-up.

## Codex

The matched rollout used `custom_tool_call` records named `exec`, containing
JavaScript calls to `tools.exec_command` and `tools.apply_patch`. Existing static
extraction recovered two file reads, three typechecks, and two edits.

The skill and checklist reads used `text(r.output)`: their persisted output
contained file text but no process exit code. They correctly remained
`execution_operation_observed` events with `outcome: unknown`, producing amber
outlines in the Agent log column. The typechecks printed the complete result
object, allowing the adapter to recover `failed`, `failed`, and `success`.
Patch results were empty objects, so their outcomes also remained unknown.

The unsupported record was tool-registry discovery through `ALL_TOOLS`, not a
missed skill read. Five SkillTrace MCP calls were excluded as circular evidence.
The selected session, model, client version, and `codex_exec` client identity
matched the stored collection summary.

## Claude Code

The source used structured `Read`, `Bash`, and `Edit` calls correlated with
`tool_result` records. Both skill files produced positive read evidence. Nine
operations covered three ordinary file reads, three typechecks, and three edits.
The compiler outcomes were correctly recorded as failed, failed, and successful.

One `find` directory-listing command was outside the shell classifier's coverage.
`ToolSearch` was intentionally ignored, and five SkillTrace MCP calls were
excluded as circular evidence. Neither omission lost the observed skill reads
or compiler checks.

## Gemini CLI

The source retained the expected session header, timestamped message records,
structured `toolCalls`, and `$set` snapshots. The final trial recorded direct
`read_file` calls for the skill and checklist, ordinary file reads, `replace`
edits, and `run_shell_command` typechecks. No unsupported calls were reported;
five SkillTrace MCP calls were excluded as circular evidence.

The selected session was correct, but matching confidence was medium: the
matching code checks explicit `run_id` tool arguments, while this agent relied
on MCP active-session resolution. The returned run ID appearing in tool results
does not currently upgrade that match. Gemini's log did not provide a CLI
version; 0.46.0 was verified separately with `gemini --version`.

### Open Bug: Tool Success Is Not Command Success

Both Gemini trials demonstrated this shape in the actual source:

```json
{
  "name": "run_shell_command",
  "args": { "command": "npm run tsc" },
  "status": "success",
  "result": [{
    "functionResponse": {
      "name": "run_shell_command",
      "response": {
        "output": "Output: <compiler diagnostics>\nExit Code: 2\nProcess Group PGID: <pid>"
      }
    }
  }]
}
```

This is a sanitized structural example, not retained raw compiler output.
`status: success` means the tool completed; the child command still failed.
The current adapter uses only `call.status`, so all three typecheck operations
were stored as successful. The final successful command omitted the `Exit Code`
line altogether. The existing synthetic test fixture covers tool-level failure
but does not catch this successful-tool/failed-command combination.

The next correction should distinguish tool completion from shell command
outcome, extract supported exit metadata conservatively, and keep unknown
outcomes when command success cannot be established. Add sanitized regression
coverage for nonzero exit, zero exit, and missing exit metadata. Do not persist
raw command output to solve this problem. Existing run records will retain their
original outcomes unless explicitly reprocessed; a fresh run should verify the
correction.

### Passive Observation Gap

The first Gemini trial (`compat-2026-10-23-gemini-ap2mCz-2026-10-23-13-23-05`)
captured passive reads and log reads, but MCP was unavailable. The final trial
captured MCP, reflection, and log reads, but no passive events. The shared probe
log confirms attachment and detachment for the final run, with no read events
between them. Its deduplication key includes the run ID, so this is not explained
by a shared cross-run deduplication key. The cause remains unverified.

The final consistency warning is appropriate: positive Agent log evidence must
not fill in missing passive evidence or change the verdict. This trial does not
establish reliable four-stream capture for Gemini.

## Setup Findings

- The generated `skilltrace-dev` wrapper referenced a removed Node 22.14.0
  executable. `pnpm skilltrace:install` refreshed it to the current runtime.
- The developer restarted the dev daemon with terminal-based sudo authorization
  for the shared macOS probe. The daemon remains running for inspection.
- Codex's configured `gpt-5.5` failed before agent work because the account no
  longer accepted that model. The successful trial used the available
  `gpt-5.6-sol` via a per-command override; global configuration was preserved.
- A child Codex inherits `CODEX_INTERNAL_ORIGINATOR_OVERRIDE` from Codex App.
  Clearing it only for the test invocation produced `codex_exec` rather than a
  misleading Desktop client label.
- Claude's variadic `--mcp-config` option consumed the prompt on the first
  attempt. A `--` separator fixed the invocation. Authentication worked with
  normal local keychain access.
- Gemini's first `--skip-trust` trial did not expose MCP tools. With
  `GEMINI_CLI_TRUST_WORKSPACE=true` set before startup, `gemini mcp list`
  connected and the subsequent run emitted all five expected MCP calls. Trust
  was scoped to these invocations. The MCP override lives only in the demo's
  `.gemini/settings.json`.
- Gemini warned that `--allowed-tools` is deprecated. Future automation should
  use its policy engine. Codex also emitted model-cache/plugin compatibility
  warnings; the successful task and log import still completed.

No credentials, reasoning text, or full source transcripts were copied into
repository documentation. Historical runs and startup-failure traces were not
deleted or rewritten.
